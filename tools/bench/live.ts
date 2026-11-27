// The live benchmark (docs/development/performance.md): the real Claude Code in a pseudo-terminal, ghostframe on (its
// pane docked) and off, resuming the 1,000-row long session, a local stand-in for the Messages API streaming each
// turn. Every run gets a throwaway config folder (CLAUDE_CONFIG_DIR): no login, no plugins of the person's, the same
// for on and off but for ghostframe. It measures what only a real session shows: start to the pane's first draw, idle
// CPU, a key's time to the screen, a scroll, a streamed turn, memory over ten minutes, and each ghostframe hook's
// calls per second in each (from the engine's debug log, which logs every dispatch).
//
//   bun tools/bench/live.ts                 every scenario, 280 × 70 and 120 × 40, on and off
//   bun tools/bench/live.ts --memory        also the ten-minute memory run
//   bun tools/bench/live.ts --sizes 120x40  one size
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildRepo, SESSION_ID, writeSession } from './fixtures.ts'
import { REPLY, startMockApi } from './mockapi.ts'
import { Pty, sleep } from './pty.ts'

const REPO = resolve(import.meta.dirname, '..', '..')
const CLAUDE = process.env['BENCH_CLAUDE'] ?? (process.platform === 'win32' ? 'claude.exe' : 'claude')
const SMALL = process.env['BENCH_REPO_SMALL'] ?? join(process.platform === 'win32' ? 'D:\\Projects' : tmpdir(), 'ghostframe-perf-lite')
const BIG = process.env['BENCH_REPO'] ?? join(process.platform === 'win32' ? 'D:\\Projects' : tmpdir(), 'ghostframe-perf-repo')

export type Mode = 'on' | 'off'
type Size = { cols: number; rows: number }

const q = (ms: readonly number[], at: number): number => {
  const s = ms.toSorted((a, b) => a - b)

  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(at * s.length) - 1))] ?? 0
}

/** The process's CPU time and working set, from the system. */
function usage(pid: number): { cpuMs: number; rssMb: number } {
  if (process.platform === 'linux') {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.split(' ') ?? []
    const ticks = Number(stat[11]) + Number(stat[12])
    const rss = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]

    return { cpuMs: (ticks * 1000) / 100, rssMb: Number(rss) / 1024 }
  }
  const ps = process.platform === 'win32' ? 'pwsh' : 'ps'
  const r =
    process.platform === 'win32'
      ? spawnSync(ps, ['-NoProfile', '-Command', `$p = Get-Process -Id ${pid}; "$($p.TotalProcessorTime.TotalMilliseconds) $($p.WorkingSet64)"`], {
          encoding: 'utf8'
        })
      : spawnSync(ps, ['-o', 'time=,rss=', '-p', String(pid)], { encoding: 'utf8' })
  const [a, b] = r.stdout.trim().split(/\s+/)

  if (process.platform === 'win32') return { cpuMs: Number(a), rssMb: Number(b) / 1024 / 1024 }
  const [m, s] = (a ?? '0:0').split(':')

  return { cpuMs: (Number(m) * 60 + Number(s)) * 1000, rssMb: Number(b) / 1024 }
}

/** A throwaway config folder: onboarding done, the repos trusted, ghostframe loaded or not. */
function configFor(mode: Mode, probe: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), `gf-bench-${mode}-`))
  const trusted = Object.fromEntries([SMALL, BIG].flatMap(r => [r, r.replaceAll('\\', '/')]).map(r => [r, { hasTrustDialogAccepted: true }]))
  const dirs = [...(mode === 'on' ? [REPO] : []), ...(probe ? [join(REPO, 'tools', 'perf', 'probe')] : [])]

  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, theme: 'dark', projects: trusted }))
  writeFileSync(
    join(dir, 'settings.json'),
    JSON.stringify({
      env: {
        ...(dirs.length > 0 ? { CLAUDE_CODE_PLUGIN_DIRS: dirs.join(process.platform === 'win32' ? ';' : ':') } : {}),
        GHOSTFRAME_COCKPIT: '1',
        ...(probe ? { GHOSTFRAME_PERF: '1' } : {})
      },
      ...(probe ? { prependPlugins: ['ghostframe-perf@inline'] } : {})
    })
  )

  return dir
}

/**
 * Waits for the composer's prompt and, ghostframe on, for its pane: docked unasked from 144 columns; below that the
 * session opens it as a person does, with `/cockpit` (an asked open docks from 110).
 * @returns when the prompt was first drawn
 */
async function ready(pty: Pty, mode: Mode, cols: number): Promise<number> {
  const prompt = await pty.waitFor(t => /^❯/m.test(t), 90_000, 'the first prompt')

  if (mode === 'on' && cols < 144) {
    await pty.waitQuiet(1_000, 10_000)
    pty.write('/cockpit')
    await sleep(300)
    pty.write('\r')
  }
  if (mode === 'on') await pty.waitFor(t => /TIMELINE/.test(t), 30_000, 'the pane')

  return prompt
}

/** One dispatch the debug log recorded for ghostframe: when, what, how long. */
type Dispatch = { at: number; hook: string; ms: number }

/**
 * What a render's key names: the debug log keys a site by its instance, so a transcript row reads as its message's
 * id and a tool row as its call's; the pane, the band and the prompt's parts by their own names.
 */
const kindOf = (key: string): string =>
  key.startsWith('toolu_') ? 'tool row' : /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(key) ? 'transcript row' : key.startsWith('notice:') ? 'notice' : key

/** Every ghostframe dispatch in a debug log, and the times of its markers. */
function readLog(file: string): { dispatches: Dispatch[]; started?: number; paneDrawn?: number } {
  const text = readFileSync(file, 'utf8')
  const dispatches: Dispatch[] = []
  let started: number | undefined
  let paneDrawn: number | undefined

  for (const line of text.split('\n')) {
    const at = Date.parse(line.slice(0, 24))

    if (Number.isNaN(at)) continue
    if (started === undefined && line.includes('session.start: raised')) started = at
    const m = /hooks module ([^ ]*ghostframe@inline[^ ]*(?:, [^ ]+)*) ([a-z.]+(?: stream)?) settled in ([\d.]+)ms[^\n]*?(?:key=(\S+))?\s*$/.exec(line)

    if (m === null) continue
    const event = m[2] ?? ''
    const key = m[4] ?? ''

    if (paneDrawn === undefined && event === 'ui.render' && key === 'cockpit') paneDrawn = at
    dispatches.push({ at, hook: event === 'ui.render' ? `ui.render ${kindOf(key)}` : event, ms: Number(m[3]) })
  }

  return { dispatches, ...(started === undefined ? {} : { started }), ...(paneDrawn === undefined ? {} : { paneDrawn }) }
}

/** Calls per second of each ghostframe hook in a window of the log. */
function ratesIn(dispatches: readonly Dispatch[], from: number, to: number): Record<string, { perSec: number; wallP95: number }> {
  const by = new Map<string, number[]>()

  for (const d of dispatches) if (d.at >= from && d.at <= to) by.set(d.hook, [...(by.get(d.hook) ?? []), d.ms])
  const secs = Math.max(0.001, (to - from) / 1000)

  return Object.fromEntries([...by].map(([hook, ms]) => [hook, { perSec: ms.length / secs, wallP95: q(ms, 0.95) }]))
}

export type LiveResult = {
  mode: Mode
  size: string
  repo: string
  startToPromptMs: number
  sessionStartToPaneMs: number | null
  idleCpuPct: number
  keyFirstP50: number
  keyFirstP95: number
  keyDoneP95: number
  scrollDoneP95: number
  streamWallMs: number
  streamCpuMs: number
  scriptCpuMs: number
  scriptWallMs: number
  rssMb: number
  rates: Record<string, Record<string, { perSec: number; wallP95: number }>>
}

/**
 * One session's scripted run: start, idle, typing, scrolling, a streamed turn.
 * @param mode ghostframe on or off
 * @param size the terminal
 * @param repo the folder it runs in
 */
export async function runSession(mode: Mode, size: Size, repo: string): Promise<LiveResult> {
  const config = configFor(mode, false)
  const api = startMockApi()
  const log = join(config, 'debug.log')
  writeSession(repo, config)
  const t0 = performance.now()
  const pty = new Pty({
    claude: CLAUDE,
    args: ['--resume', SESSION_ID, '--debug-file', log],
    cwd: repo,
    cols: size.cols,
    rows: size.rows,
    env: { CLAUDE_CONFIG_DIR: config, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_AUTH_TOKEN: 'bench', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
  })
  const marks: Record<string, [number, number]> = {}
  const wall = (): number => Date.now()

  try {
    const prompt = await ready(pty, mode, size.cols)
    const startToPromptMs = prompt - t0

    await pty.waitQuiet(2_000, 20_000)
    const cpu0 = usage(pty.pid).cpuMs

    // Idle: nothing typed, nothing streaming.
    let from = wall()
    const idle0 = usage(pty.pid).cpuMs
    await sleep(30_000)
    const idleCpuPct = ((usage(pty.pid).cpuMs - idle0) / 30_000) * 100
    marks['idle'] = [from, wall()]

    // Typing: 60 keys, each timed to the screen's answer.
    from = wall()
    const keys: { first: number; done: number }[] = []
    for (const ch of 'the width check counts grapheme clusters now, run it again ok') keys.push(await pty.timed(ch, 40))
    marks['typing'] = [from, wall()]
    for (let i = 0; i < 70; i++) pty.write('\x7f')
    await pty.waitQuiet(500, 5_000)

    // Scrolling: page up and down through the transcript.
    from = wall()
    const scrolls: number[] = []
    for (let i = 0; i < 10; i++) scrolls.push((await pty.timed('\x1b[5~', 80)).done)
    for (let i = 0; i < 10; i++) scrolls.push((await pty.timed('\x1b[6~', 80)).done)
    marks['scrolling'] = [from, wall()]
    await pty.waitQuiet(500, 5_000)

    // Streaming: one turn, the stand-in streaming its reply; done when the reply's last words are drawn and the
    // screen holds still.
    from = wall()
    const s0 = performance.now()
    const sc0 = usage(pty.pid).cpuMs
    pty.write('show what changed\r')
    const tail = REPLY.split('\n').at(-1)?.slice(0, 30) ?? ''
    await pty.waitFor(t => t.replace(/\s+/g, ' ').includes(tail), 120_000, 'the streamed reply')
    await pty.waitQuiet(1_500, 30_000)
    const streamWallMs = performance.now() - s0 - 1_500
    const streamCpuMs = usage(pty.pid).cpuMs - sc0
    marks['streaming'] = [from, wall()]

    const end = usage(pty.pid)
    const scriptWallMs = performance.now() - t0
    await pty.close()
    const parsed = readLog(log)

    return {
      mode,
      size: `${size.cols}x${size.rows}`,
      repo,
      startToPromptMs,
      sessionStartToPaneMs: parsed.started !== undefined && parsed.paneDrawn !== undefined ? parsed.paneDrawn - parsed.started : null,
      idleCpuPct,
      keyFirstP50: q(
        keys.map(k => k.first),
        0.5
      ),
      keyFirstP95: q(
        keys.map(k => k.first),
        0.95
      ),
      keyDoneP95: q(
        keys.map(k => k.done),
        0.95
      ),
      scrollDoneP95: q(scrolls, 0.95),
      streamWallMs,
      streamCpuMs,
      scriptCpuMs: end.cpuMs - cpu0,
      scriptWallMs,
      rssMb: end.rssMb,
      rates: Object.fromEntries(Object.entries(marks).map(([k, [a, b]]) => [k, ratesIn(parsed.dispatches, a, b)]))
    }
  } finally {
    await pty.close()
    void api.server.stop(true)
  }
}

/**
 * Ten minutes of a session, with a turn streamed every two minutes and a key typed every ten seconds between them: its
 * working set sampled every 30 s.
 */
export async function runMemory(mode: Mode, size: Size, repo: string): Promise<{ mode: Mode; samples: { atS: number; rssMb: number }[]; growthMb: number }> {
  const config = configFor(mode, false)
  const api = startMockApi()
  writeSession(repo, config)
  const pty = new Pty({
    claude: CLAUDE,
    args: ['--resume', SESSION_ID],
    cwd: repo,
    cols: size.cols,
    rows: size.rows,
    env: { CLAUDE_CONFIG_DIR: config, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_AUTH_TOKEN: 'bench', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
  })
  const samples: { atS: number; rssMb: number }[] = []

  try {
    await ready(pty, mode, size.cols)
    const t0 = performance.now()

    for (let s = 0; s <= 600; s += 10) {
      if (s % 30 === 0) samples.push({ atS: s, rssMb: usage(pty.pid).rssMb })
      if (s % 120 === 60) pty.write(`turn at ${s} s\r`)
      else pty.write('x\x7f')
      await sleep(Math.max(0, t0 + (s + 10) * 1000 - performance.now()))
    }
  } finally {
    await pty.close()
    void api.server.stop(true)
  }
  const at = (s: number): number => samples.find(x => x.atS >= s)?.rssMb ?? Number.NaN

  return { mode, samples, growthMb: at(600) - at(60) }
}

/**
 * One session with the profiler above ghostframe: each scenario's own time per hook, saved by `/ghostframe perf save`
 * after it. The probe passes every event through its own worker, so this run's totals are not ghostframe's cost: its
 * per-hook times and rates are what it is for.
 */
export async function runProbe(size: Size, repo: string): Promise<Record<string, unknown>> {
  const config = configFor('on', true)
  const api = startMockApi()
  writeSession(repo, config)
  const pty = new Pty({
    claude: CLAUDE,
    args: ['--resume', SESSION_ID],
    cwd: repo,
    cols: size.cols,
    rows: size.rows,
    env: { CLAUDE_CONFIG_DIR: config, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_AUTH_TOKEN: 'bench', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
  })
  const out: Record<string, unknown> = {}
  const command = async (text: string, done: RegExp | (() => boolean)): Promise<void> => {
    for (const ch of text) {
      pty.write(ch)
      await sleep(5)
    }
    await sleep(300)
    pty.write('\r')
    await pty.waitFor(t => (typeof done === 'function' ? done() : done.test(t)), 20_000, text)
    await pty.waitQuiet(500, 5_000)
  }
  const save = async (name: string): Promise<void> => {
    const file = join(config, `perf-${name}.json`)

    // Cockpit folds the command's answer row, so the file is the sign it ran.
    await command(`/ghostframe perf save ${file}`, () => existsSync(file))
    out[name] = JSON.parse(readFileSync(file, 'utf8'))
    await command('/ghostframe perf reset', /counts reset/)
  }

  try {
    await ready(pty, 'on', size.cols)
    await pty.waitQuiet(2_000, 20_000)
    await command('/ghostframe perf reset', /counts reset/)
    await sleep(30_000)
    await save('idle')
    for (const ch of 'the width check counts grapheme clusters now, run it again ok') await pty.timed(ch, 40)
    for (let i = 0; i < 70; i++) pty.write('\x7f')
    await pty.waitQuiet(500, 5_000)
    await save('typing')
    for (let i = 0; i < 10; i++) await pty.timed('\x1b[5~', 80)
    for (let i = 0; i < 10; i++) await pty.timed('\x1b[6~', 80)
    await save('scrolling')
    pty.write('show what changed\r')
    const tail = REPLY.split('\n').at(-1)?.slice(0, 30) ?? ''
    await pty.waitFor(t => t.replace(/\s+/g, ' ').includes(tail), 120_000, 'the streamed reply')
    await pty.waitQuiet(1_500, 30_000)
    await save('streaming')
  } finally {
    await pty.close()
    void api.server.stop(true)
  }

  return { size: `${size.cols}x${size.rows}`, repo, probe: out }
}

if (import.meta.main) {
  const args = process.argv.slice(2)

  if (args.includes('--memory-only')) {
    for (const mode of ['off', 'on'] as const) console.log(`BENCH ${JSON.stringify({ memory: await runMemory(mode, { cols: 280, rows: 70 }, SMALL) })}`)
    process.exit(0)
  }
  if (args.includes('--probe')) {
    const r = await runProbe({ cols: 280, rows: 70 }, SMALL)

    console.log(`BENCH ${JSON.stringify(r)}`)
    process.exit(0)
  }
  const sizes = (args[args.indexOf('--sizes') + 1] ?? '280x70,120x40').split(',').map(s => {
    const [c, r] = s.split('x').map(Number)

    return { cols: c ?? 280, rows: r ?? 70 }
  })
  const out = join(mkdtempSync(join(tmpdir(), 'gf-live-')), 'live.json')

  mkdirSync(SMALL, { recursive: true })
  buildRepo(SMALL, { untracked: 0, binaries: 0 })
  buildRepo(BIG)
  const results: unknown[] = []

  for (const size of sizes) {
    for (const mode of ['off', 'on'] as const) {
      const r = await runSession(mode, size, SMALL)

      results.push(r)
      console.log(`BENCH ${JSON.stringify({ live: r })}`)
    }
  }
  // The big repo: start and one turn, ghostframe on and off.
  for (const mode of ['off', 'on'] as const) {
    try {
      const r = await runSession(mode, sizes[0] ?? { cols: 280, rows: 70 }, BIG)

      results.push(r)
      console.log(`BENCH ${JSON.stringify({ live: r })}`)
    } catch (error: unknown) {
      console.log(`BENCH ${JSON.stringify({ live: { mode, repo: BIG, error: String(error).slice(0, 400) } })}`)
    }
  }
  if (args.includes('--memory')) {
    for (const mode of ['off', 'on'] as const) {
      const r = await runMemory(mode, sizes[0] ?? { cols: 280, rows: 70 }, SMALL)

      results.push(r)
      console.log(`BENCH ${JSON.stringify({ memory: r })}`)
    }
  }
  writeFileSync(out, JSON.stringify(results, null, 2))
  console.log(`saved ${out}`)
  process.exit(0)
}

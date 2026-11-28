// The benchmark suite (docs/development/performance.md): runs the harness benchmark over the long-session fixture,
// the status line's timings and, with --live, the real session; then holds every number to its budget
// (tools/bench/budgets.ts) and prints the report. It reports and exits 0 unless --strict, where a broken budget
// exits 1.
//
//   bun tools/bench/run.ts                     harness and status line
//   bun tools/bench/run.ts --live [--memory]   and the real session (and its ten-minute memory run)
//   bun tools/bench/run.ts --strict            exit 1 when a budget breaks
//   --harness-log <file>, --live-log <file>      judge the output of runs already made instead of running them
//   --plugin <dir>    measure the plugin (manifest, hooks, types, statusline) in another checkout with this harness
//   --on-only         the harness's Cockpit-on configs alone, and the status line's installed form alone
//   --report <file>   also write the report's JSON there
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { BUDGETS, CI_HEADROOM, limitOf, type BudgetName } from './budgets.ts'
import { buildRepo } from './fixtures.ts'
import { runInRoot } from './root.ts'
import { measureStatusline } from './statusline.ts'

const REPO = resolve(import.meta.dirname, '..', '..')
const args = process.argv.slice(2)
const isCi = process.env['CI'] === 'true'
const argOf = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const harnessLog = argOf('--harness-log')
const liveLog = argOf('--live-log')
const plugin = resolve(argOf('--plugin') ?? REPO)
const isOnOnly = args.includes('--on-only')

type Hook = { hook: string; calls: number; p50: number; p95: number; max: number; total: number; overlapped: number; perSec: number }
type Phase = { config: string; phase: string; wallMs: number; hooks: Hook[] } & Record<string, unknown>

/** Every `BENCH {…}` line a run printed, parsed. */
const benchLines = (output: string): Record<string, unknown>[] =>
  output
    .split('\n')
    .filter(l => l.startsWith('BENCH '))
    .map(l => JSON.parse(l.slice(6)) as Record<string, unknown>)

/** One budget checked: the measure, its value, the limit, and whether it held. */
type Check = { budget: BudgetName; measure: string; value: number | null; limit: number; ok: boolean }

const checks: Check[] = []
const check = (budget: BudgetName, measure: string, value: number | null): void => {
  const limit = limitOf(budget, isCi)

  checks.push({ budget, measure, value, limit, ok: value !== null && Number.isFinite(value) && value <= limit })
}

// The harness: the long session, Cockpit on and off.
const harness =
  harnessLog === undefined
    ? runInRoot(
        ['tests/bench/session.bench.tsx', 'tests/bench/only.ts'],
        {},
        plugin,
        isOnOnly ? { 'tests/bench/only.ts': "export const ONLY: readonly string[] = ['on-280x70', 'on-120x40']\n" } : {}
      )
    : { status: 0, output: readFileSync(harnessLog, 'utf8'), root: mkdtempSync(join(tmpdir(), 'ghostframe-bench-')) }
const phases = benchLines(harness.output) as Phase[]

if (harness.status !== 0)
  console.log(
    `harness benchmark exited ${harness.status}:\n${harness.output
      .split('\n')
      .filter(l => /\(fail\)|Error/.test(l))
      .slice(0, 10)
      .join('\n')}`
  )
const phaseOf = (config: string, name: string): Phase | undefined => phases.find(p => p.config === config && p.phase === name)
const hookOf = (p: Phase | undefined, hook: string): Hook | undefined => p?.hooks.find(h => h.hook === hook)

for (const config of ['on-280x70', 'on-120x40']) {
  const keys = phaseOf(config, 'keystroke')

  check(
    'keystroke',
    `${config}: AbovePrompt + PromptHint p95 per key`,
    keys === undefined ? null : (hookOf(keys, 'ui.render AbovePrompt')?.p95 ?? 0) + (hookOf(keys, 'ui.render PromptHint')?.p95 ?? 0)
  )
  for (const h of phaseOf(config, 'redraw-unchanged')?.hooks.filter(x => x.hook.startsWith('ui.render ')) ?? []) {
    check('unchangedRow', `${config}: ${h.hook} unchanged, p95`, h.p95)
  }
  check('pane', `${config}: ui.render Pane p95`, hookOf(phaseOf(config, 'pane'), 'ui.render Pane')?.p95 ?? null)
  for (const name of ['stream', 'turn-step']) {
    for (const h of phaseOf(config, name)?.hooks.filter(x => x.hook === 'turn.step' || x.hook.startsWith('tool.call')) ?? []) {
      check('eventHook', `${config} ${name}: ${h.hook} p95`, h.calls > h.overlapped ? h.p95 : null)
    }
  }
}

// The status line: the form `/ghostframe-statusline install` writes, cold and warm, in each repo. BENCH_REPO is the
// 40,000-file fixture, built here first on a fresh checkout (a no-op when it is already built), since git runs in it.
const bigRepo = process.env['BENCH_REPO']

if (bigRepo !== undefined && !args.includes('--no-statusline')) buildRepo(bigRepo)
const statusline = args.includes('--no-statusline')
  ? []
  : measureStatusline([REPO, ...(bigRepo === undefined ? [] : [bigRepo])], plugin, isOnOnly ? ['bun statusline.js (installed today)'] : undefined)
// Named by kind, not path, so a comparison of two checkouts lines the same measure up.
const repoName = (repo: string): string => (repo === bigRepo ? 'the 40,000-file repo' : 'this repo')

for (const s of statusline.filter(x => x.form.startsWith('bun statusline.js'))) {
  check('statusline', `${s.form}, cold p50 (${repoName(s.repo)})`, s.coldP50)
  check('statusline', `${s.form}, warm p50 (${repoName(s.repo)})`, s.warmP50)
}

// The real session.
type Live = { mode: string; size: string; repo: string; error?: string } & Record<string, number | null>
let live: Live[] = []
let memory: { mode: string; growthMb: number }[] = []

if (args.includes('--live') || liveLog !== undefined) {
  const text =
    liveLog === undefined
      ? Bun.spawnSync([process.execPath, join(import.meta.dirname, 'live.ts'), ...(args.includes('--memory') ? ['--memory'] : [])], {
          stdout: 'pipe',
          stderr: 'pipe'
        }).stdout.toString()
      : readFileSync(liveLog, 'utf8')
  const lines = benchLines(text)

  live = lines.filter(l => 'live' in l).map(l => l['live'] as Live)
  memory = lines.filter(l => 'memory' in l).map(l => l['memory'] as { mode: string; growthMb: number })
  for (const on of live.filter(l => l.mode === 'on' && l.error === undefined)) {
    const off = live.find(l => l.mode === 'off' && l.size === on.size && l.repo === on.repo && l.error === undefined)

    // Below 144 columns the pane opens only when asked (`/cockpit`, typed by the script), so its first draw is not the start's.
    if (Number(on.size.split('x')[0]) >= 144)
      check('firstDraw', `${on.size} ${on.repo}: session start to the pane's first draw`, on['sessionStartToPaneMs'] ?? null)
    if (off === undefined) continue
    check('idleCpu', `${on.size}: idle CPU over ghostframe off, % of a core`, (on['idleCpuPct'] ?? 0) - (off['idleCpuPct'] ?? 0))
    check('session', `${on.size}: scripted session CPU, on ÷ off`, (on['scriptCpuMs'] ?? 0) / Math.max(1, off['scriptCpuMs'] ?? 0))
    check('session', `${on.size}: streamed turn wall, on ÷ off`, (on['streamWallMs'] ?? 0) / Math.max(1, off['streamWallMs'] ?? 0))
  }
  for (const l of live.filter(x => x.error !== undefined))
    checks.push({ budget: 'session', measure: `${l.mode} ${l.repo}: ${l.error}`, value: null, limit: BUDGETS.session.limit, ok: false })
  const memOn = memory.find(x => x.mode === 'on')
  const memOff = memory.find(x => x.mode === 'off')

  if (memOn !== undefined && memOff !== undefined) check('memoryGrowth', 'growth, minute 1 to 10, over ghostframe off', memOn.growthMb - memOff.growthMb)
}

const fmt = (n: number | null): string => (n === null ? 'n/a' : n >= 100 ? n.toFixed(0) : n.toFixed(2))

console.log(`\n## Budgets${isCi ? ` (CI: time budgets × ${CI_HEADROOM})` : ''}\n`)
console.log('| | budget | measure | value | limit |')
console.log('| --- | --- | --- | ---: | ---: |')
for (const c of checks) console.log(`| ${c.ok ? 'ok' : 'OVER'} | ${c.budget} | ${c.measure} | ${fmt(c.value)} | ${fmt(c.limit)} ${BUDGETS[c.budget].unit} |`)

const out = join(harness.root, 'bench-report.json')
writeFileSync(out, JSON.stringify({ isCi, checks, phases, statusline, live, memory }, null, 2))
const report = argOf('--report')

if (report !== undefined) writeFileSync(report, readFileSync(out))
console.log(`\n${checks.filter(c => !c.ok).length} of ${checks.length} over budget. Full numbers: ${out}`)
if (process.env['GITHUB_STEP_SUMMARY'] !== undefined) {
  writeFileSync(
    process.env['GITHUB_STEP_SUMMARY'],
    checks.map(c => `| ${c.ok ? '✅' : '❌'} | ${c.budget} | ${c.measure} | ${fmt(c.value)} | ${fmt(c.limit)} |`).join('\n'),
    { flag: 'a' }
  )
}
process.exit(args.includes('--strict') && checks.some(c => !c.ok) ? 1 : 0)

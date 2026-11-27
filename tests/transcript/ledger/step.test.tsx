import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, posixPath } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { respond } from '../../support/respond'
import { use } from '../../support/docked'

// ghostframe's turn.step hook: one model response's stream (thinking, then text) drained through it. Its own work is
// a mode change written to the step log; nothing in it grows with the work tree or the session.
const LONG = { ...ON, timeoutMs: 120_000 }
const files = (n: number) => Array.from({ length: n }, (_, i) => `cache/d${Math.floor(i / 200)}/f${i % 200}.txt`)

function engine(on: On, clock: { now: number }, untracked: readonly string[]): void {
  // Git's answer, built once: the test's own work is not the hook's.
  const listing = untracked.map(p => `${p}\0`).join('')
  on('clock.now', () => ({ value: clock.now }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.log', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'm' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('session.info', () => ({ value: { platform: 'linux' } as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', () => {
    clock.now += 1_000

    return { result: { stdout: 'ok\n', stderr: '' }, text: 'ok' }
  })
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    if (argv.startsWith('git ls-files')) return { value: { exitCode: 0, stdout: listing, stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('fs.stat', (_, e) => ({ value: { kind: 'file', size: 25, mtimeMs: 1, isLink: false, realPath: posixPath(e.path) } }))
  on('fs.read', () => ({ value: 'line\n'.repeat(5) }))
  on('turn.step', async function* (_, e) {
    clock.now += 100
    yield { kind: 'thinking', index: 0, text: 'hm' }
    clock.now += 100
    yield { kind: 'text', index: 1, text: 'Running it.' }
    return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'tool_use', usage: null } as never
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

/** One response's stream drained through the hook; the wall time it took. */
async function step($: Engine, turnId: string): Promise<number> {
  const t = performance.now()

  for await (const _ of $.turn.step({ turnId, index: 0, model: 'm', messageCount: 1 })) {
    // drain
  }

  return performance.now() - t
}

async function started($: Engine, on: On, untracked: readonly string[]): Promise<void> {
  engine(on, { now: T0 }, untracked)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'go', turnId: 't1' })
}

test('40,000 untracked files, a shell call`s diff in flight: a response`s stream passes the hook in under 100 ms', LONG, async ($, on) => {
  await started($, on, files(40_000))
  const call = $.tool.call({ tool: 'Bash', command: 'bun run build', tool_use_id: 'b1' } as never)
  const ms = await step($, 't1')
  await call

  expect(ms).toBeLessThan(100)
})

test('a long session, 200 calls and their rows: a response costs the hook about the same at call 200 as at call 1', LONG, async ($, on) => {
  await started($, on, files(10))
  const at: number[] = []

  for (let i = 1; i <= 200; i++) {
    at.push(await step($, 't1'))
    await $.session.append(respond([{ type: 'text', text: `Step ${i}: reading file ${i}.` }, use(`c${i}`, 'Read', { file_path: `/repo/f${i}.ts` })], `r${i}`))
    await $.tool.call({ tool: 'Read', file_path: `/repo/f${i}.ts`, tool_use_id: `c${i}` } as never)
    await $.session.append(respond([{ type: 'text', text: `File ${i} has ${i} lines.` }], `a${i}`))
  }

  // The first ten and the last ten, by their medians: one slow draw on a busy runner moves neither.
  const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  const first = median(at.slice(0, 10))
  const last = median(at.slice(-10))

  // Flat, not growing: on a loaded runner a 4 ms response reads 20 ms at times, so the bound is 50 ms or 4 times the start.
  expect(last).toBeLessThan(Math.max(50, first * 4))
})

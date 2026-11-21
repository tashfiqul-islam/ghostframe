import { expect, test } from 'claude-code/testing'

import { endTurn, formatSpan, newLog, settleStep, startStep, stepRows } from '../hooks/steplog'
import type { Outcome, StepLog } from '../hooks/steplog'

const W = 72
const text = (log: StepLog, rows = 30, width = W) => stepRows(log, width, rows).map(row => row.map(p => p.t).join(''))

/** One step, started at `at` and settled at `at + ms`, on the turn clock of a turn that started at 0. */
function step(log: StepLog, id: string, tool: string, input: Record<string, unknown>, outcome: Outcome, at: number, ms = 500): StepLog {
  return settleStep(startStep(log, { id, tool, input, at }), { id, tool, input, outcome, at: at + ms })
}

const ok = (result: unknown, said = ''): Outcome => ({ result, text: said })
const failed = (said: string): Outcome => ({ isError: true, text: said })

test('time formats, as spec H.5', () => {
  expect([400, 12_000, 243_000, 4_320_000, 93_600_000].map(formatSpan)).toEqual(['0.4s', '12s', '4m 03s', '1h 12m', '1d 02h'])
})

test('a 10-step turn: each row appears when its step starts, settles once, and never moves', () => {
  const calls: [string, Record<string, unknown>, Outcome][] = [
    ['Read', { file_path: 'hooks/register.tsx' }, ok({ file: { numLines: 884 } })],
    ['Grep', { pattern: 'claim(', path: 'hooks' }, ok({ mode: 'count', numMatches: 14 })],
    ['Read', { file_path: 'hooks/grid.tsx', offset: 10, limit: 40 }, ok({ file: { numLines: 40 } })],
    ['Edit', { file_path: 'hooks/ledger.ts' }, ok({ structuredPatch: [{ lines: ['+a', '+b', '-c'] }] })],
    ['Write', { file_path: 'hooks/held.ts', content: 'a\nb\n' }, ok({ content: 'a\nb\n' })],
    ['Bash', { command: 'rg -n "claim(" hooks', description: 'Find claims' }, ok({ stdout: 'a\nhooks/x.ts:3: claim(k)\n' })],
    ['Bash', { command: 'git status --short' }, ok({ stdout: '' })],
    ['WebSearch', { query: 'Intl.Segmenter' }, ok({ results: [1, 2, 3] })],
    ['Glob', { pattern: '**/*.ts' }, ok({ numFiles: 12 })],
    ['Bash', { command: 'bun test' }, ok({ stdout: ' 191 pass\n 0 fail\n' })]
  ]
  let log = newLog('t1', 0)
  const seen: string[][] = []

  for (const [i, [tool, input, outcome]] of calls.entries()) {
    const id = `c${i}`
    const at = i * 10_000
    log = startStep(log, { id, tool, input, at })
    const started = text(log)
    // The new row is last, in progress; every row above is exactly as it was.
    expect(started.length).toBe(i + 2)
    expect(started.at(-1)).toMatch(/^▸ /)
    expect(started.at(-1)).toMatch(/running {2}/)
    expect(started.slice(1, -1)).toEqual(seen.at(-1)?.slice(1) ?? [])

    log = settleStep(log, { id, tool, input, outcome, at: at + 2_000 })
    const settled = text(log)
    expect(settled.slice(1, -1)).toEqual(started.slice(1, -1))
    expect(settled.at(-1)).not.toMatch(/running/)
    seen.push(settled)
  }

  const rows = seen.at(-1) ?? []
  expect(rows[0]).toMatch(/^┄ \[ STEPS \] ┄+ 10 steps$/)
  expect(rows.slice(1)).toEqual([
    '  read     hooks/register.tsx                         884 lines       2s',
    '  search   "claim(" in hooks                         14 matches      12s',
    '  read     hooks/grid.tsx:10-49                        40 lines      22s',
    '  edit     hooks/ledger.ts                                +2 −1      32s',
    '  write    hooks/held.ts                                     +2      42s',
    '  shell    rg -n "claim(" hooks                hooks/x.ts:3: c…      52s',
    '  shell    git status --short                             clean   1m 02s',
    '  web      "Intl.Segmenter"                           3 results   1m 12s',
    '  search   **/*.ts                                     12 files   1m 22s',
    // A first passing run is unmarked: `✓` is for the run that fixes a failure (E.39).
    '  test     bun test                                    191 pass   1m 32s'
  ])

  for (const row of rows) {
    expect(row.length).toBe(W)
    expect(row).not.toMatch(/\bok\b/)
  }
})

test('a 300-step turn fits the pane: `… n earlier` counts exactly the hidden rows, the newest fill the rest', () => {
  let log = newLog('t1', 0)
  const tools = ['Bash', 'Read', 'Edit'] as const

  for (let i = 0; i < 300; i++) {
    const tool = tools[i % 3] ?? 'Bash'
    const input = tool === 'Bash' ? { command: `echo ${i}` } : { file_path: `f${i}.ts` }
    const outcome = tool === 'Bash' ? ok({ stdout: `${i}\n` }) : tool === 'Read' ? ok({ file: { numLines: i } }) : ok({ structuredPatch: [{ lines: ['+x'] }] })
    log = step(log, `c${i}`, tool, input, outcome, i * 1_000)
  }

  const rows = text(log, 20)
  expect(rows.length).toBe(20)
  expect(rows[0]).toMatch(/ 300 steps$/)
  // Label, the earlier row, then the 18 newest steps.
  expect(rows[1]).toMatch(/^ {2}… 282 earlier · 94 shell · 94 read · 94 edit {2,}$/)
  expect(rows.at(-1)).toMatch(/^ {2}edit {5}f299\.ts/)
  expect(rows[2]).toMatch(/^ {2}shell {4}echo 282 /)

  // The window moves by one when a step starts.
  log = startStep(log, { id: 'c300', tool: 'Read', input: { file_path: 'last.ts' }, at: 400_000 })
  const next = text(log, 20)
  expect(next[1]).toMatch(/… 283 earlier/)
  expect(next.at(-1)).toMatch(/^▸ read {5}last\.ts/)
  expect(next.slice(2, -1)).toEqual(rows.slice(3))
})

test('a failure then a fix: ✕ while open and pinned above the window, ✓ on the run that fixes it, unpinned after', () => {
  let log = newLog('t1', 0)
  log = step(log, 'fail', 'Bash', { command: 'bun test width' }, failed('Exit code 1\n 12 pass\n 2 fail\n'), 0)

  for (let i = 0; i < 40; i++) {
    log = step(log, `r${i}`, 'Read', { file_path: `f${i}.ts` }, ok({ file: { numLines: 10 } }), 1_000 + i * 1_000)
  }

  let rows = text(log, 10)
  expect(rows[0]).toMatch(/ 41 steps · 1 failed$/)
  expect(rows[1]).toMatch(/… 33 earlier · 33 read/)
  expect(rows[2]).toMatch(/^✕ test {5}bun test width +2 of 14 fail +0\.5s$/)
  expect(rows.length).toBe(10)

  log = step(log, 'fix', 'Bash', { command: 'bun test width' }, ok({ stdout: ' 14 pass\n 0 fail\n' }), 60_000)
  rows = text(log, 10)
  expect(rows[0]).toMatch(/ 42 steps · 1 failed$/)
  expect(rows.at(-1)).toMatch(/^✓ test {5}bun test width +14 pass +1m 00s$/)
  // Fixed, so no longer pinned: the earlier row now also covers the failed run.
  expect(rows[1]).toMatch(/… 34 earlier · 33 read · 1 test/)
  expect(rows.some(r => r.startsWith('✕'))).toBe(false)
})

test('marks only where the spec puts them: ✕, ✓, ± commit, ↗ push and PR; a passing step has none', () => {
  let log = newLog('t1', 0)
  log = step(log, 'a', 'Bash', { command: 'git commit -m "x"' }, ok({ stdout: '[main 7be09d2a] x\n 1 file changed\n' }), 0)
  log = step(log, 'b', 'Bash', { command: 'git push -u origin fix/ci' }, ok({ stderr: ' * [new branch]      fix/ci -> fix/ci\n' }), 1_000)
  log = step(log, 'c', 'Bash', { command: 'gh pr create --fill' }, ok({ stdout: 'https://github.com/o/r/pull/12\n' }), 2_000)
  log = step(log, 'd', 'Bash', { command: 'ls missing' }, failed('Exit code 2\nls: missing: No such file'), 3_000)
  log = step(log, 'e', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 4_000)

  const rows = text(log).slice(1)
  expect(rows.map(r => r.slice(0, 2))).toEqual(['± ', '↗ ', '↗ ', '✕ ', '  '])
  expect(rows[0]).toMatch(/7be09d2 +0\.5s$/)
  expect(rows[1]).toMatch(/fix\/ci +1s$/)
  expect(rows[2]).toMatch(/PR #12 +2s$/)
  expect(rows[3]).toMatch(/exit 2 +3s$/)
})

test('a parallel agent launch is one row, `agent · 3 launched`, settled once when the last agent returns', () => {
  let log = newLog('t1', 0)
  log = step(log, 'r', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 0)

  for (const id of ['a1', 'a2', 'a3']) {
    log = startStep(log, { id, tool: 'Agent', input: { description: `Audit ${id}`, prompt: 'x' }, at: 1_000 })
  }

  let rows = text(log)
  expect(rows.length).toBe(3)
  expect(rows[2]).toMatch(/^▸ agent {4}3 launched +running +1s$/)

  log = settleStep(log, { id: 'a2', tool: 'Agent', input: {}, outcome: ok({}), at: 5_000 })
  log = settleStep(log, { id: 'a1', tool: 'Agent', input: {}, outcome: failed('agent failed'), at: 6_000 })
  rows = text(log)
  expect(rows[2]).toMatch(/^▸ agent {4}3 launched +running +1s$/)

  log = settleStep(log, { id: 'a3', tool: 'Agent', input: {}, outcome: ok({}), at: 9_000 })
  rows = text(log)
  // A failed agent is marked in [ AGENTS ], not here (amendment 1).
  expect(rows[2]).toMatch(/^ {2}agent {4}3 launched +2 done · 1 failed +9s$/)
  expect(rows[0]).toMatch(/ 2 steps$/)

  // A later agent is a new launch: its own row.
  log = startStep(log, { id: 'a4', tool: 'Agent', input: { description: 'One more', prompt: 'x' }, at: 10_000 })
  expect(text(log)[3]).toMatch(/^▸ agent {4}1 launched/)
})

test('a turn interrupted midway: the cut step reads `interrupted`, unmarked; nothing else is drawn (correction G)', () => {
  let log = newLog('t1', 0)
  log = step(log, 'a', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 0)
  log = step(log, 'b', 'Bash', { command: 'sleep 30' }, failed('[Request interrupted by user for tool use]'), 1_000, 4_000)
  log = startStep(log, { id: 'c', tool: 'Read', input: { file_path: 'b.ts' }, at: 6_000 })
  log = endTurn(log, 7_000)

  const rows = text(log)
  expect(rows.length).toBe(4)
  expect(rows[0]).toMatch(/ 3 steps$/)
  expect(rows[2]).toMatch(/^ {2}shell {4}sleep 30 +interrupted +5s$/)
  expect(rows[3]).toMatch(/^ {2}read {5}b\.ts +interrupted +7s$/)
  expect(rows.join('\n')).not.toMatch(/done|LAST|✕/)
})

test('narrow: at 40 columns an unmarked row drops its result, a marked one keeps it', () => {
  let log = newLog('t1', 0)
  log = step(log, 'a', 'Read', { file_path: 'ci log' }, ok({ file: { numLines: 212 } }), 3_500)
  log = step(log, 'b', 'Bash', { command: 'bun test width' }, failed('Exit code 1\n 12 pass\n 2 fail\n'), 40_500)
  const rows = text(log, 30, 40)
  // As spec E.39's 40-column mock.
  expect(rows[1]).toBe('  read     ci log                     4s')
  expect(rows[2]).toBe('✕ test     bun te… 2 of 14 fail      41s')
  for (const row of rows) expect(row.length).toBe(40)
})

const PANE = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'cockpit',
  props: { title: 'cockpit', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 42, contentRows: 42 }, view: {} },
  viewport: { columns: 127, rows: 50, isFullscreen: true }
} as const

// Cockpit is off by default; this test turns it on.
test('from tool.call to the pane: the main loop`s calls are the turn`s [ STEPS ]', { options: { cockpit: true } }, async ($, on) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: (now += 1_000) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { file: { numLines: 9 } }, text: 'ok' }))

  await $.turn.start({ text: 'read two files', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'r1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'b.ts', tool_use_id: 'r2' } as never)
  // A subagent's call is its own, not the main loop's step.
  await $.tool.call({ tool: 'Read', file_path: 'c.ts', tool_use_id: 'r3', agentId: 'x' } as never)

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /\[ STEPS \]/ }))?.text).toMatch(/2 steps$/)
  expect((await ui.find({ type: 'Text', text: /a\.ts/ }))?.text).toMatch(/^ {2}read {5}a\.ts +9 lines +\d+s$/)
  expect(await ui.find({ type: 'Text', text: /c\.ts/ })).toBeUndefined()
  await ui.unmount()

  // A new turn starts an empty log: no section until its first step.
  await $.turn.start({ text: 'next', turnId: 't2' })
  const fresh = await $.ui.mount(PANE)
  expect(await fresh.find({ type: 'Text', text: /\[ STEPS \]/ })).toBeUndefined()
  await fresh.unmount()
})

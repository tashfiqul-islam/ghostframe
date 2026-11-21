import { expect, test } from 'claude-code/testing'

import { addAgent, endAgent } from '../../hooks/cockpit/agents/roster'
import { paneRows } from '../../hooks/cockpit/head'
import { askStep, endTurn, newLog, newTurn, noteMode, noteSaid, settleStep, startStep } from '../../hooks/cockpit/steps/log'
import type { Outcome } from '../../hooks/cockpit/steps/log'
import type { RosterAgent, StepLog } from '../../types'
import { W, T0, failed } from '../support/cockpit'

const text = (log: StepLog, now: number, rows = 30) => paneRows(log, now, W, rows).map(row => row.map(p => p.t).join(''))
const ok = (result: unknown): Outcome => ({ result, text: '' })
function step(log: StepLog, id: string, tool: string, input: Record<string, unknown>, outcome: Outcome, at: number, ms = 1_000): StepLog {
  return settleStep(startStep(log, { id, tool, input, at: T0 + at }), { id, tool, input, outcome, at: T0 + at + ms })
}

const turnOne = () => newTurn(newLog(null, null), 't1', T0)

test('[ NOW ] while a step runs: the sentence, the step, its own clock; one blank row, then [ STEPS ]', () => {
  let log = turnOne()
  log = step(log, 'a', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 0)
  log = noteSaid(log, 'Running the width tests now. Then the fix.')
  log = startStep(log, { id: 'b', tool: 'Bash', input: { command: 'bun test width' }, at: T0 + 5_000 })

  const rows = text(log, T0 + 17_000)
  expect(rows[0]).toMatch(/^┄ \[ NOW \] ┄+ turn 1 · step 2$/)
  expect(rows[1]).toBe('▸ Running the width tests now.'.padEnd(W))
  expect(rows[2]).toMatch(/^ {2}test {5}bun test width +12s$/)
  expect(rows[3]).toBe(' '.repeat(W))
  expect(rows[4]).toMatch(/^┄ \[ STEPS \] ┄+ 2 steps$/)
  for (const row of rows) expect(row.length).toBe(W)
})

test('the running step`s clock ticks; nothing else in the pane changes', () => {
  let log = turnOne()

  for (let i = 0; i < 6; i++) log = step(log, `s${i}`, 'Read', { file_path: `f${i}.ts` }, ok({ file: { numLines: i } }), i * 2_000)

  log = startStep(log, { id: 'run', tool: 'Bash', input: { command: 'sleep 90' }, at: T0 + 20_000 })
  const before = text(log, T0 + 95_000)
  const after = text(log, T0 + 96_000)

  expect(before[2]).toMatch(/1m 15s$/)
  expect(after[2]).toMatch(/1m 16s$/)
  expect(after.filter((row, i) => row !== before[i])).toEqual([after[2]])
})

test('[ NOW ] with no step running says what the moment is, timed from when it began', () => {
  let log = turnOne()
  log = noteMode(log, 'requesting', T0)
  let rows = text(log, T0 + 2_000)
  expect(rows[0]).toMatch(/ turn 1$/)
  expect(rows[1]).toMatch(/^▸ Waiting for the first token\. +$/)
  expect(rows[2]).toMatch(/^ {2}waiting +2s$/)

  log = noteMode(log, 'thinking', T0 + 3_000)
  expect(text(log, T0 + 51_000)[2]).toMatch(/^ {2}thinking +48s$/)

  log = step(log, 'a', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 52_000)
  // A settled step hands back to the model: `waiting`, timed from the settle, and hidden for its first second.
  expect(text(log, T0 + 56_000)[2]).toMatch(/^ {2}waiting +3s$/)
  expect(text(log, T0 + 53_500)[2]).toMatch(/^ {2}waiting +$/)
  log = noteMode(log, 'responding', T0 + 60_000)
  rows = text(log, T0 + 64_000)
  expect(rows[0]).toMatch(/ turn 1 · 1 step$/)
  expect(rows[2]).toMatch(/^ {2}writing {2}the answer +4s$/)
})

test('several tools at once: the one that started first, plus the rest as `+n`', () => {
  let log = turnOne()

  for (const [i, f] of ['held.ts', 'ledger.ts', 'store.ts'].entries()) {
    log = startStep(log, { id: f, tool: 'Read', input: { file_path: `hooks/${f}` }, at: T0 + 1_000 + i })
  }

  expect(text(log, T0 + 2_000)[2]).toMatch(/^ {2}read {5}hooks\/held\.ts \+2 +1s$/)
})

test('needs you: the label and row 1 turn to `! needs you`, row 2 is the step that asked', () => {
  let log = turnOne()
  log = startStep(log, { id: 'p', tool: 'Bash', input: { command: 'git push --force-with-lease' }, at: T0 + 1_000 })
  log = askStep(log, 'p')
  // A check the classifier answers asks nobody: no dialog, no `needs you`.
  expect(text(log, T0 + 13_000)[1]).toMatch(/^▸ /)
  let rows = paneRows(log, T0 + 13_000, W, 30, true).map(row => row.map(p => p.t).join(''))
  expect(rows[1]).toMatch(/^! needs you · permission +$/)
  expect(rows[2]).toMatch(/^ {2}shell {4}git push --force-with-lease +12s$/)

  log = settleStep(log, { id: 'p', tool: 'Bash', input: {}, outcome: ok({ stdout: '' }), at: T0 + 14_000 })
  log = startStep(log, { id: 'q', tool: 'AskUserQuestion', input: { questions: [{ header: 'How should it land?', question: 'x' }] }, at: T0 + 15_000 })
  rows = text(log, T0 + 79_000)
  expect(rows[1]).toMatch(/^! needs you · question +$/)
  expect(rows[2]).toMatch(/^ {2}ask {6}How should it land\? +1m 04s$/)
})

test('[ LAST ] when done: the state word, the story, the turn`s time; the turn and when it ended', () => {
  let log = turnOne()
  log = step(log, 'f', 'Bash', { command: 'bun test width' }, failed('Exit code 1\n 12 pass\n 2 fail\n'), 0)
  log = step(log, 'e', 'Edit', { file_path: 'a.ts' }, ok({ structuredPatch: [{ lines: ['+a'] }] }), 5_000)
  log = step(log, 'x', 'Bash', { command: 'bun test width' }, ok({ stdout: ' 14 pass\n 0 fail\n' }), 60_000)
  log = step(log, 'c', 'Bash', { command: 'git commit -m fix' }, ok({ stdout: '[main 7be09d2] fix\n' }), 120_000)
  const steps = text(log, T0 + 150_000).slice(4)
  log = endTurn(log, 164_000)

  const rows = text(log, T0 + 999_000)
  expect(rows[0]).toMatch(/^┄ \[ LAST \] ┄+ turn 1 · 10:29$/)
  expect(rows[1]).toMatch(/^ {2}done · 1 failure → fixed · ± 7be09d2 +2m 44s$/)
  expect(rows[2]).toBe(' '.repeat(W))
  // Nothing below the head rearranges at turn end (H.2).
  expect(rows.slice(3, 3 + steps.length)).toEqual(steps)
})

test('[ LAST ] when a failure is left open: `failed`, the failing step, and what to do', () => {
  let log = turnOne()
  log = step(log, 'f', 'Bash', { command: 'bun test width' }, failed('Exit code 1\n 12 pass\n 2 fail\n'), 0, 47_000)
  log = endTurn(log, 48_000)

  const rows = text(log, T0 + 99_000)
  expect(rows[1]).toMatch(/^ {2}failed · 1 failure · test bun test width +48s$/)
  expect(rows[2]).toMatch(/^ {2}ask Claude to continue +$/)
  expect(rows[3]).toBe(' '.repeat(W))
})

test('[ LAST ] after an interrupt: `interrupted` and the step that was cut, no receipt needed (correction G)', () => {
  let log = turnOne()
  log = step(log, 'a', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 0)
  log = startStep(log, { id: 'b', tool: 'Bash', input: { command: 'sleep 30' }, at: T0 + 2_000 })
  log = endTurn(log, 9_000, true)

  const rows = text(log, T0 + 20_000)
  expect(rows[1]).toMatch(/^ {2}interrupted · cut at shell sleep 30 +9s$/)
  expect(rows.some(r => /interrupted +9s$/.test(r))).toBe(true)
})

test('a turn with no steps: `done · no steps`, and [ STEPS ] keeps the last turn that had any', () => {
  let log = turnOne()
  log = step(log, 'a', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }), 0)
  log = endTurn(log, 2_000)
  log = newTurn(log, 't2', T0 + 60_000)
  log = endTurn(log, 400)

  const rows = text(log, T0 + 70_000)
  expect(rows[0]).toMatch(/ turn 2 · 10:27$/)
  expect(rows[1]).toMatch(/^ {2}done · no steps +0\.4s$/)
  expect(rows[3]).toMatch(/^┄ \[ STEPS · TURN 1 \] ┄+ 1 step$/)
  expect(rows[4]).toMatch(/^ {2}read {5}a\.ts/)
})

test('before any turn: `no turn yet`, and nothing else', () => {
  const rows = text(newLog(null, null), T0)
  expect(rows[0]).toMatch(/^┄ \[ LAST \] ┄+ no turn yet$/)
  expect(rows[1]).toMatch(/^ {2}nothing has run in this session +$/)
  expect(rows.length).toBe(2)
})

test('a pane too short for the head, one blank row and three step rows shows the head alone (amendment 2)', () => {
  let log = turnOne()

  for (let i = 0; i < 9; i++) log = step(log, `s${i}`, 'Read', { file_path: `f${i}.ts` }, ok({ file: { numLines: i } }), i * 1_000)
  log = endTurn(log, 10_000)

  expect(text(log, T0, 5).length).toBe(2)
  const fits = text(log, T0, 7)
  expect(fits.length).toBe(7)
  expect(fits[2]).toBe(' '.repeat(W))
  expect(fits[3]).toMatch(/\[ STEPS \]/)
})

const crew = (n: number): RosterAgent[] =>
  Array.from({ length: n }, (_, i) => i).reduce<RosterAgent[]>(
    (r, i) => addAgent(r, { id: `a${i}`, call: `c${i}`, parent: null, name: `Agent ${i}`, isBackground: true, at: T0 }),
    []
  )
const withAgents = (log: StepLog, roster: readonly RosterAgent[], rows: number) =>
  paneRows(log, T0 + 5_000, W, rows, false, roster).map(row => row.map(p => p.t).join(''))
const twelveSteps = () => {
  let log = turnOne()

  for (let i = 0; i < 12; i++) log = step(log, `s${i}`, 'Read', { file_path: `f${i}.ts` }, ok({ file: { numLines: i } }), i * 1_000)

  return endTurn(log, 12_000)
}

test('[ AGENTS ] sits below [ STEPS ], one blank row between every section (amendment 2)', () => {
  const rows = withAgents(twelveSteps(), crew(3), 40)
  const at = (re: RegExp) => rows.findIndex(r => re.test(r))
  const agents = at(/\[ AGENTS \]/)

  expect(rows[at(/\[ STEPS \]/) - 1]).toBe(' '.repeat(W))
  expect(rows[agents - 1]).toBe(' '.repeat(W))
  expect(rows[agents - 2]).toMatch(/f11\.ts/)
  expect(rows.slice(agents + 1)).toHaveLength(3)
  expect(rows.length).toBeLessThanOrEqual(40)
  for (const row of rows) expect(row.length).toBe(W)
})

test('a short pane: [ AGENTS ] is measured first and gives way, to the agents not done, then to its label', () => {
  let roster = crew(7)

  for (const id of ['a0', 'a1', 'a2', 'a3', 'a4']) roster = endAgent(roster, { id, status: 'completed', text: 'ok', at: T0 })

  // 22 rows: head 2, blank, steps want 3 rows (under 24) plus label and the earlier row; agents keep all 7.
  expect(withAgents(twelveSteps(), roster, 22).filter(r => /^[◇✕] /.test(r))).toHaveLength(7)
  // 13 rows: the 5 done agents go, the 2 running stay.
  const thirteen = withAgents(twelveSteps(), roster, 13)
  expect(thirteen.filter(r => /^[◇✕] /.test(r)).map(r => r.slice(2, 9))).toEqual(['Agent 5', 'Agent 6'])
  expect(thirteen.length).toBeLessThanOrEqual(13)
  // 10 rows: the label alone, still counting; [ STEPS ] keeps its three rows.
  const ten = withAgents(twelveSteps(), roster, 10)
  expect(ten.at(-1)).toMatch(/^┄ \[ AGENTS \] ┄+ 2 running · 5 done$/)
  expect(ten.filter(r => /\.ts/.test(r)).length).toBeGreaterThanOrEqual(3)
  expect(ten.length).toBeLessThanOrEqual(10)
})

test('idle: [ AGENTS ] shows the last turn`s agents frozen; with none it folds away', () => {
  let roster = crew(2)
  roster = endAgent(roster, { id: 'a0', status: 'completed', text: '2 findings', at: T0 + 3_000 })
  roster = endAgent(roster, { id: 'a1', status: 'failed', text: 'context limit', at: T0 + 4_000 })
  const later = (now: number) => paneRows(twelveSteps(), now, W, 40, false, roster).map(row => row.map(p => p.t).join(''))

  expect(later(T0 + 60_000)).toEqual(later(T0 + 600_000))
  expect(later(T0 + 60_000).filter(r => /^[◇✕] /.test(r))).toEqual([expect.stringMatching(/ {6}3s$/), expect.stringMatching(/ {6}4s$/)])
  expect(withAgents(twelveSteps(), [], 40).some(r => /AGENTS/.test(r))).toBe(false)
})

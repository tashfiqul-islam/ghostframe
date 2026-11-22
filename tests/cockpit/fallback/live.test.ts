import { expect, test } from 'claude-code/testing'

import { addAgent, agentStep } from '../../../hooks/cockpit/agents/roster'
import { liveRows } from '../../../hooks/cockpit/fallback/live'
import { newLog, newTurn, noteMode, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import { vw } from '../../../hooks/shared/text'
import type { RosterAgent, TodoItem } from '../../../types'
import { T0 } from '../../support/cockpit'

const W = 94 // a 100-column terminal less the engine's mark
const text = (rows: { t: string }[][]) => rows.map(r => r.map(p => p.t).join(''))

test('a running step: the spinner, its kind word and subject, `step n · its time · the turn`s time` (H.3)', () => {
  let log = newTurn(newLog(null, null), 't1', T0)
  log = settleStep(startStep(log, { id: 'a', tool: 'Read', input: { file_path: 'a.ts' }, at: T0 }), {
    id: 'a',
    tool: 'Read',
    input: { file_path: 'a.ts' },
    outcome: { result: {}, text: '' },
    at: T0 + 1_000
  })
  log = startStep(log, { id: 'b', tool: 'Bash', input: { command: 'gh pr create --fill' }, at: T0 + 3_000 })

  const rows = text(liveRows(log, [], [], T0 + 14_000, 2, W))
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatch(/^⠹ shell {4}gh pr create --fill +step 2 · 11s · 14s$/)
  expect(vw(rows[0] ?? '')).toBe(W)
})

test('no step running: the moment in words; the first request says `waiting  for the first token`', () => {
  const log = newTurn(newLog(null, null), 't1', T0)
  expect(text(liveRows(log, [], [], T0 + 3_000, 0, W))[0]).toMatch(/^⠋ waiting {2}for the first token +3s$/)
  expect(text(liveRows(noteMode(log, 'thinking', T0 + 1_000), [], [], T0 + 9_000, 0, W))[0]).toMatch(/^⠋ thinking +8s · 9s$/)
  expect(text(liveRows(noteMode(log, 'responding', T0), [], [], T0 + 9_000, 0, W))[0]).toMatch(/^⠋ writing {2}the answer +9s$/)
})

test('an agent with no steps yet: its row drops the count and its separator, and the time keeps its column', () => {
  const log = startStep(newTurn(newLog(null, null), 't1', T0), { id: 'l', tool: 'Agent', input: { description: 'x' }, at: T0 })
  let roster = addAgent([], { id: 'a', call: 'l', parent: null, name: 'Count files in cwd', isBackground: false, at: T0 })
  roster = addAgent(roster, { id: 'b', call: 'l', parent: null, name: 'Read the notes', isBackground: false, at: T0 })
  roster = agentStep(roster, 'b', 'Read', { file_path: 'notes.txt' }, undefined, T0 + 500)

  const rows = text(liveRows(log, roster, [], T0 + 1_000, 0, W))
  const fresh = rows.find(r => r.startsWith('◇ Count files'))
  const going = rows.find(r => r.startsWith('◇ Read the notes'))
  expect(fresh).toMatch(/^◇ Count files in cwd {5}start {3}reading its brief +1s$/)
  expect(fresh).not.toMatch(/\b0 ·/)
  expect(going).toMatch(/ 1 · {6}1s$/)
  // Both times end in the same column.
  expect(vw(fresh ?? '')).toBe(W)
  expect(vw(going ?? '')).toBe(W)
})

test('the roster and the to-do in progress follow the now-row (E.13, E.14), at most 9 rows, finished agents first to go', () => {
  const log = startStep(newTurn(newLog(null, null), 't1', T0), { id: 'l', tool: 'Agent', input: { description: 'x' }, at: T0 })
  let roster: RosterAgent[] = []
  for (let i = 0; i < 9; i++) roster = addAgent(roster, { id: `a${i}`, call: 'l', parent: null, name: `Audit part ${i}`, isBackground: false, at: T0 })
  roster = agentStep(roster, 'a0', 'Read', { file_path: 'hooks/register.tsx' }, undefined, T0 + 2_000)
  roster = roster.map((a, i) => (i >= 6 ? { ...a, state: 'done' as const, endedAt: T0 + 5_000 } : a))
  const todo: TodoItem[] = [
    { id: '1', text: 'Split register.tsx', state: 'completed' },
    { id: '2', text: 'Move the held store', state: 'in_progress' },
    { id: '3', text: 'Test it', state: 'pending' }
  ]

  const rows = text(liveRows(log, roster, todo, T0 + 72_000, 0, W))
  expect(rows.length).toBeLessThanOrEqual(9)
  expect(rows[1]).toMatch(/^┄ \[ AGENTS \] ┄+ 6 running · 3 done$/)
  // Six running agents fit; the three done ones collapsed.
  expect(rows.filter(r => r.startsWith('◇ Audit part'))).toHaveLength(6)
  expect(rows.at(-1)).toMatch(/^▸ \[>\] Move the held store +1 of 3$/)
  for (const row of rows) expect(vw(row)).toBe(W)
})

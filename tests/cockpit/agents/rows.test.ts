import { expect, test } from 'claude-code/testing'

import { addAgent, agentStep, endAgent } from '../../../hooks/cockpit/agents/roster'
import { agentRows } from '../../../hooks/cockpit/agents/rows'
import type { AgentsLevel } from '../../../hooks/cockpit/agents/rows'
import type { Part } from '../../../hooks/shared/parts'
import { vw } from '../../../hooks/shared/text'
import { C } from '../../../hooks/shared/tokens'
import type { RosterAgent } from '../../../types'

const T = 1_000_000
const line = (r: readonly Part[]) => r.map(p => p.t).join('')
const text = (roster: readonly RosterAgent[], now: number, width = 72, level: AgentsLevel = 'full') => agentRows(roster, now, width, level).map(line)

/** `n` agents the main loop launched at T, one call each. */
function launched(names: readonly string[], parent: string | null = null): RosterAgent[] {
  return names.reduce<RosterAgent[]>(
    (r, name, i) => addAgent(r, { id: `${parent ?? 'a'}${i + 1}`, call: `c${i + 1}`, parent, name, isBackground: true, at: T }),
    []
  )
}

test('three agents in parallel: one row each in launch order, with kind, subject, steps and time; the label counts them', () => {
  let roster = launched(['Read seat', 'Read switch', 'Read draw'])
  expect(text(roster, T + 2_000)).toEqual([
    expect.stringMatching(/^┄ \[ AGENTS \] ┄+ 3 running$/),
    expect.stringMatching(/^◇ Read seat {14}start {3}reading its brief +2s$/),
    expect.stringMatching(/^◇ Read switch {12}start {3}reading its brief +2s$/),
    expect.stringMatching(/^◇ Read draw {14}start {3}reading its brief +2s$/)
  ])

  roster = agentStep(roster, 'a2', 'Read', { file_path: '/r/hooks/cockpit/switch.ts' }, '/r', T + 1_000)
  roster = agentStep(roster, 'a2', 'Bash', { command: 'wc -l switch.ts' }, undefined, T + 1_500)
  const rows = text(roster, T + 12_000)
  // The row changes in place: the second agent stays second, saying what it does now.
  expect(rows[2]).toMatch(/^◇ Read switch {12}shell {3}wc -l switch\.ts +2 · {5}12s$/)
  expect(rows.slice(1).map(r => r.slice(2, 13).trim())).toEqual(['Read seat', 'Read switch', 'Read draw'])
  for (const r of rows) expect(vw(r)).toBe(72)
})

test('a running agent is lavender; a done one goes muted, says `done` and the head of its report, and its time freezes', () => {
  let roster = launched(['Audit tests'])
  roster = agentStep(roster, 'a1', 'Read', { file_path: 'a.ts' }, undefined, T + 1_000)
  const running = agentRows(roster, T + 5_000, 72)[1] ?? []
  expect(running[0]).toEqual({ t: '◇', color: C.agent })
  expect(running.find(p => p.t.startsWith('Audit tests'))?.color).toBe(C.agent)

  roster = endAgent(roster, { id: 'a1', status: 'completed', text: '## 3 findings\n\n1. …', at: T + 30_000 })
  const done = agentRows(roster, T + 90_000, 72)[1] ?? []
  expect(line(done)).toMatch(/^◇ Audit tests {12}done {3}3 findings +1 · {5}30s$/)
  expect(done[0]?.color).toBe(C.dim)
  expect(done.find(p => p.t.startsWith('Audit tests'))?.color).toBe(C.muted)
  expect(line(agentRows(roster, T + 90_000, 72)[0] ?? [])).toMatch(/ 1 done$/)
})

test('a failed agent is marked ✕ with `failed` bold and its reason; the label puts the failure first, in err', () => {
  let roster = launched(['Audit tests', 'Audit publish-readiness'])
  roster = endAgent(roster, { id: 'a2', status: 'failed', text: 'context limit', at: T + 40_000 })
  const rows = agentRows(roster, T + 50_000, 72)
  expect(line(rows[2] ?? [])).toMatch(/^✕ Audit publish-readine… failed context limit +40s$/)
  expect(rows[2]?.[0]).toEqual({ t: '✕', color: C.err })
  expect(rows[2]?.find(p => p.t === 'failed ')).toEqual({ t: 'failed ', color: C.err, bold: true })
  expect(line(rows[0] ?? [])).toMatch(/ 1 failed · 1 running$/)
  expect(rows[0]?.find(p => p.t === '1 failed')?.color).toBe(C.err)

  // A stop is a failure too.
  roster = endAgent(roster, { id: 'a1', status: 'stopped', text: '', at: T + 45_000 })
  expect(text(roster, T + 50_000)[1]).toMatch(/^✕ Audit tests {12}failed stopped/)
})

test('seven agents are seven rows; an eighth is `… 1 more`, and the label still counts all eight', () => {
  const seven = launched(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'])
  expect(text(seven, T)).toHaveLength(8)
  expect(text(seven, T)[0]).toMatch(/ 7 running$/)

  const eight = launched(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'])
  const rows = text(eight, T)
  expect(rows).toHaveLength(9)
  expect(rows[7]).toMatch(/^◇ A7 /)
  expect(rows[8]).toMatch(/^ {2}… 1 more +$/)
  expect(rows[0]).toMatch(/ 8 running$/)
})

test('a nested agent is inset 2 cells under its parent and rides with it; a third level is counted on its parent', () => {
  let roster = launched(['Research toolchain', 'Audit tests'])
  // Launched after `Audit tests`, the child still sits under its parent: rows never move, they make room.
  roster = addAgent(roster, { id: 'n1', call: 'k1', parent: 'a1', name: 'Verify release dates', isBackground: false, at: T + 1_000 })
  roster = addAgent(roster, { id: 'n2', call: 'k2', parent: 'n1', name: 'Deep check', isBackground: false, at: T + 2_000 })
  roster = agentStep(roster, 'n1', 'Read', { file_path: 'a.ts' }, undefined, T + 2_000)
  const rows = text(roster, T + 18_000)
  expect(rows).toHaveLength(4)
  expect(rows[1]).toMatch(/^◇ Research toolchain /)
  expect(rows[2]).toMatch(/^ {2}◇ Verify release dates read {4}a\.ts \+1 nested +1 · {5}17s$/)
  expect(rows[3]).toMatch(/^◇ Audit tests /)
  expect(rows[0]).toMatch(/ 2 running · 2 nested$/)

  // A nested agent does not count against the cap of seven.
  const many = [...launched(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'])]
  const withChild = addAgent(many, { id: 'n9', call: 'k9', parent: 'a7', name: 'Child', isBackground: false, at: T })
  expect(text(withChild, T)).toHaveLength(9)
  expect(text(withChild, T).at(-1)).toMatch(/^ {2}◇ Child/)
})

test('narrow: at 40 columns the subject goes, the name and the counts stay', () => {
  let roster = launched(['Audit register.tsx'])
  roster = agentStep(roster, 'a1', 'Read', { file_path: 'hooks/register.tsx' }, undefined, T + 1_000)
  const rows = text(roster, T + 72_000, 40)
  expect(rows[1]).toBe('◇ Audit register.… read      1 ·  1m 12s')
  for (const r of rows) expect(vw(r)).toBe(40)
})

test('the pane`s ladder: `running` keeps the agents not done, `label` keeps the label alone', () => {
  let roster = launched(['A1', 'A2', 'A3'])
  roster = endAgent(roster, { id: 'a1', status: 'completed', text: 'ok', at: T })
  roster = endAgent(roster, { id: 'a3', status: 'failed', text: 'boom', at: T })
  expect(text(roster, T, 72, 'running').map(r => r.slice(0, 4))).toEqual(['┄ [ ', '◇ A2', '✕ A3'])
  expect(text(roster, T, 72, 'label')).toHaveLength(1)
  expect(agentRows([], T, 72)).toEqual([])
})

test('an agent`s subject changes at most once a second: a step within the second waits, then shows', () => {
  let roster = launched(['Fast'])
  roster = agentStep(roster, 'a1', 'Read', { file_path: 'a.ts' }, undefined, T + 1_000)
  roster = agentStep(roster, 'a1', 'Read', { file_path: 'b.ts' }, undefined, T + 1_200)
  roster = agentStep(roster, 'a1', 'Read', { file_path: 'c.ts' }, undefined, T + 1_400)

  // Every step counts at once; the subject stays on a.ts until its second is up.
  expect(text(roster, T + 1_500)[1]).toMatch(/^◇ Fast +read {4}a\.ts +3 · /)
  expect(text(roster, T + 2_000)[1]).toMatch(/^◇ Fast +read {4}c\.ts +3 · /)
})

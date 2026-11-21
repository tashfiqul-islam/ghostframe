import { expect, test } from 'claude-code/testing'

import { addAgent, agentStep, endAgent, endTurnAgents, reconcile, startTurnAgents } from '../../../hooks/cockpit/agents/roster'
import type { RosterAgent } from '../../../types'

const T = 1_000_000
const start = (id: string, isBackground = true, parent: string | null = null) => ({ id, call: `c-${id}`, parent, name: `Agent ${id}`, isBackground, at: T })

test('a resumed agent (woken for its child`s report: same id, no call) runs again in its own row, keeping its launch', () => {
  let roster = addAgent([], start('p'))
  roster = addAgent(roster, start('q'))
  roster = agentStep(roster, 'p', 'Read', { file_path: 'a.ts' })
  roster = endAgent(roster, { id: 'p', status: 'completed', text: 'partial', at: T + 5_000 })
  roster = addAgent(roster, { id: 'p', call: '', parent: null, name: 'Agent p', isBackground: true, at: T + 9_000 })

  expect(roster.map(a => a.id)).toEqual(['p', 'q'])
  expect(roster[0]).toMatchObject({ call: 'c-p', state: 'running', steps: 1, startedAt: T, endedAt: null })
})

test('a report ends an agent once: done with its head, failed with its reason; a second report changes nothing', () => {
  let roster = addAgent([], start('a'))
  roster = endAgent(roster, { id: 'a', status: 'completed', text: '\n**4 findings** in two files', at: T + 1_000 })
  expect(roster[0]).toMatchObject({ state: 'done', kind: 'done', subject: '4 findings in two files', endedAt: T + 1_000 })

  const again = endAgent(roster, { id: 'a', status: 'failed', text: 'late', at: T + 9_000 })
  expect(again[0]).toEqual(roster[0])

  const failed = endAgent(addAgent([], start('b')), { id: 'b', status: 'failed', text: '', at: T })
  expect(failed[0]).toMatchObject({ state: 'failed', subject: 'failed' })
})

test('agents still running when the turn ends: background ones run on; interrupted, a foreground one stops with it', () => {
  const roster: RosterAgent[] = [start('bg', true), start('fg', false)].reduce<RosterAgent[]>((r, s) => addAgent(r, s), [])

  expect(endTurnAgents(roster, false, T + 1).map(a => a.state)).toEqual(['running', 'running'])
  expect(endTurnAgents(roster, true, T + 1).map(a => [a.state, a.subject])).toEqual([
    ['running', 'reading its brief'],
    ['failed', 'interrupted']
  ])
})

test('a turn the person typed starts a new roster; background agents still running stay', () => {
  let roster = [start('done'), start('bg'), start('fg', false)].reduce<RosterAgent[]>((r, s) => addAgent(r, s), [])
  roster = endAgent(roster, { id: 'done', status: 'completed', text: 'ok', at: T })
  expect(startTurnAgents(roster).map(a => a.id)).toEqual(['bg'])
})

test('the engine`s list settles a run whose report never came: killed or gone is `stopped`; one it still runs stays', () => {
  const roster = ['a', 'b', 'c', 'd'].reduce<RosterAgent[]>((r, id) => addAgent(r, start(id)), [])
  const settled = reconcile(
    roster,
    [
      { id: 'a', taskStatus: 'running' },
      { id: 'b', taskStatus: 'killed' },
      { id: 'c', taskStatus: 'completed' }
    ],
    T + 5
  )
  expect(settled.map(a => [a.id, a.state, a.subject])).toEqual([
    ['a', 'running', 'reading its brief'],
    ['b', 'failed', 'stopped'],
    ['c', 'done', ''],
    ['d', 'failed', 'stopped']
  ])
})

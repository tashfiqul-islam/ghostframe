import { expect, test } from 'claude-code/testing'

import { addAgent, agentStep, endAgent, endTurnAgents, reconcile, startTurnAgents } from '../../../hooks/cockpit/agents/roster'
import type { RosterAgent } from '../../../types'

const T = 1_000_000
const start = (id: string, isBackground = true, parent: string | null = null) => ({ id, call: `c-${id}`, parent, name: `Agent ${id}`, isBackground, at: T })

test('a wake-up (the same id again, no call) leaves the row as it is: it never makes a finished agent run again', () => {
  let roster = addAgent([], start('p'))
  roster = addAgent(roster, start('q'))
  roster = agentStep(roster, 'p', 'Read', { file_path: 'a.ts' }, undefined, T + 1_000)
  const running = addAgent(roster, { id: 'p', call: '', parent: null, name: 'Agent p', isBackground: true, at: T + 2_000 })
  expect(running).toEqual(roster)

  roster = endAgent(roster, { id: 'p', status: 'completed', text: 'partial', at: T + 5_000 })
  const woken = addAgent(roster, { id: 'p', call: '', parent: null, name: 'Agent p', isBackground: true, at: T + 9_000 })
  expect(woken.map(a => a.id)).toEqual(['p', 'q'])
  expect(woken[0]).toMatchObject({ call: 'c-p', state: 'done', steps: 1, startedAt: T, endedAt: T + 5_000 })
})

test('a report ends an agent: done with its head, failed with its reason', () => {
  let roster = addAgent([], start('a'))
  roster = endAgent(roster, { id: 'a', status: 'completed', text: '\n**4 findings** in two files', at: T + 1_000 })
  expect(roster[0]).toMatchObject({ state: 'done', kind: 'done', subject: '4 findings in two files', endedAt: T + 1_000 })

  // A later report of a finished agent brings its newer head and end; it never runs again.
  const again = endAgent(roster, { id: 'a', status: 'completed', text: '5 findings', at: T + 9_000 })
  expect(again[0]).toMatchObject({ state: 'done', subject: '5 findings', endedAt: T + 9_000 })

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

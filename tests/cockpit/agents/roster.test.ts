import { expect, test } from 'claude-code/testing'

import { addAgent, agentLaunchEnd, agentStep, agentStepEnd, endAgent, endTurnAgents, reconcile, startTurnAgents } from '../../../hooks/cockpit/agents/roster'
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
  // Done, it says it reported and how much it did, never the report's own words (8.9).
  expect(roster[0]).toMatchObject({ state: 'done', kind: 'reported', subject: '· 0 steps', endedAt: T + 1_000 })

  // A later report of a finished agent brings its newer head and end; it never runs again.
  const again = endAgent(roster, { id: 'a', status: 'completed', text: '5 findings', at: T + 9_000 })
  expect(again[0]).toMatchObject({ state: 'done', kind: 'reported', subject: '· 0 steps', endedAt: T + 9_000 })

  const failed = endAgent(addAgent([], start('b')), { id: 'b', status: 'failed', text: '', at: T })
  expect(failed[0]).toMatchObject({ state: 'failed', subject: 'failed' })
})

test('agents still running when the turn ends: background ones run on; interrupted, a foreground one stops with it', () => {
  const roster: RosterAgent[] = [start('bg', true), start('fg', false)].reduce<RosterAgent[]>((r, s) => addAgent(r, s), [])

  expect(endTurnAgents(roster, false, T + 1).map(a => a.state)).toEqual(['running', 'running'])
  expect(endTurnAgents(roster, true, T + 1).map(a => [a.state, a.subject])).toEqual([
    ['running', ''],
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
    ['a', 'running', ''],
    ['b', 'failed', 'stopped'],
    ['c', 'done', ''],
    ['d', 'failed', 'stopped']
  ])
})

test('an agent keeps its own steps, on its own clock: each call a row that settles once (B1)', () => {
  let roster = addAgent([], start('a'))
  roster = agentStep(roster, 'a', 'Edit', { file_path: '/repo/a.ts' }, '/repo', T + 1_000, 'e1')
  expect(roster[0]?.log).toMatchObject([{ id: 'e1', kind: 'edit', subject: 'a.ts', isRunning: true, clock: 1_000 }])

  roster = agentStepEnd(roster, 'a', {
    id: 'e1',
    tool: 'Edit',
    input: { file_path: '/repo/a.ts' },
    at: T + 3_000,
    outcome: { result: { structuredPatch: [{ lines: ['+x', '+y', '-z'] }] }, text: 'ok' }
  })
  expect(roster[0]?.log).toMatchObject([{ id: 'e1', kind: 'edit', subject: 'a.ts', result: '+2 −1', mark: '', isRunning: false, clock: 3_000 }])
})

test('an agent`s report call is no step, and past 500 steps the oldest are counted, not kept', () => {
  let roster = addAgent([], start('a'))
  roster = agentStep(roster, 'a', 'SubagentHandback', { message: 'done' }, undefined, T + 1, 'h1')
  expect(roster[0]?.log ?? []).toEqual([])

  for (let i = 0; i < 503; i++) roster = agentStep(roster, 'a', 'Read', { file_path: `f${i}.ts` }, undefined, T + 10 + i, `r${i}`)
  expect(roster[0]?.log).toHaveLength(500)
  expect(roster[0]?.logDropped).toBe(3)
  expect(roster[0]?.log?.[0]?.id).toBe('r3')
})

test('a nested launch settles in its parent`s own log when the child reports', () => {
  let roster = addAgent([], start('p'))
  roster = agentStep(roster, 'p', 'Agent', { description: 'child', prompt: 'go' }, undefined, T + 1_000, 'k1')
  roster = agentStepEnd(roster, 'p', { id: 'k1', tool: 'Agent', input: {}, at: T + 1_100, outcome: { result: { status: 'async_launched' }, text: '' } })
  expect(roster[0]?.log?.[0]).toMatchObject({ kind: 'agent', isRunning: true })

  roster = agentLaunchEnd(roster, 'p', 'k1', false, T + 9_000)
  expect(roster[0]?.log?.[0]).toMatchObject({ kind: 'agent', isRunning: false, result: '1 done', clock: 9_000 })
})

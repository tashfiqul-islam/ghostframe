import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import type { Engine, On } from '../support/engine'

// Phase 5, agents: `[ AGENTS ]` from agent.spawn, a subagent's tool.call and agent.report; one `[ STEPS ]` row per launch.
const ASYNC = { result: { status: 'async_launched', agentId: 'x', description: 'x' }, text: 'launched' }

function engine(on: On, clock: { now: number }, listed: { id: string; taskStatus: string }[] = []) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) => (e.tool === 'Agent' ? ASYNC : { result: { file: { numLines: 3 } }, text: 'ok' }) as never)
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: `ag-${e.description}` }))
  on('agent.report', (_, e) => ({ text: e.text }))
  on('agent.list', () => ({ value: listed as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

const spawn = ($: Engine, call: string, description: string, parentAgentId?: string) =>
  $.agent.spawn({
    tool_use_id: call,
    prompt: 'go',
    description,
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'haiku',
    background: true,
    fork: false,
    ...(parentAgentId === undefined ? {} : { parentAgentId })
  } as never)

const report = ($: Engine, agentId: string, status: 'completed' | 'failed', text: string) =>
  $.agent.report({ agentId, subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, status, text } as never)

async function paneText($: Engine): Promise<string[]> {
  const ui = await $.ui.mount(PANE)
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0 && !t.includes('\n'))
  await ui.unmount()

  return [...new Set(rows)]
}

async function launchThree($: Engine, clock: { now: number }) {
  await $.prompt.submit({ text: 'audit it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'audit it', turnId: 't1' })

  for (const [call, name] of [
    ['c1', 'Read seat'],
    ['c2', 'Read switch'],
    ['c3', 'Read draw']
  ] as const) {
    await $.tool.call({ tool: 'Agent', description: name, prompt: 'go', run_in_background: true, tool_use_id: call } as never)
    await spawn($, call, name)
  }

  clock.now += 2_000
  await $.tool.call({ tool: 'Read', file_path: 'hooks/cockpit/seat.ts', tool_use_id: 'r1', agentId: 'ag-Read seat' } as never)
}

test('three agents in parallel: one launch row, three roster rows that change in place, still running past the turn', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [{ id: 'ag-Read seat', taskStatus: 'running' }])
  await launchThree($, clock)

  let rows = await paneText($)
  expect(rows.filter(r => r.startsWith('▸ agent '))).toEqual([expect.stringMatching(/^▸ agent {4}3 launched +running/)])
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ AGENTS \] ┄+ 3 running$/))
  expect(rows).toContainEqual(expect.stringMatching(/^◇ Read seat {14}read {4}hooks\/cockpit\/seat\.ts +1 · {6}2s$/))
  expect(rows).toContainEqual(expect.stringMatching(/^◇ Read switch {12}start {3}reading its brief +0 ·/))

  // The turn ends with its agents still running in the background: the launch and the roster stay live.
  clock.now += 1_000
  await $.turn.complete({ answer: 'waiting', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
  clock.now += 7_000
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^▸ agent {4}3 launched +running/))
  expect(rows).toContainEqual(expect.stringMatching(/^◇ Read seat .* 1 · {5}10s$/))

  // Their reports start a turn of their own (no prompt): the roster stays; the launch settles when the last reports.
  await $.turn.start({ text: '', turnId: 't2' })
  await report($, 'ag-Read seat', 'completed', '43 lines')
  await report($, 'ag-Read switch', 'failed', 'context limit')
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^▸ agent {4}3 launched +running/))

  await report($, 'ag-Read draw', 'completed', '25 lines')
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}agent {4}3 launched +2 done · 1 failed/))
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ AGENTS \] ┄+ 1 failed · 2 done$/))
  expect(rows).toContainEqual(expect.stringMatching(/^◇ Read seat {14}done {3}43 lines/))
  expect(rows).toContainEqual(expect.stringMatching(/^✕ Read switch {12}failed context limit/))

  // The next turn the person types starts a new roster: the finished agents fold away.
  await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'thanks', turnId: 't3' })
  expect((await paneText($)).some(r => /AGENTS/.test(r))).toBe(false)
})

test('a nested agent rides under its parent; the parent, woken for its child`s report, keeps its row and its launch', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  await $.prompt.submit({ text: 'nest', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'nest', turnId: 't1' })
  await $.tool.call({ tool: 'Agent', description: 'Nest parent', prompt: 'go', tool_use_id: 'c1' } as never)
  await spawn($, 'c1', 'Nest parent')
  clock.now += 1_000
  await $.tool.call({ tool: 'Agent', description: 'Nest child', prompt: 'go', tool_use_id: 'k1', agentId: 'ag-Nest parent' } as never)
  await spawn($, 'k1', 'Nest child', 'ag-Nest parent')

  let rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^◇ Nest parent {12}agent {3}Nest child/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}◇ Nest child {11}start/))
  expect(rows).toContainEqual(expect.stringMatching(/ 1 running · 1 nested$/))

  await report($, 'ag-Nest child', 'completed', '42')
  // The engine wakes the parent to read it: a spawn with the parent's id and no call.
  await spawn($, '', 'Nest parent')
  await report($, 'ag-Nest parent', 'completed', '42 lines')
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}agent {4}1 launched +1 done/))
  expect(rows.filter(r => /^ *◇ Nest/.test(r)).map(r => r.slice(0, 16))).toEqual(['◇ Nest parent   ', '  ◇ Nest child  '])
})

test('a report that never came: the engine`s list settles the agent at the next turn the person types', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [{ id: 'ag-Read seat', taskStatus: 'killed' }])
  await launchThree($, clock)
  await $.turn.complete({ answer: 'waiting', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
  // The list says the other two are gone as well, so the next turn starts with no roster at all.
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'next', turnId: 't2' })
  expect((await paneText($)).some(r => /AGENTS/.test(r))).toBe(false)
})

test('off: agents spawn and report exactly as they would, and no pane rows are drawn', async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  await $.turn.start({ text: 'audit it', turnId: 't1' })
  await $.tool.call({ tool: 'Agent', description: 'Read seat', prompt: 'go', tool_use_id: 'c1' } as never)
  expect(await spawn($, 'c1', 'Read seat')).toEqual({ model: 'haiku', agentId: 'ag-Read seat' })
  expect(await report($, 'ag-Read seat', 'completed', '43 lines')).toEqual({ text: '43 lines' })

  const ui = await $.ui.mount(PANE)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['engine'])
  await ui.unmount()
})

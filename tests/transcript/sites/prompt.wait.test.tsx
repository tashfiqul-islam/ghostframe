import { expect, test } from 'claude-code/testing'

import { OFF, ON, PANE, T0 } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { respond } from '../../support/respond'
import { use } from '../../support/docked'
import { textAt } from '../../support/text'
import { holdTimers } from '../../support/clock'

// An agent that stopped with background work of its own still running notifies again, with the same task id, each
// time it wakes and waits again: `Agent "PR4 cockpit fixes" is waiting on its own background work`. Docked, every
// such notice is the Agents tab's (8.9) and the transcript draws nothing, however many turns ago the agent started.
const AGENT = 'a316067c2c274fe42'
const CALL = 'toolu_011V2v6zpiRkjwKJEy1bExi2'
const WAITING = 'Agent "PR4 cockpit fixes" is waiting on its own background work'

function engine(on: On, clock: { now: number }, store: Map<string, unknown>, isPlaced: boolean): void {
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.log', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'waiting' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // The engine drops a finished subagent's task from its list a while after it ends.
  on('agent.list', () => ({ value: [] as never }))
  on('agent.spawn', () => ({ model: 'opus', agentId: AGENT }))
  on('agent.report', (_, e) => ({ text: e.text }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } }) as never)
  on('tool.call', () => ({ result: { status: 'async_launched', agentId: AGENT }, text: 'launched' }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

async function typedTurn($: Engine, clock: { now: number }, n: number): Promise<void> {
  clock.now += 60_000
  await $.prompt.submit({ text: `turn ${n}`, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: `turn ${n}`, turnId: `e${n}` })
  clock.now += 5_000
  await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, turnId: `e${n}`, reason: 'answer' })
}

/** A session whose first turn launched the agent; it waited, and many turns followed. */
async function session($: Engine, on: On, isPlaced: boolean, store: Map<string, unknown>): Promise<{ now: number }> {
  const clock = { now: T0 }
  engine(on, clock, store, isPlaced)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  if (isPlaced) await (await $.ui.mount(PANE)).unmount()

  await $.prompt.submit({ text: 'fix the cockpit bugs in the background', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the cockpit bugs in the background', turnId: 'e1' })
  await $.session.append(respond([use(CALL, 'Agent', { description: 'PR4 cockpit fixes', prompt: 'fix', run_in_background: true })], 'r1'))
  await $.tool.call({ tool: 'Agent', description: 'PR4 cockpit fixes', prompt: 'fix', run_in_background: true, tool_use_id: CALL } as never)
  await $.agent.spawn({
    tool_use_id: CALL,
    prompt: 'fix',
    description: 'PR4 cockpit fixes',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false
  } as never)
  clock.now += 5_000
  await $.turn.complete({ answer: 'started', durationMs: 5_000, isAborted: false, turnId: 'e1', reason: 'answer' })
  // It stops with background work of its own still running: the engine reports it, the work not done.
  await $.agent.report({
    agentId: AGENT,
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    status: 'completed',
    text: WAITING
  } as never)
  for (let n = 2; n <= 6; n++) await typedTurn($, clock, n)

  return clock
}

const notice = (requestId: string, durationMs: number, columns = 127) =>
  ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'UserMessage',
    requestId,
    viewport: { columns, rows: 50, isFullscreen: true },
    props: { text: WAITING, origin: { kind: 'task-notification' }, isExpanded: false, task: { id: AGENT, toolUseId: CALL, status: 'completed', durationMs } }
  }) as never

async function drawn($: Engine, requestId: string, durationMs: number, columns = 127): Promise<string[]> {
  const ui = await $.ui.mount(notice(requestId, durationMs, columns))
  const rows = textAt(await ui.drawn(), columns).filter(r => r.trim().length > 0)
  await ui.unmount()

  return rows
}

test('docked: an agent from an early turn that waits again draws nothing, though the store`s budget kept only the last turn', ON, async ($, on) => {
  // Another key fills the store: history keeps only the newest turn, so the agent's turn is gone from it.
  const store = new Map<string, unknown>([['someone-else:cache', 'x'.repeat(4_150_000)]])
  await session($, on, true, store)

  expect(await drawn($, 'w1', 300_000)).toEqual([])
  expect(await drawn($, 'w2', 420_000)).toEqual([])
})

test('docked: the same agent`s notice draws nothing with no store at all (history never kept)', ON, async ($, on) => {
  await session($, on, true, new Map())

  expect(await drawn($, 'w1', 300_000)).toEqual([])
})

test('Cockpit off: one row per agent; a later notice with the same task id draws nothing and the first shows its time', OFF, async ($, on) => {
  await session($, on, false, new Map())
  const first = await $.ui.mount(notice('w1', 300_000, 120))
  expect(textAt(await first.drawn(), 120).join('\n')).toContain('5m 0s')

  // The same agent waits again a minute later: one row still, its time updated in place.
  await $.prompt.submit({
    text: `<task-notification>\n<task-id>${AGENT}</task-id>\n<status>completed</status>\n<summary>${WAITING}</summary>\n<usage><duration_ms>420000</duration_ms></usage>\n</task-notification>`,
    wait: false,
    origin: { kind: 'task-notification' }
  })
  expect(await drawn($, 'w2', 420_000, 120)).toEqual([])
  await first.redraw()
  const again = textAt(await first.drawn(), 120).join('\n')
  await first.unmount()

  expect(again).toContain('7m 0s')
  expect(again).not.toContain('5m 0s')
})

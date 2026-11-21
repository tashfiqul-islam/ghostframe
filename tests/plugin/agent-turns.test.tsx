import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, VIEW } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { respond } from '../support/respond'

// Phase 5 screen check, as seen on screen: three background agents whose reports arrive as turns of their own
// (the first alone, the other two together), then a nested agent. Each turn that answers ends with exactly one
// receipt, keyed by its own turn; the roster stays until the next typed prompt; `waiting · N agents` while any
// runs; and turns are numbered by typed prompts only.
const ASYNC = { result: { status: 'async_launched', agentId: 'x', description: 'x' }, text: 'launched' }
const FOOTER = (durationMs: number) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'TurnDuration', viewport: VIEW, props: { word: 'Baked', durationMs } }) as const
const ANSWER = (t: string) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: t, isFirstOfReply: true } }) as const

function engine(on: On, clock: { now: number }) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) => (e.tool === 'Agent' ? ASYNC : { result: { file: { numLines: 3 } }, text: 'ok' }) as never)
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: `ag-${e.description}` }))
  on('agent.report', (_, e) => ({ text: e.text }))
  on('agent.list', () => ({ value: [] as never }))
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
const report = ($: Engine, agentId: string, t: string) =>
  $.agent.report({ agentId, subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, status: 'completed', text: t } as never)
const typed = ($: Engine, t: string) => $.prompt.submit({ text: t, wait: false, origin: { kind: 'composer' } })
// An agent's report reaches the main loop as a meta prompt from a peer, then a turn of its own.
const delivered = ($: Engine, from: string) => $.prompt.submit({ text: `<agent-message from="${from}">`, wait: false, isMeta: true, origin: { kind: 'peer' } })
// Or as the engine's notice that it finished, which is not meta.
const noticed = ($: Engine, id: string) => $.prompt.submit({ text: `<task-notification>${id} completed`, wait: false, origin: { kind: 'task-notification' } })

async function rowsOf($: Engine, site: Parameters<Engine['ui']['mount']>[0]): Promise<string[]> {
  const ui = await $.ui.mount(site)
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0 && !t.includes('\n'))
  await ui.unmount()

  return [...new Set(rows)]
}
const receiptsUnder = async ($: Engine, answer: string) => (await rowsOf($, ANSWER(answer))).filter(r => /^─ \w/.test(r))
type Mounted = { redraw: () => Promise<unknown>; findAll: (q: { type: string }) => Promise<{ text: string }[]> }
/** The docked pane's rows now. */
async function paneOf(docked: Mounted): Promise<string[]> {
  await docked.redraw()

  return [...new Set((await docked.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0 && !t.includes('\n')))]
}

/** The sequence, stopping after `upTo` of its stages. */
async function run($: Engine, clock: { now: number }, upTo: number) {
  const stages: (() => Promise<void>)[] = [
    // 1. The typed turn: three agents launched in the background, 3s.
    async () => {
      await typed($, 'audit the cockpit')
      await $.turn.start({ text: 'audit the cockpit', turnId: 't1' })
      await $.session.append(respond([use('c1', 'Agent', {}), use('c2', 'Agent', {}), use('c3', 'Agent', {})], 'm1'))

      for (const [call, name] of [
        ['c1', 'Read seat'],
        ['c2', 'Read switch'],
        ['c3', 'Read draw']
      ] as const) {
        await $.tool.call({ tool: 'Agent', description: name, prompt: 'go', run_in_background: true, tool_use_id: call } as never)
        await spawn($, call, name)
      }

      await $.session.append(respond([text('Three agents launched.')], 'm2'))
      clock.now += 3_000
      await $.turn.complete({ answer: 'x', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
    },
    // 2. The first report, a turn of its own: 1s, no steps.
    async () => {
      clock.now += 4_000
      await delivered($, 'ag-Read draw')
      await report($, 'ag-Read draw', '25 lines')
      await $.turn.start({ text: '<agent-message>', turnId: 'r1' })
      await $.session.append(respond([text('Read switch agent done soon; draw.tsx: 25 lines.')], 'm3'))
      clock.now += 1_000
      await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r1', reason: 'answer' })
    },
    // 3. The other two reports, in one turn: 2s.
    async () => {
      clock.now += 2_000
      await delivered($, 'ag-Read seat')
      await delivered($, 'ag-Read switch')
      await report($, 'ag-Read seat', '43 lines')
      await report($, 'ag-Read switch', '42 lines')
      await $.turn.start({ text: '<agent-message>', turnId: 'r2' })
      await $.session.append(respond([text('All three done: 43, 42, 25.')], 'm4'))
      clock.now += 2_000
      await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 'r2', reason: 'answer' })
    },
    // 4. A typed turn: one agent that launches a nested one; then its report turn.
    async () => {
      await typed($, 'nest')
      await $.turn.start({ text: 'nest', turnId: 't2' })
      await $.tool.call({ tool: 'Agent', description: 'Nest parent', prompt: 'go', tool_use_id: 'n1' } as never)
      await spawn($, 'n1', 'Nest parent')
      await $.tool.call({ tool: 'Agent', description: 'Nest child', prompt: 'go', tool_use_id: 'k1', agentId: 'ag-Nest parent' } as never)
      await spawn($, 'k1', 'Nest child', 'ag-Nest parent')
      await $.session.append(respond([text('Parent launched.')], 'm5'))
      clock.now += 2_000
      await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 't2', reason: 'answer' })
      await report($, 'ag-Nest child', '42')
      await spawn($, '', 'Nest parent')
      await report($, 'ag-Nest parent', '42 lines')
      await delivered($, 'ag-Nest parent')
      await $.turn.start({ text: '<agent-message>', turnId: 'r3' })
      await $.session.append(respond([text('It is 42.')], 'm6'))
      clock.now += 1_000
      await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r3', reason: 'answer' })
    }
  ]

  for (const stage of stages.slice(0, upTo)) await stage()
}

test('1. every turn that answered, report turns included, ends with exactly one receipt; the footer draws none', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  await run($, clock, 4)

  for (const answer of [
    'Three agents launched.',
    'Read switch agent done soon; draw.tsx: 25 lines.',
    'All three done: 43, 42, 25.',
    'Parent launched.',
    'It is 42.'
  ]) {
    expect(await receiptsUnder($, answer)).toHaveLength(1)
  }

  // The engine's one footer for both report turns (12s, matching neither) draws nothing.
  expect(await rowsOf($, FOOTER(12_225))).toEqual([])
  await docked.unmount()
})

test('2. a drawn receipt never changes: each is its own turn`s, and a turn with no steps says so', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  await run($, clock, 3)

  const first = await receiptsUnder($, 'All three done: 43, 42, 25.')
  expect(first).toEqual([expect.stringMatching(/^─ done ─+ no steps · 2s$/)])
  const launch = await receiptsUnder($, 'Three agents launched.')
  expect(launch).toEqual([expect.stringMatching(/^─ waiting · 3 agents ─+ 1 step · 3s$/)])

  // Later turns start and end: what was drawn stays as drawn.
  await typed($, 'nest')
  await $.turn.start({ text: 'nest', turnId: 't2' })
  await $.session.append(respond([text('Something else.')], 'm9'))
  clock.now += 5_000
  await $.turn.complete({ answer: 'x', durationMs: 5_000, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(await receiptsUnder($, 'All three done: 43, 42, 25.')).toEqual(first)
  expect(await receiptsUnder($, 'Three agents launched.')).toEqual(launch)
  await docked.unmount()
})

test('3. the roster stays through the report turns, frozen once all are done, until the next typed prompt', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  const agents = async () => (await paneOf(docked)).filter(r => /^ *[◇✕] /.test(r))

  await run($, clock, 1)
  await noticed($, 'ag-Read draw')
  await $.turn.start({ text: '<task-notification>', turnId: 'r1' })
  // While the report turn runs, the roster is still there: a task's notice is no typed prompt.
  expect(await agents()).toHaveLength(3)
  await report($, 'ag-Read draw', '25 lines')
  await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r1', reason: 'answer' })
  expect(await agents()).toHaveLength(3)

  await delivered($, 'ag-Read seat')
  await $.turn.start({ text: '<agent-message>', turnId: 'r2' })
  await report($, 'ag-Read seat', '43 lines')
  await report($, 'ag-Read switch', '42 lines')
  await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 'r2', reason: 'answer' })
  const frozen = await agents()
  expect(frozen.map(r => r.slice(0, 29).trim())).toEqual(['◇ Read seat              done', '◇ Read switch            done', '◇ Read draw              done'])
  clock.now += 60_000
  expect(await agents()).toEqual(frozen)

  await typed($, 'next')
  await $.turn.start({ text: 'next', turnId: 't2' })
  expect(await agents()).toEqual([])
  await docked.unmount()
})

test('4. while a background agent runs, [ LAST ] and the receipt say `waiting · N agents`, not `done`', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  const last = async () => (await paneOf(docked)).find(r => /^ {2}\w/.test(r) && !/^ {2}agent /.test(r))

  await run($, clock, 1)
  expect(await last()).toMatch(/^ {2}waiting · 3 agents · /)
  expect(await receiptsUnder($, 'Three agents launched.')).toEqual([expect.stringMatching(/^─ waiting · 3 agents ─/)])

  await (async () => {
    clock.now += 4_000
    await delivered($, 'ag-Read draw')
    await report($, 'ag-Read draw', '25 lines')
    await $.turn.start({ text: '<agent-message>', turnId: 'r1' })
    await $.session.append(respond([text('One back.')], 'm3'))
    clock.now += 1_000
    await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r1', reason: 'answer' })
  })()
  expect(await last()).toMatch(/^ {2}waiting · 2 agents · /)
  expect(await receiptsUnder($, 'One back.')).toEqual([expect.stringMatching(/^─ waiting · 2 agents ─+ no steps · 1s$/)])

  await report($, 'ag-Read seat', '43 lines')
  await report($, 'ag-Read switch', '42 lines')
  expect(await last()).toMatch(/^ {2}done · /)
  await docked.unmount()
})

test('5. turns are numbered by typed prompts: a report turn is part of the typed turn that launched its agents', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  const label = async () => (await paneOf(docked)).find(r => /^┄ \[ (NOW|LAST) \]/.test(r))

  await run($, clock, 3)
  expect(await label()).toMatch(/ turn 1 · \d\d:\d\d$/)
  // The launch and its settled count stay in the typed turn's own [ STEPS ], not `STEPS · TURN n`.
  expect(await paneOf(docked)).toContainEqual(expect.stringMatching(/^┄ \[ STEPS \] ┄+ 1 step$/))
  expect(await paneOf(docked)).toContainEqual(expect.stringMatching(/^ {2}agent {4}3 launched +3 done/))

  await (async () => {
    await typed($, 'nest')
    await $.turn.start({ text: 'nest', turnId: 't2' })
    expect(await label()).toMatch(/ turn 2$/)
    await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 't2', reason: 'answer' })
    await delivered($, 'x')
    await $.turn.start({ text: '<agent-message>', turnId: 'r3' })
    expect(await label()).toMatch(/ turn 2$/)
    await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r3', reason: 'answer' })
  })()
  expect(await label()).toMatch(/ turn 2 · \d\d:\d\d$/)
  await docked.unmount()
})

test('the nested agent of the sequence: inset under its parent, its launch settled, its report turn with a receipt', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  await run($, clock, 4)

  const rows = await paneOf(docked)
  expect(rows.filter(r => /^ *◇ Nest/.test(r)).map(r => r.slice(0, 16))).toEqual(['◇ Nest parent   ', '  ◇ Nest child  '])
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}agent {4}1 launched +1 done/))
  expect(await receiptsUnder($, 'It is 42.')).toEqual([expect.stringMatching(/^─ done ─+ no steps · 1s$/)])
  expect(await receiptsUnder($, 'Parent launched.')).toEqual([expect.stringMatching(/^─ waiting · 1 agent ─+ 1 step · 2s$/)])
  await docked.unmount()
})

test('nested, to the end: parent launches child, child reports, parent is woken, parent reports; all three places read done', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)

  await typed($, 'nest')
  await $.turn.start({ text: 'nest', turnId: 't1' })
  await $.tool.call({ tool: 'Agent', description: 'Nest parent', prompt: 'go', tool_use_id: 'n1' } as never)
  await spawn($, 'n1', 'Nest parent')
  await $.tool.call({ tool: 'Agent', description: 'Nest child', prompt: 'go', tool_use_id: 'k1', agentId: 'ag-Nest parent' } as never)
  await spawn($, 'k1', 'Nest child', 'ag-Nest parent')
  await $.session.append(respond([text('Parent launched.')], 'm1'))
  clock.now += 2_000
  await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 't1', reason: 'answer' })

  // The child reports to its parent; the engine wakes the parent (its id again, no call); the parent reports.
  clock.now += 3_000
  await report($, 'ag-Nest child', '42')
  await spawn($, '', 'Nest parent')
  await report($, 'ag-Nest parent', '42 lines')
  // A wake-up after the final report (seen on screen) changes nothing.
  await spawn($, '', 'Nest parent')

  // The parent's report reaches the main loop as a turn of its own.
  await delivered($, 'ag-Nest parent')
  await $.turn.start({ text: '<agent-message>', turnId: 'r1' })
  await $.session.append(respond([text('Agent "Nest parent" finished: 42.')], 'm2'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r1', reason: 'answer' })

  const rows = await paneOf(docked)
  // The head.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}done · /))
  expect(rows.some(r => /waiting/.test(r))).toBe(false)
  // The roster: its label's totals match its rows.
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ AGENTS \] ┄+ 2 done · 1 nested$/))
  expect(rows.filter(r => /^ *◇ Nest/.test(r))).toEqual([
    expect.stringMatching(/^◇ Nest parent {12}done {3}42 lines/),
    expect.stringMatching(/^ {2}◇ Nest child {11}done {3}42/)
  ])
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}agent {4}1 launched +1 done/))
  // The receipts: waiting while the parent ran, done once it had reported.
  expect(await receiptsUnder($, 'Parent launched.')).toEqual([expect.stringMatching(/^─ waiting · 1 agent ─/)])
  expect(await receiptsUnder($, 'Agent "Nest parent" finished: 42.')).toEqual([expect.stringMatching(/^─ done ─+ no steps · 1s$/)])

  // The next typed turn is done too: nothing is left running.
  await typed($, 'thanks')
  await $.turn.start({ text: 'thanks', turnId: 't2' })
  await $.session.append(respond([text('You are welcome.')], 'm3'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(await receiptsUnder($, 'You are welcome.')).toEqual([expect.stringMatching(/^─ done ─/)])
  await docked.unmount()
})

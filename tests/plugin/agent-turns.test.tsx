import { expect, test } from 'claude-code/testing'

import { TOKEN } from '../../hooks/shared/look/palette'
import { ON, PANE, T0, VIEW } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { respond, rowOf } from '../support/respond'

// Phase 5 screen check, as seen on screen: three background agents whose reports arrive as turns of their own
// (the first alone, the other two together), then a nested agent. Each turn that answers ends with exactly one
// receipt, keyed by its own turn; the roster stays until the next typed prompt; `waiting · N agents` while any
// runs; and turns are numbered by typed prompts only.
const ASYNC = { result: { status: 'async_launched', agentId: 'x', description: 'x' }, text: 'launched' }
const FOOTER = (durationMs: number) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'TurnDuration', viewport: VIEW, props: { word: 'Baked', durationMs } }) as const
const ANSWER = (t: string) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', ...rowOf(t), viewport: VIEW, props: { text: t, isFirstOfReply: true } }) as const

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
const receiptsUnder = async ($: Engine, answer: string) => (await rowsOf($, ANSWER(answer))).filter(r => /✓  DONE|×  FAILED|!  WAITING/.test(r))
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

test('1. a typed turn has exactly one receipt, under the answer of its last engine turn, once no agent runs (7.12)', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  await run($, clock, 4)

  // While its agents ran, an engine turn's answer drew no receipt; the turn's one receipt is under its last answer.
  for (const [answer, n] of [
    ['Three agents launched.', 0],
    ['Read switch agent done soon; draw.tsx: 25 lines.', 0],
    ['All three done: 43, 42, 25.', 1],
    ['Parent launched.', 0],
    ['It is 42.', 1]
  ] as const) {
    expect(await receiptsUnder($, answer)).toHaveLength(n)
  }

  // The engine's one footer for both report turns (12s, matching neither) draws nothing.
  expect(await rowsOf($, FOOTER(12_225))).toEqual([])
  await docked.unmount()
})

test('2. the typed turn`s receipt counts it whole, from its header: every step, its agents, its time; it never changes', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  await run($, clock, 3)

  // 3s of launching, 4s waiting, the first report (1s), 2s waiting, the other two (2s): 12s, one step, three agents.
  const first = await receiptsUnder($, 'All three done: 43, 42, 25.')
  expect(first).toEqual([expect.stringMatching(/^ +12s ✓  DONE   [⣀-⣿]+   1 step · 3 agents$/)])
  const launch = await receiptsUnder($, 'Three agents launched.')
  expect(launch).toEqual([])

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
  // The launch group's agents on the timeline (8.3).
  const agents = async () => (await paneOf(docked)).filter(r => /^ {2}[├└] [◇×] /.test(r))

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
  expect(frozen.map(r => /[├└] [◇×] (.+?) {2,}/.exec(r)?.[1])).toEqual(['Read seat', 'Read switch', 'Read draw'])
  clock.now += 60_000
  expect(await agents()).toEqual(frozen)

  await typed($, 'next')
  await $.turn.start({ text: 'next', turnId: 't2' })
  expect(await agents()).toEqual([])
  await docked.unmount()
})

test('4. while a background agent runs, the head says it waits on them and no receipt is drawn: WAITING is the API`s', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  const waiting = async () => (await paneOf(docked)).find(r => /^ {2}Waiting on /.test(r))?.trimEnd()

  const pill = async () => (await paneOf(docked)).find(r => /^ {2}▐ /.test(r))?.trimEnd()

  await run($, clock, 1)
  expect(await waiting()).toBe('  Waiting on 3 agents')
  expect(await receiptsUnder($, 'Three agents launched.')).toEqual([])
  // Until the turn's receipt draws, the turn is live: `● LIVE`, its range ending `now` (3. in the round 5 list).
  expect(await pill()).toMatch(/^ {2}▐ ● LIVE ▌ {2}TURN 1 .*→ now$/)

  await (async () => {
    clock.now += 4_000
    await delivered($, 'ag-Read draw')
    await report($, 'ag-Read draw', '25 lines')
    await $.turn.start({ text: '<agent-message>', turnId: 'r1' })
    await $.session.append(respond([text('One back.')], 'm3'))
    clock.now += 1_000
    await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r1', reason: 'answer' })
  })()
  expect(await waiting()).toBe('  Waiting on 2 agents')
  expect(await receiptsUnder($, 'One back.')).toEqual([])

  expect(await pill()).toMatch(/● LIVE/)

  await report($, 'ag-Read seat', '43 lines')
  await report($, 'ag-Read switch', '42 lines')
  expect(await waiting()).toBeUndefined()
  expect(await pill()).toMatch(/^ {2}▐ ✓ DONE ▌/)
  await docked.unmount()
})

test('5. turns are numbered by typed prompts: a report turn is part of the typed turn that launched its agents', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  const label = async () => (await paneOf(docked)).find(r => /^ {2}▐ . \w+ ▌  TURN \d+/.test(r))

  await run($, clock, 3)
  expect(await label()).toMatch(/▐ ✓ DONE ▌  TURN 1 +\d\d:\d\d:\d\d → \d\d:\d\d:\d\d/)
  // The launch and its settled count stay in the typed turn's own head and timeline.
  expect(await paneOf(docked)).toContainEqual(expect.stringMatching(/^ {2}1 step /))
  expect(await paneOf(docked)).toContainEqual(expect.stringMatching(/^ {2}◇ agent 3 launched .* 3 agents *$/))

  await (async () => {
    await typed($, 'nest')
    await $.turn.start({ text: 'nest', turnId: 't2' })
    expect(await label()).toMatch(/▐ ● LIVE ▌  TURN 2 .*→ now/)
    await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 't2', reason: 'answer' })
    await delivered($, 'x')
    await $.turn.start({ text: '<agent-message>', turnId: 'r3' })
    expect(await label()).toMatch(/▐ ● LIVE ▌  TURN 2 .*→ now/)
    await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 'r3', reason: 'answer' })
  })()
  expect(await label()).toMatch(/▐ ✓ DONE ▌  TURN 2 +\d\d:\d\d:\d\d → \d\d:\d\d:\d\d/)
  await docked.unmount()
})

test('the nested agent of the sequence: inset under its parent, its launch settled, its report turn with a receipt', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const docked = await $.ui.mount(PANE)
  await run($, clock, 4)

  const rows = await paneOf(docked)
  // The timeline lists the main loop's agent; its child is the parent's own (8.3).
  expect(rows.filter(r => /◇ Nest/.test(r))).toEqual([expect.stringMatching(/^ {2}└ ◇ Nest parent /)])
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}◇ agent 1 launched .* 1 agent *$/))
  // Turn 2's one receipt counts it whole: the launch and its agent, 3s from the header.
  expect(await receiptsUnder($, 'It is 42.')).toEqual([expect.stringMatching(/^ +3s ✓  DONE   [⣀-⣿]+   1 step · 1 agent$/)])
  expect(await receiptsUnder($, 'Parent launched.')).toEqual([])
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
  expect(rows).toContainEqual(expect.stringMatching(/▐ ✓ DONE ▌  TURN 1 /))
  expect(rows.some(r => /Waiting on/.test(r))).toBe(false)
  // The agents: the tab counts the main loop's one; its row says it is done, with its report's head.
  expect(rows).toContainEqual(expect.stringMatching(/AGENTS 1$/))
  expect(rows.filter(r => /◇ Nest/.test(r))).toEqual([expect.stringMatching(/^ {2}└ ◇ Nest parent /)])
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}✓ reported · 1 step +done *$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}◇ agent 1 launched .* 1 agent *$/))
  // One receipt: none while the parent ran, the whole turn's once it had reported (2s, 3s waiting, 1s).
  expect(await receiptsUnder($, 'Parent launched.')).toEqual([])
  expect(await receiptsUnder($, 'Agent "Nest parent" finished: 42.')).toEqual([expect.stringMatching(/^ +6s ✓  DONE   [⣀-⣿]+   1 step · 1 agent$/)])

  // The next typed turn is done too: nothing is left running.
  await typed($, 'thanks')
  await $.turn.start({ text: 'thanks', turnId: 't2' })
  await $.session.append(respond([text('You are welcome.')], 'm3'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 1_000, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(await receiptsUnder($, 'You are welcome.')).toEqual([expect.stringMatching(/✓  DONE/)])
  await docked.unmount()
})

const BAND = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 100, rows: 40, isFullscreen: true },
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10 }
} as never

test('A. no pane docked: the band above the prompt says `◇◇◇  Waiting on 3 agents`, its count in place; docked, it draws nothing', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const band = async () => {
    const ui = await $.ui.mount(BAND)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => ({ text: t.text, color: t.props['color'] }))
    await ui.unmount()

    return texts.filter(t => t.text.trim().length > 0)
  }

  await run($, clock, 1)
  expect((await band()).map(t => t.text)).toContainEqual('◇◇◇  Waiting on 3 agents')
  expect((await band()).find(t => t.text === '◇◇◇  Waiting on 3 agents')?.color).toBe(TOKEN.agent)

  await report($, 'ag-Read seat', '43 lines')
  expect((await band()).map(t => t.text)).toContainEqual('◇◇  Waiting on 2 agents')

  // Docked, the pane head says it; the band is left to the engine.
  await (await $.ui.mount(PANE)).unmount()
  expect((await band()).some(t => /Waiting on/.test(t.text))).toBe(false)
})

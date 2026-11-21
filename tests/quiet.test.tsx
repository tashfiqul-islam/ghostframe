import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Phase 4, the quiet left: while Cockpit is on and its pane docked, the transcript shows the conversation only.
type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const ON = { options: { cockpit: true } }
const VIEW = { columns: 127, rows: 50, isFullscreen: true }
const T0 = new Date(2026, 10, 21, 10, 26, 45).getTime()

const PANE = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'cockpit',
  props: { title: 'cockpit', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 42, contentRows: 42 }, view: {} },
  viewport: VIEW
} as const

const respond = (content: unknown[], uuid: string) =>
  ({ message: { type: 'assistant', role: 'assistant', content }, door: 'response', origin: { kind: 'model' }, uuid }) as never
const text = (t: string) => ({ type: 'text', text: t })
const use = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input })

const NARRATION = "I'll run the width tests first to see what fails on CI."
const AGAIN = 'Running the width tests again now that the runner is pinned.'
const ANSWER = 'Fixed: CI ran an old Bun whose bundled ICU split the skin-tone modifier; the runner is now pinned.'

type Call = { id: string; tool: string; input: Record<string, unknown>; result: Record<string, unknown>; ms: number }

/** The engine's side of a turn: the clock, the calls' results, and an engine drawing beneath every site. */
function engine(on: On, calls: readonly Call[], clock: { now: number }) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', (_, e) => {
    const call = calls.find(c => c.id === e.tool_use_id)
    clock.now += call?.ms ?? 1_000

    return (call?.result ?? { result: {} }) as never
  })
}

const FAIL = { isError: true, text: 'Exit code 1\n 12 pass\n 2 fail\n', result: 'Exit code 1\n 12 pass\n 2 fail\n' }
const CALLS: Call[] = [
  { id: 't1', tool: 'Bash', input: { command: 'bun test width' }, result: FAIL, ms: 41_000 },
  {
    id: 'e1',
    tool: 'Edit',
    input: { file_path: '.github/workflows/ci.yml' },
    result: { result: { structuredPatch: [{ lines: ['+a', '-b'] }] }, text: 'ok' },
    ms: 2_000
  },
  {
    id: 't2',
    tool: 'Bash',
    input: { command: 'bun test width' },
    result: { result: { stdout: ' 14 pass\n 0 fail\n', stderr: '' }, text: ' 14 pass' },
    ms: 60_000
  }
]

/** One fixed-on-the-second-run turn, as the engine raises it: 2m 44s on Cockpit's clock, 2m 40s on the engine's. */
async function fixedTurn($: Engine, clock: { now: number }) {
  await $.prompt.submit({ text: 'the width tests fail on CI, fix it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'the width tests fail on CI, fix it', turnId: 't1' })
  await $.session.append(respond([text(NARRATION), use('t1', 'Bash', { command: 'bun test width' })], 'r1'))
  await $.tool.call({ tool: 'Bash', command: 'bun test width', tool_use_id: 't1' } as never)
  await $.session.append(respond([use('e1', 'Edit', { file_path: '.github/workflows/ci.yml' })], 'r2'))
  await $.tool.call({ tool: 'Edit', file_path: '.github/workflows/ci.yml', tool_use_id: 'e1' } as never)
  await $.session.append(respond([text(AGAIN), use('t2', 'Bash', { command: 'bun test width' })], 'r3'))
  await $.tool.call({ tool: 'Bash', command: 'bun test width', tool_use_id: 't2' } as never)
  await $.session.append(respond([text(ANSWER)], 'r4'))
  clock.now = T0 + 164_000
  await $.turn.complete({ answer: ANSWER, durationMs: 160_000, isAborted: false, turnId: 't1', reason: 'answer' })
}

const message = (t: string) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: t, isFirstOfReply: true } }) as const
const receipt = (durationMs: number) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'TurnDuration', viewport: VIEW, props: { word: 'Baked', durationMs } }) as const
const group = (calls: unknown[]) =>
  ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolGroup',
    viewport: VIEW,
    props: { calls, isActive: false, isExpanded: false, isCallsOnly: true }
  }) as never

const groupCall = (id: string, command: string, output: Record<string, unknown>) => ({
  tool_use_id: id,
  tool: 'Bash',
  input: { command },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output
})

test('docked: narration draws nothing; the answer stays, with `claude`', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  const pane = await $.ui.mount(PANE)
  await fixedTurn($, clock)

  for (const said of [NARRATION, AGAIN]) {
    const ui = await $.ui.mount(message(said))
    expect(await ui.find({ type: 'Text', text: /\S/ })).toBeUndefined()
    await ui.unmount()
  }

  const answer = await $.ui.mount(message(ANSWER))
  expect(await answer.find({ type: 'Text', text: /old Bun/ })).toBeDefined()
  expect(await answer.findAll({ type: 'Text', text: /^claude$/ })).toHaveLength(1)
  await answer.unmount()
  await pane.unmount()
})

test('docked: while the turn runs, its text waits unseen until it is known not to be narration: no flash', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'fix it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix it', turnId: 't1' })

  // Raised before the engine stores its message (and the tool call after it): nothing yet.
  const early = await $.ui.mount(message(NARRATION))
  expect(await early.find({ type: 'Text', text: /\S/ })).toBeUndefined()
  await $.session.append(respond([text(NARRATION), use('t1', 'Bash', { command: 'bun test width' })], 'r1'))
  await early.redraw()
  expect(await early.find({ type: 'Text', text: /\S/ })).toBeUndefined()
  await early.unmount()

  // The answer, once the turn has ended, draws.
  await $.session.append(respond([text(ANSWER)], 'r2'))
  const answer = await $.ui.mount(message(ANSWER))
  expect(await answer.find({ type: 'Text', text: /\S/ })).toBeUndefined()
  clock.now = T0 + 5_000
  await $.turn.complete({ answer: ANSWER, durationMs: 5_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await answer.redraw()
  expect(await answer.find({ type: 'Text', text: /old Bun/ })).toBeDefined()
  await answer.unmount()
  await pane.unmount()
})

test('docked: text before a question to the person stays, the person must act on it', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, [], clock)
  const pane = await $.ui.mount(PANE)
  const ask = 'Two ways to land this: a squash merge or a rebase.'
  await $.turn.start({ text: 'land it', turnId: 't1' })
  await $.session.append(respond([text(ask), use('q1', 'AskUserQuestion', { questions: [] })], 'r1'))

  const ui = await $.ui.mount(message(ask))
  expect(await ui.find({ type: 'Text', text: /squash merge/ })).toBeDefined()
  await ui.unmount()
  await pane.unmount()
})

test('docked: a tool group draws nothing: no activity header, no summary', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  const pane = await $.ui.mount(PANE)
  await fixedTurn($, clock)

  const ui = await $.ui.mount(group([groupCall('t1', 'bun test width', { stdout: ' 12 pass\n 2 fail\n', stderr: '' })]))
  expect(await ui.find({ type: 'Text', text: /\S/ })).toBeUndefined()
  await ui.unmount()
  await pane.unmount()
})

test('docked: a push and a pull request each leave one `↗` row; a commit leaves none (E.5)', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, [], clock)
  const pane = await $.ui.mount(PANE)

  const ui = await $.ui.mount(
    group([
      groupCall('c1', 'git commit -m "ci: pin Bun"', { stdout: '[fix/ci 7be09d2] ci: pin Bun\n 1 file changed\n', stderr: '' }),
      groupCall('p1', 'git push -u origin fix/ci', { stdout: '', stderr: ' * [new branch]      fix/ci -> fix/ci\n' }),
      groupCall('g1', 'gh pr create --fill', { stdout: 'https://github.com/o/r/pull/12\n', stderr: '' })
    ])
  )
  const rows = (await ui.findAll({ type: 'Text', text: /\S/ })).map(t => t.text)
  expect(rows.filter(r => /^↗ \S/.test(r))).toEqual(['↗ pushed fix/ci', '↗ PR #12 opened'])
  expect(rows).toContain('https://github.com/o/r/pull/12')
  expect(rows.some(r => /7be09d2|±/.test(r))).toBe(false)
  await ui.unmount()
  await pane.unmount()
})

test('docked: the receipt replaces the footer: `done`, the counts, and the one clock the pane shows', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  const pane = await $.ui.mount(PANE)
  await fixedTurn($, clock)

  const ui = await $.ui.mount(receipt(160_000))
  // Each row is one Text with its parts as Texts inside it: a row is a Text that starts one.
  const rows = (await ui.findAll({ type: 'Text', text: /^─ \w/ })).map(t => t.text)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatch(/^─ done ─+ 3 steps · 1 failure → fixed · 1 file · 2m 44s$/)
  expect(rows[0]?.length).toBe(108)
  expect(await ui.find({ type: 'Text', text: /tokens|turn \d/ })).toBeUndefined()
  await ui.unmount()

  // The pane's head reads the same duration.
  const head = await pane.find({ type: 'Text', text: /^ {2}done/ })
  expect(head?.text).toMatch(/ 2m 44s$/)
  await pane.unmount()
})

test('docked: a footer raised before its turn`s receipt is kept draws nothing, never the old footer, then the receipt', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'run it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'run it', turnId: 't1' })

  const ui = await $.ui.mount(receipt(9_000))
  expect(await ui.find({ type: 'Text', text: /\S/ })).toBeUndefined()

  clock.now = T0 + 9_000
  await $.turn.complete({ answer: 'x', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await ui.redraw()
  expect((await ui.find({ type: 'Text', text: /^─ done/ }))?.text).toMatch(/ 9s$/)
  await ui.unmount()
  await pane.unmount()
})

test('docked: a failure nothing fixed gets a `still failing` row above the receipt, at the failure`s clock', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, [CALLS[0] as Call], clock)
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'run the width tests', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'run the width tests', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'bun test width', tool_use_id: 't1' } as never)
  clock.now = T0 + 48_000
  await $.turn.complete({ answer: 'x', durationMs: 47_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount(receipt(47_000))
  const rows = (await ui.findAll({ type: 'Text', text: /^(✕|─) \w/ })).map(t => t.text)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatch(/^✕ still failing · test · bun test width · 2 of 14 fail +41s$/)
  expect(rows[1]).toMatch(/^─ failed ─+ 1 step · 1 failure · 48s$/)
  await ui.unmount()
  await pane.unmount()
})

test('docked: a turn that committed names its commit in the receipt, `± <sha>`, before the time', ON, async ($, on) => {
  const clock = { now: T0 }
  const commit: Call = {
    id: 'c1',
    tool: 'Bash',
    input: { command: 'git commit -m "ci: pin Bun"' },
    result: { result: { stdout: '[fix/ci 7be09d2a1] ci: pin Bun\n 1 file changed\n', stderr: '' }, text: 'ok' },
    ms: 1_000
  }
  engine(on, [...CALLS, commit], clock)
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'fix and commit', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix and commit', turnId: 't1' })

  for (const c of [...CALLS, commit]) await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)

  clock.now = T0 + 164_000
  await $.turn.complete({ answer: 'x', durationMs: 160_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount(receipt(160_000))
  expect((await ui.find({ type: 'Text', text: /^─ done/ }))?.text).toMatch(/ 4 steps · 1 failure → fixed · 1 file · ± 7be09d2 · 2m 44s$/)
  await ui.unmount()
  await pane.unmount()
})

test('docked: an interrupted turn has no receipt (correction G)', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, [], clock)
  const pane = await $.ui.mount(PANE)
  await $.turn.start({ text: 'sleep', turnId: 't1' })
  clock.now = T0 + 9_000
  await $.turn.complete({ answer: '', durationMs: 9_000, isAborted: true, turnId: 't1', reason: 'aborted' } as never)

  const ui = await $.ui.mount(receipt(9_000))
  expect(await ui.find({ type: 'Text', text: /\S/ })).toBeUndefined()
  await ui.unmount()
  await pane.unmount()
})

test('docked: nothing ghostframe draws on the left passes 120 columns, at any width (spec C)', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  const pane = await $.ui.mount(PANE)
  await fixedTurn($, clock)

  for (const columns of [127, 167, 240]) {
    const viewport = { columns, rows: 50, isFullscreen: true }
    const long = `${ANSWER} ${'More words to fill a long paragraph that wraps over several rows. '.repeat(6)}`
    const sites = [await $.ui.mount({ ...message(long), viewport }), await $.ui.mount({ ...receipt(160_000), viewport })]

    for (const ui of sites) {
      for (const t of await ui.findAll({ type: 'Text' })) {
        for (const row of t.text.split('\n')) expect(row.length).toBeLessThanOrEqual(120)
      }

      await ui.unmount()
    }
  }

  await pane.unmount()
})

test('off: the transcript is as it was: narration and the old footer draw', async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  await fixedTurn($, clock)

  const said = await $.ui.mount(message(NARRATION))
  expect(await said.find({ type: 'Text', text: /width tests first/ })).toBeDefined()
  await said.unmount()

  const footer = await $.ui.mount(receipt(160_000))
  expect(await footer.find({ type: 'Text', text: /^─ done/ })).toBeUndefined()
  expect(await footer.find({ type: 'Text', text: /2m 40s/ })).toBeDefined()
  await footer.unmount()
})

test('on, but no pane docked: the transcript is as it was', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, CALLS, clock)
  await fixedTurn($, clock)

  const said = await $.ui.mount(message(NARRATION))
  expect(await said.find({ type: 'Text', text: /width tests first/ })).toBeDefined()
  await said.unmount()
})

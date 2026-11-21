import { expect, test } from 'claude-code/testing'

import { ON, T0, VIEW, PANE } from '../support/cockpit'
import { NARRATION, engine, CALLS, fixedTurn, message, ANSWER } from '../support/docked'
import type { Call } from '../support/docked'

// Phase 4, the quiet left: while Cockpit is on and its pane docked, the transcript shows the conversation only.
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

test('docked: a still-failing result that only repeats its subject is said once: `shell · exit 3`', ON, async ($, on) => {
  const clock = { now: T0 }
  const exit3: Call = { id: 'x1', tool: 'Bash', input: { command: 'exit 3' }, result: { isError: true, text: 'Exit code 3', result: 'Exit code 3' }, ms: 1_000 }
  engine(on, [exit3], clock)
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'exit 3', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'exit 3', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'exit 3', tool_use_id: 'x1' } as never)
  clock.now = T0 + 3_000
  await $.turn.complete({ answer: 'x', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount(receipt(3_000))
  const still = (await ui.findAll({ type: 'Text', text: /^✕ still failing/ })).map(t => t.text)
  expect(still).toEqual([expect.stringMatching(/^✕ still failing · shell · exit 3 +1s$/)])
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

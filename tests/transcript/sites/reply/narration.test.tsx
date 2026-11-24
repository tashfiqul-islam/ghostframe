import { expect, test } from 'claude-code/testing'

import { TOKEN } from '../../../../hooks/shared/look/palette'
import { ON, T0, PANE } from '../../../support/cockpit'
import { respond } from '../../../support/respond'
import { text, use, engine, message, NARRATION, ANSWER, CALLS, AGAIN, fixedTurn } from '../../../support/docked'

test('docked: narration draws nothing; the answer stays, its lead sentence bright (7.4)', ON, async ($, on) => {
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
  expect((await answer.findAll({ type: 'Text' })).some(t => t.props['color'] === TOKEN.textBright && /Fixed:/.test(t.text))).toBe(true)
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

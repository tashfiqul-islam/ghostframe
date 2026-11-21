import { expect, test } from 'claude-code/testing'

import { VIEW, T0, ON, PANE } from '../support/cockpit'

const SPINNER = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'Spinner',
  viewport: VIEW,
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' }
} as const

test('docked, the left live row is one `working` row with the turn`s time on the time edge', ON, async ($, on) => {
  let now = T0
  on('clock.now', () => ({ value: now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  await $.prompt.submit({ text: 'fix the width bug', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the width bug', turnId: 't1' })
  const pane = await $.ui.mount(PANE)
  now = T0 + 76_000

  const live = await $.ui.mount(SPINNER)
  const row = await live.find({ type: 'Text', text: /working/ })
  expect(row?.text).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] working +1m 16s$/)
  expect(row?.text.length).toBe(120)
  expect(await live.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  await live.unmount()
  await pane.unmount()
})

test('off, the left live row is the engine`s', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const live = await $.ui.mount(SPINNER)
  expect(await live.find({ type: 'Text', text: /working/ })).toBeUndefined()
  expect((await live.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await live.unmount()
})

import { expect, mock, test } from 'claude-code/testing'

import { OFF, ON, PANE, SLOW, T0, VIEW } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { holdTimers } from '../support/clock'

const SPINNER = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'Spinner',
  viewport: VIEW,
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' }
} as const

test('docked, the left live area is the live line: its time, the spinner, the sentence (7.11)', ON, async ($, on) => {
  let now = T0
  on('clock.now', () => ({ value: now }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  await $.prompt.submit({ text: 'fix the width bug', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the width bug', turnId: 't1' })
  const pane = await $.ui.mount(PANE)
  now = T0 + 76_000

  const live = await $.ui.mount(SPINNER)
  // The live line (7.11): `┊` above it, the turn's elapsed time in its label, the spinner, what Claude is doing.
  const rows = (await live.findAll({ type: 'Text' })).map(t => t.text)
  expect(rows).toContain('             ┊')
  expect(rows.find(r => /Thinking/.test(r))).toMatch(/^ {6}1m 16s [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]  Thinking$/)
  expect(await live.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  await live.unmount()
  await pane.unmount()
})

test('off, the left live row is the engine`s', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const live = await $.ui.mount(SPINNER)
  expect(await live.find({ type: 'Text', text: /Thinking/ })).toBeUndefined()
  expect((await live.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await live.unmount()
})

/** Typed turn `n`, which reads `n` files, each its own step. */
async function readingTurn($: Engine, n: number) {
  await $.prompt.submit({ text: `turn ${n}`, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: `turn ${n}`, turnId: `e${n}` })

  for (let i = 0; i < n; i++) await $.tool.call({ tool: 'Read', file_path: `f${n}-${i}.ts`, tool_use_id: `t${n}r${i}` } as never)

  await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: `e${n}`, reason: 'answer' })
}

test('7.15: `/steps all` run in turn 5 still prints turn 5`s steps when drawn again in turn 8', SLOW, async ($, on) => {
  let now = T0
  mock.store(on)
  on('clock.now', () => ({ value: now }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', () => {
    now += 1_000

    return { result: { file: { numLines: 3 } }, text: 'ok' }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })

  for (let n = 1; n <= 5; n++) await readingTurn($, n)

  const out = await $.command.run({ command: 'steps', args: 'all', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const row = {
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'CommandOutput',
    requestId: 'out-steps-all',
    viewport: VIEW,
    props: { command: 'steps', args: '', text: `ghostframe: ${out.text ?? ''}`, isErrored: false }
  } as never
  const head = async () => {
    const ui = await $.ui.mount(row)
    const found = (await ui.findAll({ type: 'Text' })).map(t => t.text).find(t => t.includes('STEPS · TURN'))
    await ui.unmount()

    return found?.trim()
  }

  expect(await head()).toBe('│  STEPS · TURN 5 · 5 steps')

  for (let n = 6; n <= 8; n++) await readingTurn($, n)

  expect(await head()).toBe('│  STEPS · TURN 5 · 5 steps')
})

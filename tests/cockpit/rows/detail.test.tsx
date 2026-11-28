import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../../support/cockpit'
import { holdTimers } from '../../support/clock'

// 8.3's `└` detail line under a failed group: the decisive line of the output, from the same source fallback's
// failure rows use, never the engine's `Error: Exit code n` wrapper (the manual run's turn 9, docked).
test('8. docked, a failed `ls`: its detail line is `ls: cannot access …`, never `Error: Exit code 2`', ON, async ($, on) => {
  const clock = { now: T0 }
  const said = "Error: Exit code 2\nls: cannot access '/nope1': No such file or directory"
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => {
    clock.now += 1_000

    return { isError: true, text: said, result: said } as never
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  await $.prompt.submit({ text: 'ls /nope1', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'ls /nope1', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls /nope1', tool_use_id: 'l1' } as never)
  const pane = await $.ui.mount(PANE)
  const rows = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}└ ls: cannot access '\/nope1': No such file or directory *$/))
  expect(rows.some(r => /Exit code/.test(r))).toBe(false)
})

test('8. docked, an error that says only its exit code: no `└` line at all, never an empty one', ON, async ($, on) => {
  const clock = { now: T0 }
  const said = 'Error: Exit code 2'
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => {
    clock.now += 1_000

    return { isError: true, text: said, result: said } as never
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  await $.prompt.submit({ text: 'ls /nope1', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'ls /nope1', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls /nope1', tool_use_id: 'l1' } as never)
  const pane = await $.ui.mount(PANE)
  const rows = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  expect(rows.some(r => /^ {2}└/.test(r))).toBe(false)
})

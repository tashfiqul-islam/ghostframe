import { expect, test } from 'claude-code/testing'

import { PANE } from '../support/cockpit'

// Cockpit is on by default; this test says so with ON.
test('from tool.call to the pane: the main loop`s calls are the turn`s [ STEPS ]', { options: { cockpit: true } }, async ($, on) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: (now += 1_000) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: { file: { numLines: 9 } }, text: 'ok' }))

  await $.turn.start({ text: 'read two files', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'r1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'b.ts', tool_use_id: 'r2' } as never)
  // A subagent's call is its own, not the main loop's step.
  await $.tool.call({ tool: 'Read', file_path: 'c.ts', tool_use_id: 'r3', agentId: 'x' } as never)

  const ui = await $.ui.mount(PANE)
  // The head card counts the main loop's steps; the timeline has a group for them (8.2, 8.3).
  expect((await ui.find({ type: 'Text', text: /^ {2}2 steps/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /read a\.ts/ }))?.text).toMatch(/^ {2}✓ read a\.ts +[━╸╺ ┊]+ +9 lines $/)
  expect(await ui.find({ type: 'Text', text: /c\.ts/ })).toBeUndefined()
  await ui.unmount()

  // A new typed turn starts an empty log: no section until its first step.
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'next', turnId: 't2' })
  const fresh = await $.ui.mount(PANE)
  expect(await fresh.find({ type: 'Text', text: /read a\.ts/ })).toBeUndefined()
  expect(await fresh.find({ type: 'Text', text: /Steps, files, sources and agents appear here as Claude works\./ })).toBeDefined()
  await fresh.unmount()
})

import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { use } from '../support/docked'
import { fallbackEngine, groupOf, rowsOf } from '../support/fallback'
import { respond } from '../support/respond'

// The live session's turn 3 (13.7): a settings rule `Bash(rm -rf:*)` refused a joined command. The step names the
// statement the rule matched, its path from the project root, not the line's first statement; the row says the rule,
// not the engine's `Permission to use Bash with command …` sentence.
const COMMAND = 'ls -la /d/Projects/cockpit-live/src && rm -rf /d/Projects/cockpit-live/src && ls /d/Projects/cockpit-live'
const CALL = { id: 'rm3', tool: 'Bash', input: { command: COMMAND } }

test('13.7: a rule`s block names the statement it matched and the rule, docked', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock, true)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.messages', () => ({ value: [] }))
  const store = new Map<string, unknown>()
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('tool.check', () => ({ decision: 'deny', rule: 'Bash(rm -rf:*)', reason: `Permission to use Bash with command ${COMMAND} has been denied.` }) as never)
  await $.session.start({ cwd: String.raw`D:\Projects\cockpit-live`, surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false } })
  await $.prompt.submit({ text: 'delete the src folder with rm -rf src', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'delete the src folder with rm -rf src', turnId: 't3' })
  await $.session.append(respond([use(CALL.id, CALL.tool, CALL.input)], 'm3'))
  await $.tool.check({ tool: 'Bash', command: COMMAND, tool_use_id: CALL.id, approver: 'rules' } as never)
  await $.tool.call({ tool: 'Bash', command: COMMAND, tool_use_id: CALL.id } as never)

  const rows = await rowsOf($, groupOf(CALL, 127, true))
  expect(rows.map(r => r.trim())).toContain('<1s ⊘  BLOCKED   by a rule · Bash(rm -rf:*)')
  expect(rows.join('\n')).not.toMatch(/Permission to use/)
  await pane.redraw()
  const paneRows = (await pane.findAll({ type: 'Text' })).map(t => t.text)
  expect(paneRows.some(r => r.includes('rm -rf src'))).toBe(true)
  expect(paneRows.some(r => r.includes('ls -la'))).toBe(false)
  await pane.unmount()
})

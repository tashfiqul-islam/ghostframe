import { expect, test } from 'claude-code/testing'

import { switchOf } from '../../hooks/cockpit/switch'
import { OFF, ON, PANE } from '../support/cockpit'
import type { Engine, On } from '../support/engine'

const PRESENTATION = { isFullscreen: true, columns: 200 }

/**
 * Starts a session with GHOSTFRAME_COCKPIT set to `env` (unset when undefined).
 * @returns the ids of the panes it opened and the commands it registered
 */
async function start($: Engine, on: On, env?: string): Promise<{ opened: string[]; registered: string[] }> {
  const opened: string[] = []
  const registered: string[] = []
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('env.get', (_, e) => ({ value: e.name === 'GHOSTFRAME_COCKPIT' ? env : undefined }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return { opened, registered }
}

test('on by default: the manifest`s default opens the pane at session start', async ($, on) => {
  expect((await start($, on)).opened).toEqual(['cockpit'])
})

test('GHOSTFRAME_COCKPIT=0 turns it off for a session, the option left on', ON, async ($, on) => {
  expect((await start($, on, '0')).opened).toEqual([])
})

// The session-start tests above and below carry the value to the switch; these read the value alone.
for (const env of ['false', 'OFF', 'No']) {
  test(`GHOSTFRAME_COCKPIT=${env} turns it off too: false, off and no in any case`, () => {
    expect(switchOf(env)).toBe(false)
  })
}

test('GHOSTFRAME_COCKPIT=true, ON or Yes turns it on too: true, on and yes in any case', () => {
  for (const env of ['true', 'ON', 'Yes']) expect(switchOf(env)).toBe(true)
})

test('GHOSTFRAME_COCKPIT set to anything else, or unset, leaves the option in charge', () => {
  for (const env of ['maybe', '2', ' 1', '']) expect(switchOf(env)).toBeUndefined()
})

test('off by the cockpit option: session start opens no pane, though /cockpit is still listed', OFF, async ($, on) => {
  const opened: string[] = []
  const registered: string[] = []
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('env.get', () => ({ value: undefined }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(opened).toEqual([])
  expect(registered).toContain('cockpit')
})

test('off: the pane draws nothing of its own and opens nothing on a width change', OFF, async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const ui = await $.ui.mount(PANE)
  // Only what the engine draws: Cockpit passed the site on.
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await ui.find({ type: 'Text', text: /\d/ })).toBeUndefined()
  expect(opened).toEqual([])
  await ui.unmount()
})

test('off: /cockpit opens nothing and says how to turn it on', OFF, async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))

  const said = await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })

  expect(opened).toEqual([])
  expect(said.text).toBe('cockpit is off · enable with /config (Cockpit pane) or GHOSTFRAME_COCKPIT=1')
})

test('GHOSTFRAME_COCKPIT=1 turns it on for a session, the option left off', OFF, async ($, on) => {
  const opened: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('env.get', (_, e) => ({ value: e.name === 'GHOSTFRAME_COCKPIT' ? '1' : undefined }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(opened).toEqual(['cockpit'])
})

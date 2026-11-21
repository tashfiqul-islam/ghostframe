import { expect, test } from 'claude-code/testing'

import { PANE } from '../support/cockpit'

const PRESENTATION = { isFullscreen: true, columns: 200 }

test('off by default: session start opens no pane, though /cockpit is still listed', async ($, on) => {
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

test('off: the pane draws nothing of its own and opens nothing on a width change', async ($, on) => {
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

test('off: /cockpit opens nothing and says how to turn it on', async ($, on) => {
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

test('GHOSTFRAME_COCKPIT=1 turns it on for a test session, the setting left off', async ($, on) => {
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

import { expect, test } from 'claude-code/testing'

import { OFF, ON } from '../support/cockpit'
import type { Engine, On } from '../support/engine'
import { VIEW } from '../support/view'

// The engine drift guard (docs/decisions/0012-engine-range.md): outside the manifest's tested range, ghostframe draws
// nothing of its own, says why once, and /cockpit explains; GHOSTFRAME_ENGINE_CHECK=0 turns the check off.

const RANGE = '>=2.1.329 <2.2.0'
const MANIFEST = JSON.stringify({ name: 'ghostframe', version: '1.0.0', engines: { 'claude-code': RANGE } })
const PRESENTATION = { isFullscreen: true, columns: 200 }
const USER = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'UserMessage',
  props: { text: 'fix the width tests', origin: { kind: 'composer' }, isExpanded: false },
  viewport: VIEW
} as const

/**
 * Starts a session on an engine of the given version, the manifest's range as shipped.
 * @returns the panes it opened and what it said: to the transcript, and to the debug log
 */
async function startOn($: Engine, on: On, version: string, check?: string) {
  const opened: string[] = []
  const said: string[] = []
  const debug: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.log', (_, e) => {
    ;(e.to === 'debug' ? debug : said).push(e.text)

    return { value: undefined }
  })
  on('env.get', (_, e) => ({ value: e.name === 'GHOSTFRAME_ENGINE_CHECK' ? check : undefined }))
  on('fs.read', (_, e) => {
    if (!e.path.replaceAll('\\', '/').endsWith('.claude-plugin/plugin.json')) throw new Error(`ENOENT: ${e.path}`)

    return { value: MANIFEST }
  })
  on('session.version', () => ({ value: { version, base: version } }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  return { opened, said, debug }
}

test('inside the range: Cockpit opens its pane and nothing is said', ON, async ($, on) => {
  const { opened, said } = await startOn($, on, '2.1.332')

  expect(opened).toEqual(['cockpit'])
  expect(said).toEqual([])
})

test('outside the range: no pane, one notice in the transcript and one line in the debug log', ON, async ($, on) => {
  const { opened, said, debug } = await startOn($, on, '2.2.0')

  expect(opened).toEqual([])
  expect(said).toEqual([
    'version 1.0.0 is tested with Claude Code 2.1.329 and later, below 2.2.0; this session runs 2.2.0, so it draws ' +
      'nothing and Claude Code looks as it does without it. Update ghostframe, or set GHOSTFRAME_ENGINE_CHECK=0 to try ' +
      'it anyway.'
  ])
  expect(debug.filter(line => line.includes('dormant'))).toEqual([`engine check: dormant, Claude Code 2.2.0 is outside ${RANGE}`])
})

test('below the floor is outside too', ON, async ($, on) => {
  expect((await startOn($, on, '2.1.328')).opened).toEqual([])
})

test('outside the range: /cockpit and /steps say why instead of opening anything', ON, async ($, on) => {
  const { said } = await startOn($, on, '2.2.0')

  for (const command of ['cockpit', 'steps']) {
    const answer = await $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })

    expect(answer.text).toBe(said[0])
  }
})

test('outside the range: the transcript sites hand their rows back to the engine, Cockpit on or off', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  await startOn($, on, '2.2.0')
  const ui = await $.ui.mount(USER)

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await ui.find({ type: 'Text', text: /^you$/ })).toBeUndefined()
  await ui.unmount()
})

test('GHOSTFRAME_ENGINE_CHECK=0 turns the check off: Cockpit opens on any engine', ON, async ($, on) => {
  const { opened, said, debug } = await startOn($, on, '2.2.0', '0')

  expect(opened).toEqual(['cockpit'])
  expect(said).toEqual([])
  expect(debug).toContain('engine check: GHOSTFRAME_ENGINE_CHECK=0, so the Claude Code version is not checked')
})

test('a version the engine does not report as a release leaves ghostframe awake and says so in the debug log', ON, async ($, on) => {
  const { opened, debug } = await startOn($, on, 'nightly')

  expect(opened).toEqual(['cockpit'])
  expect(debug.some(line => line.startsWith('engine check: the Claude Code version was not checked'))).toBe(true)
})

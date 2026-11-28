import { expect, test } from 'claude-code/testing'

import { OFF, ON } from '../support/cockpit'
import type { Engine, On } from '../support/engine'
import { VIEW } from '../support/view'
import { holdTimers } from '../support/clock'

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

test('outside the range: /cockpit and /steps say why instead of opening anything', ON, async ($, on) => {
  const { said } = await startOn($, on, '2.2.0')

  for (const command of ['cockpit', 'steps']) {
    const answer = await $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })

    expect(answer.text).toBe(said[0])
  }
})

// Every site that checks dormancy, with props it would otherwise draw itself: removing any one site's check fails its
// test, Cockpit on and off.
const SITES = [
  USER,
  { component: 'AssistantMessage', props: { text: 'The width tests pass now.', isFirstOfReply: true } },
  {
    component: 'AgentRow',
    requestId: 'a1',
    props: { id: 'a1', description: 'Read seat', type: 'Explore', status: 'running', taskStatus: 'running', rowIds: ['a1'], isHidden: false }
  },
  { component: 'SessionMode', props: { modes: ['plan mode on'] } },
  { component: 'TurnDuration', props: { word: 'Baked', durationMs: 3100 } },
  { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } },
  { component: 'CommandOutput', props: { command: 'effort', args: 'high', text: 'Applies from next turn', isErrored: false } },
  { component: 'InfoNotice', props: { text: 'Using the model from your settings', command: '/model' } },
  {
    component: 'ToolGroup',
    props: {
      calls: [
        {
          tool_use_id: 'g1',
          tool: 'Grep',
          input: { pattern: 'TODO' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
          output: { mode: 'count', numFiles: 1, filenames: [], numMatches: 3 }
        },
        {
          tool_use_id: 'g2',
          tool: 'Grep',
          input: { pattern: 'FIXME' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
          output: { mode: 'count', numFiles: 1, filenames: [], numMatches: 1 }
        }
      ],
      isActive: false,
      isExpanded: false,
      isCallsOnly: true
    }
  },
  {
    component: 'ToolUse',
    props: {
      tool_use_id: 'b1',
      tool: 'Bash',
      input: { command: 'bun test', description: 'Run the tests' },
      isRunning: false,
      isErrored: true,
      isInterrupted: false,
      output: 'Exit code 1\n 3 fail'
    }
  },
  { component: 'ToolResult', props: { tool_use_id: 'b1', tool: 'Bash', isErrored: true, output: 'Exit code 1\n 3 fail' } }
] as const

// The engine's stand-in draws the props it was handed, so a site that hands back edited props is seen too.
const engineRow = (props: unknown): string => `engine ${JSON.stringify(props)}`

for (const [mode, options] of [
  ['on', ON],
  ['off', OFF]
] as const) {
  for (const site of SITES) {
    test(`outside the range, Cockpit ${mode}: ${site.component} hands its row back to the engine`, options, async ($, on) => {
      on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: engineRow(e.props) }))
      await startOn($, on, '2.2.0')
      const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', viewport: VIEW, ...site } as never)
      const drawn = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0)

      expect(drawn).toEqual([engineRow(site.props)])
      await ui.unmount()
    })
  }
}

// After `/tui` loads the module again, a row can draw before anything has checked the engine: the site's own check
// must run first. Cockpit on with a turn running, an agent row is the one site that would otherwise hide itself.
test('outside the range, Cockpit on, the first draw after a reload: AgentRow hands its row back to the engine', ON, async ($, on) => {
  const agent = SITES.find(site => site.component === 'AgentRow')
  if (agent === undefined) throw new Error('no AgentRow in SITES')
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: engineRow(e.props) }))
  on('env.get', () => ({ value: undefined }))
  on('fs.read', () => ({ value: MANIFEST }))
  on('session.version', () => ({ value: { version: '2.2.0', base: '2.2.0' } }))
  on('ui.log', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }))
  holdTimers(on)
  on('ui.panes', () => ({ value: [] }))
  on('agent.list', () => ({ value: [] as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'go', turnId: 'live' })
  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', viewport: VIEW, ...agent } as never)

  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual([engineRow(agent.props)])
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

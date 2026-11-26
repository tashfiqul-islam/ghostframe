import { expect, test } from 'claude-code/testing'

import { OFF, ON, PANE } from '../../support/cockpit'
import { REPLY } from '../../support/turn'
import { VIEW } from '../../support/view'
import { textAt } from '../../support/text'

const USER = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'UserMessage',
  props: { text: "What's the difference between a worktree and a branch?", origin: { kind: 'composer' }, isExpanded: false }
} as const

test('your message: gutter `you`, rail, verbatim text, submit time on the rule', OFF, async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: new Date(2026, 10, 17, 2, 10).getTime() }))
  await $.prompt.submit({ text: USER.props.text, wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...USER, viewport: VIEW })
  expect((await ui.find({ type: 'Text', text: /^you$/ }))?.text).toBe('you')
  expect(await ui.find({ type: 'Text', text: /difference between a worktree/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /02:10/ })).toBeDefined()
  await ui.unmount()
})

test('the engine`s stand-in row (`placeholder`) shows the submit time without taking it from the prompt`s own row', OFF, async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: new Date(2026, 10, 17, 7, 8).getTime() }))
  const row = (requestId: string) => $.ui.mount({ ...USER, requestId, viewport: VIEW })

  // Drawn before the submit lands, then after it, as the engine does.
  const stand = await row('placeholder')
  await $.prompt.submit({ text: USER.props.text, wait: false, origin: { kind: 'composer' } })
  await stand.redraw()
  expect(textAt(await stand.drawn(), 120).join('\n')).toContain('07:08')
  await stand.unmount()

  const own = await row('8ea528c4')
  expect(textAt(await own.drawn(), 120).join('\n')).toContain('07:08')
  await own.unmount()
})

test('no viewport measured: the engine draws', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  for (const target of [USER, REPLY] as const) {
    const ui = await $.ui.mount(target)
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  }
})
test('a prompt typed twice: each turn rule shows its own submit time, kept when the next lands', async ($, on) => {
  let now = new Date(2026, 10, 17, 2, 10).getTime()
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: now }))
  const rule = (requestId: string) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'UserMessage',
      requestId,
      viewport: VIEW,
      props: { text: 'continue', origin: { kind: 'composer' }, isExpanded: false }
    } as never)
  const shown = async (ui: Awaited<ReturnType<typeof rule>>) => textAt(await ui.drawn(), 120).join('\n')

  await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  const first = await rule('u1')
  expect(await shown(first)).toContain('02:10')

  now = new Date(2026, 10, 17, 2, 15).getTime()
  await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  const second = await rule('u2')
  expect(await shown(second)).toContain('02:15')
  expect(await shown(first)).toContain('02:10')
  expect(await shown(first)).not.toContain('02:15')
})

test('a prompt typed again after a reload: the new turn rule shows the new submit time', async ($, on) => {
  let now = new Date(2026, 10, 17, 2, 10).getTime()
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: now }))

  // The first submit's row drew before a reload: its claim went with the module.
  await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  now = new Date(2026, 10, 17, 2, 15).getTime()
  await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  const fresh = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'u2',
    viewport: VIEW,
    props: { text: 'continue', origin: { kind: 'composer' }, isExpanded: false }
  } as never)
  expect(textAt(await fresh.drawn(), 120).join('\n')).toContain('02:15')
})

// Phase 5: docked, an agent's message to the main loop and its finished notice are the pane's.
const agentRow = (props: Record<string, unknown>) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'UserMessage', viewport: VIEW, props: { isExpanded: false, ...props } }) as never
const FROM_AGENT = { text: 'seat.ts has 43 lines.', origin: { kind: 'peer' }, from: { name: 'Explore' } }

test('docked: an agent`s message (`peer`, from an agent) and its notice (`task-notification`) draw nothing', ON, async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [{ id: 'a1', name: 'scout', type: 'Explore', description: 'Read seat' }] as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const texts = async (props: Record<string, unknown>) => {
    const ui = await $.ui.mount(agentRow(props))
    const t = (await ui.findAll({ type: 'Text' })).map(x => x.text).filter(x => x.trim().length > 0)
    await ui.unmount()

    return t
  }

  // Not docked yet (fallback, E.13): the live roster has the agent, and the row draws nothing as well.
  expect(await texts(FROM_AGENT)).toEqual([])

  const pane = await $.ui.mount(PANE)
  expect(await texts(FROM_AGENT)).toEqual([])
  expect(await texts({ text: 'Agent "Read seat" finished', origin: { kind: 'task-notification' }, task: { id: 'a1', status: 'completed' } })).toEqual([])
  // Another session's message, and a background shell's notice, are not an agent's: they stay.
  expect(await texts({ text: 'hello', origin: { kind: 'peer' }, from: { name: 'other session' } })).toEqual(['engine'])
  expect(await texts({ text: 'Background command finished', origin: { kind: 'task-notification' }, task: { id: 'b7', status: 'completed' } })).not.toEqual([])
  await pane.unmount()
})

test('a prompt that starts with a URL verb keeps its first letter: `Fetch https://…`', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const t = 'Fetch https://bun.sh/docs and https://httpbin.org/status/404 with WebFetch.'
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'UserMessage',
    viewport: VIEW,
    props: { text: t, origin: { kind: 'composer' }, isExpanded: false }
  } as never)
  const shown = (await ui.findAll({ type: 'Text' })).map(x => x.text)
  await ui.unmount()
  expect(shown.some(x => x.startsWith(' Fetch https://bun.sh'))).toBe(true)
})

test('each typed prompt`s submit time is kept in the store under the session`s id, for a resume', async ($, on) => {
  const store = new Map<string, unknown>()
  let now = new Date(2026, 10, 17, 7, 8).getTime()
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: now }))
  on('session.id', () => ({ value: 's1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })

  // Before the restart: two prompts typed, their stamps kept.
  await $.prompt.submit({ text: 'Run ls in Bash.', wait: false, origin: { kind: 'composer' } })
  now = new Date(2026, 10, 17, 7, 12).getTime()
  await $.prompt.submit({ text: 'Read notes.txt.', wait: false, origin: { kind: 'composer' } })
  expect(store.get('prompts:s1')).toEqual([
    { text: 'Run ls in Bash.', at: new Date(2026, 10, 17, 7, 8).getTime() },
    { text: 'Read notes.txt.', at: now }
  ])
})

test('resume: each turn rule shows its submit time again, from the store, though drawn before the session starts', async ($, on) => {
  const at = (h: number, m: number) => new Date(2026, 10, 17, h, m).getTime()
  // What the session kept before the restart.
  const store = new Map<string, unknown>([
    [
      'prompts:s1',
      [
        { text: 'Run ls in Bash.', at: at(7, 8) },
        { text: 'Read notes.txt.', at: at(7, 12) }
      ]
    ]
  ])
  on('clock.now', () => ({ value: at(9, 0) }))
  on('session.id', () => ({ value: 's1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  const row = (requestId: string, text: string) => $.ui.mount({ ...USER, requestId, viewport: VIEW, props: { ...USER.props, text } })
  const shown = async (ui: Awaited<ReturnType<typeof row>>) => textAt(await ui.drawn(), 120).join(' ')

  // The engine draws the resumed transcript first.
  const first = await row('u1', 'Run ls in Bash.')
  const second = await row('u2', 'Read notes.txt.')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await first.redraw()
  await second.redraw()

  expect(await shown(first)).toContain('07:08')
  expect(await shown(second)).toContain('07:12')
  await Promise.all([first.unmount(), second.unmount()])
})

test('quiet: an agent`s finished notice draws nothing once the engine`s list has dropped it: Cockpit`s roster knows it', ON, async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1_000 }))
  on('agent.list', () => ({ value: [] as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'ag7' }))
  await $.agent.spawn({
    tool_use_id: 'call7',
    prompt: 'count',
    description: 'Count files',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'haiku',
    background: true,
    fork: false
  } as never)

  const ui = await $.ui.mount(
    agentRow({ text: 'Agent "Count files" finished', origin: { kind: 'task-notification' }, task: { id: 'ag7', status: 'completed' } })
  )
  expect((await ui.findAll({ type: 'Text' })).map(x => x.text).filter(x => x.trim().length > 0)).toEqual([])
  await ui.unmount()
})

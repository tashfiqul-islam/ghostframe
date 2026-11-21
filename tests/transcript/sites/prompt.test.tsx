import { expect, test } from 'claude-code/testing'

import { REPLY } from '../../support/turn'
import { VIEW } from '../../support/view'
import { textAt } from '../../support/text'

const USER = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'UserMessage',
  props: { text: "What's the difference between a worktree and a branch?", origin: { kind: 'composer' }, isExpanded: false }
} as const

test('your message: gutter `you`, rail, verbatim text, submit time on the rule', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: new Date(2026, 10, 17, 2, 10).getTime() }))
  await $.prompt.submit({ text: USER.props.text, wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...USER, viewport: VIEW })
  expect((await ui.find({ type: 'Text', text: /^you$/ }))?.text).toBe('you')
  expect(await ui.find({ type: 'Text', text: /difference between a worktree/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /02:10/ })).toBeDefined()
  await ui.unmount()
})

test('no viewport measured: the engine draws', async ($, on) => {
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

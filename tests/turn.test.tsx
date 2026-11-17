import { expect, test } from 'claude-code/testing'

const VIEW = { columns: 120, rows: 40 }

const USER = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'UserMessage',
  props: { text: "What's the difference between a worktree and a branch?", origin: { kind: 'composer' }, isExpanded: false }
} as const

const REPLY = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'AssistantMessage',
  props: { text: '`git worktree add ../hotfix main` gives you a second folder on `main`.', isFirstOfReply: true }
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

test('claude prose: `claude` once per turn, code chip padded, engine never asked', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'What is a worktree?', toolUses: [] },
      { role: 'assistant', text: REPLY.props.text, toolUses: [] },
      { role: 'assistant', text: '', toolUses: [] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: 'ok', isError: false }] },
      { role: 'assistant', text: 'A later block between tool calls.', toolUses: [] }
    ]
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const opener = await $.ui.mount({ ...REPLY, viewport: VIEW })
  expect((await opener.find({ type: 'Text', text: /^claude$/ }))?.text).toBe('claude')
  expect(await opener.find({ type: 'Text', text: /^ git worktree add \.\.\/hotfix main $/ })).toBeDefined()
  expect(await opener.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await opener.unmount()

  // isFirstOfReply is true after a tool call too, but this block doesn't open the turn.
  const later = await $.ui.mount({ ...REPLY, viewport: VIEW, props: { text: 'A later block between tool calls.', isFirstOfReply: true } })
  expect(await later.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  expect(await later.find({ type: 'Text', text: /later block/ })).toBeDefined()
  await later.unmount()
})

test('no viewport measured: the engine draws', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  for (const target of [USER, REPLY] as const) {
    const ui = await $.ui.mount(target)
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  }
})

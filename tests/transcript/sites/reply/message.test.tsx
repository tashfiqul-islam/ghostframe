import { expect, test } from 'claude-code/testing'

import { respond } from '../../../support/respond'
import { VIEW } from '../../../support/view'

test('the final answer after an activity row gets one blank row; after a drawn card, none; decided once', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let out = ' 5 pass\n 0 fail'
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  const VIEW = { columns: 120, rows: 40 }
  const topGap = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Box' }))[1]?.props['marginTop']

  // A plain ● row, then the answer: one blank row.
  await $.turn.start({ text: 'look', turnId: 't1' })
  await $.session.append(respond([{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'a' } }], 'a1'))
  await $.session.append(respond([{ type: 'text', text: 'Found it: the queue fires twice.' }], 'a2'))
  const answer = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'Found it: the queue fires twice.', isFirstOfReply: true }
  })
  expect(await topGap(answer)).toBe(1)
  await answer.unmount()

  // A test run that drew its card, then prose: the card's own blank row is enough.
  await $.turn.start({ text: 'test', turnId: 't2' })
  await $.session.append(respond([{ type: 'tool_use', id: 'k1', name: 'Bash', input: { command: 'bun test' } }], 'b1'))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'k1' } as never)
  const card = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolResult',
    viewport: VIEW,
    props: { tool_use_id: 'k1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } }
  })
  await $.session.append(respond([{ type: 'text', text: 'All five pass now, running again.' }], 'b2'))
  const prose = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'All five pass now, running again.', isFirstOfReply: true }
  })
  expect(await topGap(prose)).toBe(0)

  // A later run takes the card; the earlier card collapses. The prose already drawn keeps its gap.
  out = ' 6 pass\n 0 fail'
  await $.session.append(respond([{ type: 'tool_use', id: 'k2', name: 'Bash', input: { command: 'bun test' } }], 'b3'))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'k2' } as never)
  await card.redraw({ tool_use_id: 'k1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } })
  expect(await card.find({ type: 'Text', text: /^TESTS$/ })).toBeUndefined()
  await prose.redraw({ text: 'All five pass now, running again.', isFirstOfReply: true })
  expect(await topGap(prose)).toBe(0)
  await card.unmount()
  await prose.unmount()
})

test('one blank row after a card: prose right below it takes no margin of its own', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { stdout: ' 5 pass\n 0 fail', stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'test it', turnId: 't1' })
  await $.session.append(respond([{ type: 'tool_use', id: 'k1', name: 'Bash', input: { command: 'bun test' } }], 'a1'))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'k1' } as never)
  // The card draws first, as on screen; the prose under it then knows it's there.
  const card = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolResult',
    viewport: VIEW,
    props: { tool_use_id: 'k1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } }
  })
  expect(await card.find({ type: 'Text', text: /^TESTS$/ })).toBeDefined()
  await card.unmount()
  await $.session.append(respond([{ type: 'text', text: 'All five pass now.' }], 'a2'))

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'All five pass now.', isFirstOfReply: true }
  })
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes[1]?.props['marginTop']).toBe(0)
  await ui.unmount()

  // Prose after a plain step keeps its blank row.
  await $.session.append(respond([{ type: 'tool_use', id: 'k2', name: 'Read', input: { file_path: 'a' } }], 'a3'))
  await $.session.append(respond([{ type: 'text', text: 'Then I read the file.' }], 'a4'))
  const plain = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'Then I read the file.', isFirstOfReply: true }
  })
  expect((await plain.findAll({ type: 'Box' }))[1]?.props['marginTop']).toBe(1)
  await plain.unmount()
})

import { expect, test } from 'claude-code/testing'

import { VIEW } from '../../../support/view'

test('a summary row: dim text in the content column, no bullet', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'Checked the config and the tests', isFirstOfReply: true, isSummary: true }
  })
  const body = await ui.find({ type: 'Text', text: /^Checked the config and the tests$/ })
  expect(body?.props['color']).toBe('#4e4e5a')
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  await ui.unmount()
})

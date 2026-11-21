import { expect, test } from 'claude-code/testing'

import { VIEW } from '../support/view'

test('question dialog: the engine draws it, no rule above', async $ => {
  // No stub: the dialog site holds the engine's own node, which the kit supplies.

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AskUserQuestion',
    viewport: VIEW,
    props: { tool: 'AskUserQuestion', questions: [{ question: 'Which branch?', header: 'Branch', options: [], multiSelect: false }] }
  })
  expect(await ui.find({ type: 'Text', text: /^question $/ })).toBeUndefined()
  expect(await ui.findAll({ type: 'Box' })).toHaveLength(0)
  await ui.unmount()
})

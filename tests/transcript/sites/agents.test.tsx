import { expect, test } from 'claude-code/testing'

import { ON, PANE, VIEW } from '../../support/cockpit'
import type { Engine } from '../../support/engine'

// The engine's agent list under the prompt (`AgentRow`): hidden while the pane is docked, as it was otherwise.
const ROW = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'AgentRow',
  requestId: 'a1',
  viewport: VIEW,
  props: { id: 'a1', description: 'Read seat', type: 'Explore', status: 'running', taskStatus: 'running', rowIds: ['a1'], isHidden: false }
} as never

const drawn = async ($: Engine) => {
  const ui = await $.ui.mount(ROW)
  const t = (await ui.findAll({ type: 'Text' })).map(x => x.text)
  await ui.unmount()

  return t
}

test('docked: each row of the engine`s agent list is hidden; `[ AGENTS ]` is the roster', ON, async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: (e.props as { isHidden?: boolean }).isHidden === true ? 'hidden' : 'engine' }))
  expect(await drawn($)).toEqual(['engine'])

  const pane = await $.ui.mount(PANE)
  expect(await drawn($)).toEqual(['hidden'])
  await pane.unmount()
})

test('off: the engine`s agent list is as it was', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: (e.props as { isHidden?: boolean }).isHidden === true ? 'hidden' : 'engine' }))
  const pane = await $.ui.mount(PANE)
  expect(await drawn($)).toEqual(['engine'])
  await pane.unmount()
})

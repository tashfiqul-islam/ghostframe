import { expect, test } from 'claude-code/testing'

import { ON } from '../support/cockpit'

const PANE = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'cockpit',
  props: {
    title: 'cockpit',
    isFocused: false,
    bodyColumns: 72,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 42, contentRows: 42 },
    view: {}
  }
} as const

type Opened = { id: string; columns?: number }

test('session start registers /cockpit and opens the pane, passing columns', ON, async ($, on) => {
  const opened: Opened[] = []
  const registered: string[] = []
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(registered).toContain('cockpit')
  expect(opened.map(o => o.id)).toEqual(['cockpit'])
  expect(typeof opened[0]?.columns).toBe('number')
})

test('a docked pane opens again with the width rule when the terminal width changes, once per width', ON, async ($, on) => {
  const opened: Opened[] = []
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })

  // 163 columns, granted 72 from an earlier open: the rule wants 56.
  const at163 = await $.ui.mount({ ...PANE, viewport: { columns: 90, rows: 50, isFullscreen: true } })
  expect(opened).toEqual([{ id: 'cockpit', columns: 56 }])

  // The same width drawn again: no second open, so a width the person dragged the dock to stands.
  await at163.redraw()
  expect(opened.length).toBe(1)
  await at163.unmount()

  // Widened to 184 columns (transcript 127, body 56): the rule wants 72.
  const at184 = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 56 }, viewport: { columns: 127, rows: 50, isFullscreen: true } })
  expect(opened).toEqual([
    { id: 'cockpit', columns: 56 },
    { id: 'cockpit', columns: 72 }
  ])
  await at184.unmount()
})

test('an inline pane nobody asked for is closed', ON, async ($, on) => {
  const closed: string[] = []
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'below 110 columns' } }))

  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, placement: 'inline', bodyColumns: 105 },
    viewport: { columns: 109, rows: 50, isFullscreen: true }
  })
  expect(closed).toEqual(['cockpit'])
  await ui.unmount()
})

test('/cockpit opens the pane at the width rule for the terminal it ran in, and closes a placed one', ON, async ($, on) => {
  const opened: Opened[] = []
  const closed: string[] = []
  let placed = false
  on('ui.open', (_, e) => {
    opened.push(e)
    placed = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    placed = false
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: placed ? [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }] : [] }))

  const presentation = { isFullscreen: true, columns: 120 }
  const first = await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation })
  expect(opened).toEqual([{ id: 'cockpit', columns: 40 }])
  expect(first.text).toMatch(/open/)

  const second = await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation })
  expect(closed).toEqual(['cockpit'])
  expect(second.text).toMatch(/closed/)
})

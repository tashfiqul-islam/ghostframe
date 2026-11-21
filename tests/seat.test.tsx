import { expect, test } from 'claude-code/testing'

import { dockCap, paneColumns, terminalColumns } from '../hooks/cockpit/seat'

// Cockpit asks for the widest of 72, 56 or 40 body columns that leaves the transcript 100 cells.
// The dock's chrome is one divider column (correction A), and the engine's 45% cap includes it (correction B).
const WIDTHS: readonly (readonly [columns: number, pane: number, transcript: number])[] = [
  [110, 40, 69],
  [120, 40, 79],
  [144, 40, 103],
  [150, 40, 109],
  [163, 56, 106],
  [200, 72, 127],
  [240, 72, 167]
]

for (const [columns, pane, transcript] of WIDTHS) {
  test(`width rule at ${columns} columns: a ${pane}-column pane, a ${transcript}-column transcript`, () => {
    expect(paneColumns(columns)).toBe(pane)
    expect(pane).toBeLessThanOrEqual(dockCap(columns))
    expect(columns - pane - 1).toBe(transcript)
  })
}

test('the cap is 45% of the terminal less the divider, as probed', () => {
  // Bodies the engine granted to an open asking for more: 66 at 150, 63 at 144, 53 at 120, 72 from 163, 89 at 200.
  expect([150, 144, 120, 162, 163, 200].map(dockCap)).toEqual([66, 63, 53, 71, 72, 89])
})

test('the terminal width from the pane: the transcript, the body and the divider when docked; the viewport inline', () => {
  // Probe values: docked at 200 (viewport 127, body 72) and at 120 (66 and 53); inline at 109 (body 105).
  expect(terminalColumns('dock', 127, 72)).toBe(200)
  expect(terminalColumns('dock', 66, 53)).toBe(120)
  expect(terminalColumns('inline', 109, 105)).toBe(109)
})

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

// Cockpit is off by default (unfinished work never shows in daily use); these tests turn it on.
const ON = { options: { cockpit: true } }

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

import { expect, mock, test } from 'claude-code/testing'

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

test('a docked pane opens again with the width rule when the terminal width changes, once per width, once the width holds', ON, async ($, on) => {
  const opened: Opened[] = []
  const clock = mock.clock(on)
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })

  // 163 columns, granted 72 from an earlier open: the rule wants 56, once no draw has brought a new width for 150 ms.
  const at163 = await $.ui.mount({ ...PANE, viewport: { columns: 90, rows: 50, isFullscreen: true } })
  await clock.advance(149)
  expect(opened).toEqual([])
  await clock.advance(1)
  expect(opened).toEqual([{ id: 'cockpit', columns: 56 }])

  // The same width drawn again: no second open, so a width the person dragged the dock to stands.
  await at163.redraw()
  expect(opened.length).toBe(1)
  await at163.unmount()

  // Widened to 184 columns (transcript 127, body 56): the rule wants 72.
  const at184 = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 56 }, viewport: { columns: 127, rows: 50, isFullscreen: true } })
  await clock.advance(150)
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
  // It toggles (7.15): it names the terminal's width, the one the person sees.
  expect(first.text).toBe('Pane docked · 120 columns')

  const second = await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation })
  expect(closed).toEqual(['cockpit'])
  expect(second.text).toBe('Pane closed')
})

// Correction C: a permission dialog or question card grows the pane. Every row stays where it was; the new rows stay blank.
test('a dialog opening mid-turn moves nothing: the rows stay put while bodyRows grows, and when it shrinks back', ON, async ($, on) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => {
    now += 1_000

    return { result: { file: { numLines: 9 } }, text: 'ok' }
  })
  on('agent.list', () => ({ value: [] as never }))

  await $.prompt.submit({ text: 'read them', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'read them', turnId: 't1' })

  for (let i = 0; i < 30; i++) await $.tool.call({ tool: 'Read', file_path: `f${i}.ts`, tool_use_id: `r${i}` } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Read them', status: 'in_progress', activeForm: 'Reading' }], tool_use_id: 'td' } as never)

  const drawAt = async (bodyRows: number, isPromptCovered: boolean) => {
    const ui = await $.ui.mount({
      ...PANE,
      props: { ...PANE.props, bodyColumns: 72, ...(isPromptCovered ? { isPromptCovered: true as const } : {}), scroll: { ...PANE.props.scroll, bodyRows } },
      viewport: { columns: 127, rows: 50, isFullscreen: true }
    })
    // Every Text drawn, rows and their parts, in order: the same list is the same rows in the same places.
    const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    await ui.unmount()

    return rows
  }

  const before = await drawAt(24, false)
  const open = await drawAt(31, true)
  const after = await drawAt(24, false)

  // The head card, the ruler and the to-do count are all there before the dialog opens.
  expect(before.some(t => /● LIVE/.test(t))).toBe(true)
  expect(before.some(t => /┬────┬/.test(t))).toBe(true)
  expect(before.some(t => /TODO \d+\/\d+/.test(t))).toBe(true)
  expect(open).toEqual(before)
  expect(after).toEqual(before)
})

test('8.3: before the first turn the pane draws no head card, only what will appear (live check: no `DONE TURN 0` at 06:00:00)', ON, async ($, on) => {
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 24, 9) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...PANE, viewport: { columns: 200, rows: 50, isFullscreen: true } })
  const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text)

  expect(shown.some(t => /TURN 0|DONE|No steps in this turn/.test(t))).toBe(false)
  expect(shown.some(t => t.includes('Steps, files, sources and agents appear here as Claude works.'))).toBe(true)
  await ui.unmount()
})

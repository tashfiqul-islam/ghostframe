import { expect, mock, test } from 'claude-code/testing'

import { ON, PANE } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { MIXED, answerOf, fallbackEngine, groupOf, mixedTurn, must, rowsOf, site } from '../support/fallback'

// Amendment 10 (owner, 2026-11-22): in fullscreen, when the pane leaves or comes back, the rows already on screen are
// drawn again in the mode the session is in now (E.47). Each row is worked out from its own data, so the same row draws
// the same at every width in one mode, after a reload too; on the main screen a printed row stays as printed.
const T = new Date(2026, 10, 22, 9, 0, 0).getTime()

// `/cockpit` toggles the pane: it opens one that is not placed, and closes one that is.
const toggle = ($: Engine) => $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

/** Whether the test's engine has the pane placed: `/cockpit` reads the same from its pane list. */
let isPlaced = false

/** The pane placed and drawn docked at 200 columns. */
async function dock($: Engine): Promise<void> {
  if (!isPlaced) await toggle($)

  isPlaced = true
  await (await $.ui.mount(PANE)).unmount()
}

/** The pane closed: the left is in fallback. */
async function undock($: Engine): Promise<void> {
  if (isPlaced) await toggle($)

  isPlaced = false
}

const answer = ($: Engine, n: number, columns: number, requestId = `m${n}-answer`) =>
  rowsOf($, site('AssistantMessage', requestId, columns, { text: answerOf(n), isFirstOfReply: true }))

const failing = (n: number, columns: number) => rowsOf($global, groupOf(must(MIXED(n)[3]), columns, true))
let $global: Engine

/** The numbers a turn shows on the left at one width: steps (capsule or receipt), failures, agents, files, sources. */
function numbers(rows: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}

  for (const word of ['step', 'failure', 'agent', 'file', 'source']) {
    const hit = rows.map(r => new RegExp(String.raw`\b(\d+) ${word}s?\b`).exec(r)?.[1]).find(x => x !== undefined)

    if (hit !== undefined) out[word] = Number(hit)
  }

  return out
}

test('docked → fallback → docked in fullscreen: a finished turn gains its capsule and failure row, then gives them back', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock, true)
  await dock($)
  await mixedTurn($, clock, 1)

  // Docked: no capsule; the receipt says the steps, with the failure nothing fixed above it.
  const docked = await answer($, 1, 127)
  expect(docked.some(r => r.startsWith('│ worked'))).toBe(false)
  expect(docked.at(-2)).toMatch(/^✕ still failing · shell · ls \/nope · exit 2 +7s$/)
  expect(docked.at(-1)).toMatch(/^─ failed ─+ 5 steps · 1 failure · 1 agent · 1 file · 1 source · 17s$/)
  expect(await failing(1, 127)).toEqual([])

  // The pane leaves (closed, or the window narrowed): the same rows, drawn again, are fallback's.
  await undock($)
  const fallback = await answer($, 1, 100)
  expect(fallback[0]).toMatch(/^│ worked · 5 steps · 2 shell · 1 edit · 1 fetch · 1 agent · 1 failure +16s$/)
  expect(fallback.some(r => r.includes('still failing'))).toBe(false)
  expect(fallback.at(-1)).toMatch(/^─ failed ─+ 1 failure · 1 agent · 1 file · 1 source · 17s$/)
  expect((await failing(1, 100))[0]).toMatch(/^✕ failed · shell · ls \/nope · exit 2 +7s$/)

  // The pane comes back: the capsule and the failure row go, the docked receipt and `still failing` come back.
  await dock($)
  expect(await answer($, 1, 127)).toEqual(docked)
  expect(await failing(1, 127)).toEqual([])

  // No count changed in either mode.
  expect(numbers(fallback)).toEqual({ ...numbers(docked), step: 5 })
})

test('one turn drawn at 200, 120, 100, 150 and 200 columns: no step lost, the same counts at every width', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock, true)
  await dock($)
  await mixedTurn($, clock, 2)

  const seen: Record<string, number>[] = []

  for (const [columns, isDocked] of [
    [200, true],
    [120, false],
    [100, false],
    [150, false],
    [200, true]
  ] as const) {
    if (isDocked) await dock($)
    else await undock($)

    const region = isDocked ? columns - 73 : columns
    const rows = [...(await failing(2, region)), ...(await answer($, 2, region))]
    // Every step is said somewhere on the left: the receipt docked, the capsule in fallback.
    expect(rows.some(r => /\b5 steps\b/.test(r))).toBe(true)
    seen.push(numbers(rows))
  }

  expect(new Set(seen.map(s => JSON.stringify(s))).size).toBe(1)
})

test('a turn run with no pane placed draws quiet once the pane docks: no pane is not another pane`s tab in front', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock, true)
  await mixedTurn($, clock, 5)
  expect((await answer($, 5, 100))[0]).toMatch(/^│ worked · 5 steps/)

  await dock($)
  const docked = await answer($, 5, 127)
  expect(docked.some(r => r.startsWith('│ worked'))).toBe(false)
  expect(docked.at(-1)).toMatch(/^─ failed ─+ 5 steps · 1 failure/)
})

test('a row depends only on the mode and its data: drawn under a new request (a reload, a resume) it is the same', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 3)

  const first = await answer($, 3, 100)
  expect(first[0]).toMatch(/^│ worked · 5 steps/)
  expect(await answer($, 3, 100)).toEqual(first)
  // A row the module never saw (its memory gone, as after a reload) draws the same capsule: it comes from the turn's data.
  expect((await answer($, 3, 100, 'after-reload'))[0]).toEqual(first[0])
})

test('on the main screen a printed row stays as printed: the pane coming back does not redraw it', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock, true)
  // A live session: rows drawn before its start are a resumed transcript's, which follow the pane once it is placed.
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await mixedTurn($, clock, 4)
  const main = (columns: number) =>
    rowsOf($, {
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId: 'm4-answer',
      viewport: { columns, rows: 50, isFullscreen: false },
      props: { text: answerOf(4), isFirstOfReply: true }
    } as never)

  const printed = await main(100)
  expect(printed[0]).toMatch(/^│ worked · 5 steps/)

  await dock($)
  expect(await main(100)).toEqual(printed)
})

test('the seat: an unasked pane leaves the dock below 144 columns and opens again only once the width holds 300 ms', ON, async ($, on) => {
  const clock = mock.clock(on)
  const opened: number[] = []
  const closed: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.columns ?? 0)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)

    return { value: undefined }
  })
  const paneAt = (columns: number, body: number) => ({
    ...PANE,
    props: { ...PANE.props, bodyColumns: body },
    viewport: { columns: columns - body - 1, rows: 50, isFullscreen: true }
  })
  // The prompt's hint spans the terminal: each resize draws it at the new width.
  const rowAt = (columns: number) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'PromptHint',
      viewport: { columns, rows: 50, isFullscreen: true },
      props: { hint: '' }
    } as never)

  // Docked at 150 (the engine keeps it to 110): narrowed to 130, Cockpit closes it at once, since nobody asked for it.
  await (await $.ui.mount(paneAt(150, 56))).unmount()
  await (await $.ui.mount(paneAt(130, 40))).unmount()
  expect(closed).toEqual(['cockpit'])

  // A drag back and forth: the width moves under 300 ms each time, so no open is made, and nothing flaps.
  await (await rowAt(150)).unmount()
  await clock.advance(200)
  await (await rowAt(130)).unmount()
  await clock.advance(200)
  await (await rowAt(160)).unmount()
  await clock.advance(299)
  expect(opened).toEqual([])

  // Held at 160: one open, with the columns for that width (correction K).
  await clock.advance(301)
  expect(opened).toEqual([56])
  expect(closed).toEqual(['cockpit'])
})

test('docked at a steady width, the hint and the pane drawing over and over make one open, not one per draw', ON, async ($, on) => {
  const clock = mock.clock(on)
  const opened: number[] = []
  on('ui.open', (_, e) => {
    opened.push(e.columns ?? 0)

    return { value: { isPlaced: true } }
  })
  // 200 columns with a 40-column body (left from 150): the transcript region, and the hint beside the pane, are 159.
  const pane = { ...PANE, props: { ...PANE.props, bodyColumns: 40 }, viewport: { columns: 159, rows: 50, isFullscreen: true } }
  const hint = {
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'PromptHint',
    viewport: { columns: 159, rows: 50, isFullscreen: true },
    props: { hint: '' }
  } as never

  for (let i = 0; i < 6; i++) {
    await (await $.ui.mount(pane)).unmount()
    await (await $.ui.mount(hint)).unmount()
    await clock.advance(200)
  }

  await clock.advance(1_000)
  expect(opened).toEqual([72])
})

test('/cockpit at 120 columns is asked: the docked pane stays there, as amendment 5 allows down to 110', ON, async ($, on) => {
  const closed: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.close', (_, e) => {
    closed.push(e.id)

    return { value: undefined }
  })

  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  await (await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 }, viewport: { columns: 79, rows: 50, isFullscreen: true } })).unmount()
  expect(closed).toEqual([])
})

test('/tui: the switch is kept as the command runs and said once by the next draw on the new screen', ON, async ($, on) => {
  const said: string[] = []
  on('ui.log', (_, e) => {
    said.push(e.text)

    return { value: undefined }
  })
  // The store, not $.state: live, a state write made inside `/tui`'s own dispatch read `null` in the copy loaded after it.
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('session.id', () => ({ value: 'switch-test' }))
  on('command.run', () => ({ text: 'Switched back to the classic renderer' }))
  const tui = (args: string, isFullscreen: boolean) =>
    $.command.run({ command: 'tui', args, origin: { kind: 'composer' }, presentation: { isFullscreen, columns: 200 } })
  const hint = async (isFullscreen: boolean) =>
    (
      await $.ui.mount({
        plugin: 'ghostframe',
        surface: 'terminal',
        component: 'PromptHint',
        viewport: { columns: 200, rows: 50, isFullscreen },
        props: { hint: '' }
      } as never)
    ).unmount()

  // Already on the main screen: no switch, nothing said.
  await tui('classic', false)
  await hint(false)
  expect(said).toEqual([])

  // Off fullscreen: the old screen's draw says nothing; the main screen's first draw says it, once.
  await tui('classic', true)
  expect(store.get('switch:switch-test')).toEqual({ isFullscreen: false, columns: 200 })
  await hint(true)
  await hint(false)
  await hint(false)
  expect(said).toEqual(['fullscreen off · no dock on the main screen · capsules from here · /steps opens the log above the prompt'])
})

import { expect, mock, test } from 'claude-code/testing'

import { paneColumns } from '../../hooks/cockpit/seat'
import { ON, PANE, SLOW } from '../support/cockpit'
import type { Engine, On } from '../support/engine'
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

test('docked → fallback → docked in fullscreen: a finished turn gains its worked node and failure row, then gives them back', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock, true)
  await dock($)
  await mixedTurn($, clock, 1)

  // Docked: no worked node; the receipt says the steps, with the failure card for what still fails above it (7.8).
  const docked = await answer($, 1, 127)
  expect(docked.some(r => /◇  worked/.test(r))).toBe(false)
  expect(docked).toContainEqual(expect.stringMatching(/^ {13}│ {4}× shell ls \/nope +exit 2 *$/))
  expect(docked.at(-1)).toMatch(/^ +17s ×  FAILED   [⣀-⣿]+   5 steps · 1 still failing · 1 file · 1 source · 1 agent$/)
  expect(await failing(1, 127)).toEqual([])

  // The pane leaves (closed, or the window narrowed): the same rows, drawn again, are fallback's.
  await undock($)
  const fallback = await answer($, 1, 100)
  expect(fallback[0]).toMatch(/^ {9}16s ◇  worked   [⣀-⣿]+   5 steps · 1 agent$/)
  // The failure drew its own row when it settled (13.1): no card repeats it.
  expect(fallback.some(r => /│ {4}×/.test(r))).toBe(false)
  expect(fallback.at(-1)).toMatch(/^ +17s ×  FAILED   [⣀-⣿]+   5 steps · 1 still failing · 1 file · 1 source · 1 agent$/)
  expect((await failing(1, 100))[0]).toBe('             ×  shell ls /nope   exit 2   1s')

  // The pane comes back: the worked node and the failure row go, the docked receipt and its card come back.
  await dock($)
  expect(await answer($, 1, 127)).toEqual(docked)
  expect(await failing(1, 127)).toEqual([])

  // No count changed in either mode.
  expect(numbers(fallback)).toEqual(numbers(docked))
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
  expect((await answer($, 5, 100))[0]).toMatch(/◇  worked   [⣀-⣿]+   5 steps/)

  await dock($)
  const docked = await answer($, 5, 127)
  expect(docked.some(r => /◇  worked/.test(r))).toBe(false)
  expect(docked.at(-1)).toMatch(/×  FAILED   [⣀-⣿]+   5 steps · 1 still failing/)
})

test('a row depends only on the mode and its data: drawn under a new request (a reload, a resume) it is the same', ON, async ($, on) => {
  $global = $
  isPlaced = false
  const clock = { now: T }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 3)

  const first = await answer($, 3, 100)
  expect(first[0]).toMatch(/◇  worked   [⣀-⣿]+   5 steps/)
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
  expect(printed[0]).toMatch(/◇  worked   [⣀-⣿]+   5 steps/)

  await dock($)
  expect(await main(100)).toEqual(printed)
})

/**
 * The engine's side of a drag in Windows Terminal: it draws at each width, 25 to 50 ms apart. An open is drawn at the
 * next draw where the engine can place it (from 144 columns, or from 110 for one asked for); below 110 it reseats a
 * docked pane inline. Each first draw of an open is kept, to catch a stale one (drawn at a width its body is not for).
 */
function dragEngine(on: On, clock: ReturnType<typeof mock.clock>) {
  const log = { opens: [] as { columns: number; body: number }[], closes: [] as number[], inline: 0, placed: [] as { columns: number; body: number }[] }
  let width = 200
  let drawn: number | undefined
  let pending: number | undefined
  let isAsked = false
  on('ui.open', (_, e) => {
    log.opens.push({ columns: width, body: e.columns ?? 0 })
    pending = e.columns ?? 0
    drawn = undefined

    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    log.closes.push(width)
    drawn = undefined
    pending = undefined

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: drawn === undefined && pending === undefined ? [] : [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }]
  }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const hint = (columns: number) => ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'PromptHint',
    viewport: { columns, rows: 50, isFullscreen: true },
    props: { hint: '' }
  })
  const drawAt = async (columns: number) => {
    width = columns
    if (pending !== undefined && columns >= (isAsked ? 110 : 144)) {
      drawn = pending
      pending = undefined
      log.placed.push({ columns, body: drawn })
    }
    const raised =
      drawn === undefined
        ? hint(columns)
        : columns < 110
          ? { ...PANE, props: { ...PANE.props, placement: 'inline', bodyColumns: columns - 4 }, viewport: { columns, rows: 50, isFullscreen: true } }
          : { ...PANE, props: { ...PANE.props, bodyColumns: drawn }, viewport: { columns: columns - drawn - 1, rows: 50, isFullscreen: true } }
    if (drawn !== undefined && columns < 110) log.inline += 1
    await (await $mount(raised)).unmount()
  }
  let $mount: (raised: unknown) => Promise<{ unmount: () => Promise<void> }> = async () => ({ unmount: async () => undefined })
  /** Draws from one width to another, `by` columns every `ms`, then holds `hold` ms. */
  const drag = async (from: number, to: number, by: number, ms: number, hold = 0) => {
    const step = from < to ? by : -by
    for (let w = from; from < to ? w < to : w > to; w += step) {
      await drawAt(w)
      await clock.advance(ms)
    }
    await drawAt(to)
    await clock.advance(hold)
  }

  return { log, drawAt, drag, ask: () => (isAsked = true), mountWith: (m: typeof $mount) => ($mount = m) }
}

test('four live drag cycles: an unasked pane leaves at its first draw below 144, never inline, never a stale open; one open at start', SLOW, async ($, on) => {
  const clock = mock.clock(on)
  const d = dragEngine(on, clock)
  d.mountWith(raised => $.ui.mount(raised as never))
  const firstBelow144 = (from: number, by: number) => from - Math.ceil((from - 143) / by) * by

  // Start: the hint draws before the session starts, which opens nothing; the start makes the one open.
  await d.drawAt(200)
  await clock.advance(300)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await d.drawAt(200)
  await clock.advance(300)
  expect(d.log.opens).toEqual([{ columns: 200, body: 72 }])

  // Cycle 1, 200 → 111 slowly: closed at the first draw below 144, at once.
  await d.drag(200, 111, 3, 40, 300)
  expect(d.log.closes).toEqual([firstBelow144(200, 3)])

  // Cycle 2: back to 179 and held (one open), then 179 → 102 fast: closed at the first draw below 144.
  await d.drag(111, 179, 4, 30, 300)
  await d.drag(179, 102, 7, 25, 300)
  expect(d.log.opens.slice(1)).toEqual([{ columns: 179, body: 72 }])
  expect(d.log.closes.slice(1)).toEqual([firstBelow144(179, 7)])

  // Cycle 3: up to 189 and held just past the wait (an open is made), narrowed before it is drawn (it is withdrawn),
  // then up to 163: one open there, at its own body.
  await d.drag(102, 189, 8, 30, 160)
  await d.drag(189, 120, 10, 30, 100)
  await d.drag(120, 163, 5, 30, 300)
  expect(d.log.opens.slice(2)).toEqual([
    { columns: 189, body: 72 },
    { columns: 163, body: 56 }
  ])

  // Cycle 4, 163 → 111: closed at the first draw below 144.
  await d.drag(163, 111, 4, 30, 300)
  expect(d.log.closes.at(-1)).toBe(firstBelow144(163, 4))

  // Never an inline frame of a pane nobody asked for; every open first drawn at a width whose rule asks its body.
  expect(d.log.inline).toBe(0)
  expect(d.log.placed.filter(p => paneColumns(p.columns) !== p.body)).toEqual([])
})

test('an asked pane crossing below 110 closes at the engine`s first inline draw; that one inline frame is the engine`s', ON, async ($, on) => {
  const clock = mock.clock(on)
  const d = dragEngine(on, clock)
  d.mountWith(raised => $.ui.mount(raised as never))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  d.ask()
  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 130 } })
  await d.drawAt(130)
  await d.drag(130, 100, 3, 30, 300)
  // Asked, it stays docked from 110 up (amendment 5); the engine reseats it inline at 109 and it is closed there.
  expect(d.log.closes).toEqual([109])
  expect(d.log.inline).toBe(1)
})

test('a pane the person closed stays closed when the terminal widens; /cockpit brings it back', ON, async ($, on) => {
  const clock = mock.clock(on)
  const opened: number[] = []
  on('ui.open', (_, e) => {
    opened.push(e.columns ?? 0)

    return { value: { isPlaced: true } }
  })
  let placed = false
  on('ui.panes', () => ({ value: placed ? [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.close', () => {
    placed = false

    return { value: undefined }
  })
  const hintAt = (columns: number) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'PromptHint',
      viewport: { columns, rows: 50, isFullscreen: true },
      props: { hint: '' }
    } as never)
  const cockpit = () => $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  // Open, then closed by the person (`/cockpit` again): a wide terminal does not bring it back.
  await cockpit()
  placed = true
  await cockpit()
  await (await hintAt(200)).unmount()
  await clock.advance(1_000)
  expect(opened).toEqual([72])

  await cockpit()
  expect(opened).toEqual([72, 72])
})

test('docked at a steady width, the hint and the pane drawing over and over make one open, not one per draw', ON, async ($, on) => {
  const clock = mock.clock(on)
  const opened: number[] = []
  // The engine gives the pane the body its last open asked for.
  let body = 40
  on('ui.open', (_, e) => {
    opened.push(e.columns ?? 0)
    body = e.columns ?? body

    return { value: { isPlaced: true } }
  })
  // 200 columns with a 40-column body (left from 150): the transcript region, and the hint beside the pane, are 159.
  const pane = () => ({ ...PANE, props: { ...PANE.props, bodyColumns: body }, viewport: { columns: 199 - body, rows: 50, isFullscreen: true } })
  const hint = {
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'PromptHint',
    viewport: { columns: 159, rows: 50, isFullscreen: true },
    props: { hint: '' }
  } as never

  for (let i = 0; i < 6; i++) {
    await (await $.ui.mount(pane())).unmount()
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
  expect(said).toEqual(['fullscreen off · no dock on the main screen · worked nodes from here · /steps opens the log above the prompt'])
})

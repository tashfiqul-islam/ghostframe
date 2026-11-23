// The Cockpit pane (spec C.1, E.37; corrections A, B and K): its seat at the width rule, `/cockpit`, and its drawing.
import type { EngineInterface, Register, UiOpenResult } from 'claude-code'

import { readDetails } from './keys/details'
import { copiedNote, fileView, hasCopied, noteRing, noteViewed, readViewTick, ringNow, tabNow, urlsShown, viewNow } from './keys/view'
import { assemblePane, firstHunk } from './v8/assemble'
import { drawPaneV8 } from './v8/draw'
import { INSPECTOR_KEYS, inspectorRows } from './v8/views'
import { pluginVersion } from './version'
import { readFlow } from '../shared/flow'
import { noteColumns, setDocked, widthTick } from './left'
import { readLog, readRoster, readSecond } from './log'
import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { OFF_NOTE, isOn, readEnvOnce } from './switch'
import { readWork } from './work'
import { PANE, STEPS, docked } from './mode'
import { readHistory, readPin, storedTurnCount } from './history/store'
import { pinFromCommand } from './keys/view'
import { INSPECTOR_ROWS } from './fallback/inspector'
import { copyFromCommand, stepsAllText } from './copy'
import { keepSwitch, switchNotice } from './tui'

export type On = Parameters<Register>[0]

// The first open comes before any drawing has measured the terminal: ask for the hero width,
// and the first Pane render opens again at the width rule.
export const FIRST_COLUMNS = 72

// shortcut: kept in the module, so a reload forgets them; the next Pane render then opens once more
// at the width rule, and an inline pane the person asked for before the reload is closed. Move them
// to $.state when the pane holds anything worth keeping across a reload.
/**
 * The body columns the placed pane has (its last render's, or the last placed open's); undefined with no pane placed.
 * An open is made only when the width rule asks for another body: an open's columns stay put while the terminal
 * changes (correction K), so a pane already at the right body needs none.
 */
let paneBody: number | undefined
/** The terminal's columns where Cockpit last closed an inline pane, so a refused close cannot loop. */
let leftAt: number | undefined
/**
 * Who asked for an inline pane, so it is theirs and stays: `/cockpit` where no dock exists (the whole pane), or
 * `/steps` there (the inline inspector, E.46). Undefined: an inline pane nobody asked for, which Cockpit closes.
 */
let askedInline: 'cockpit' | 'steps' | undefined
/** Whether the person asked for the pane (`/cockpit`, `/steps`): it then docks from 110 columns, not 144 (amendment 5). */
let isAsked = false
/**
 * The pane's body rows while no dialog covers the prompt. A permission dialog or a question card grows the pane
 * (correction C); the pane is still fitted to this height, so every row stays where it was and the new rows stay
 * blank until the dialog closes.
 */
let openRows: number | undefined
/** Whether the pane held the keyboard at its last draw: the prompt's hint line says `pane` meanwhile (E.18). */
let isPaneFocused = false

/** The prompt's hint line while the pane holds the keyboard (E.18): who has the keys, and how to give them back. */
export const PANE_HINT = 'pane · tab moves · enter opens · esc returns to the prompt'

/**
 * Opens (or re-opens) the pane at the width rule for a terminal this wide. The open is pending until a Pane render
 * draws it: a draw at a new width before then cancels or replaces it (`seatFor`), so the engine never places a stale
 * one.
 * @param $ the engine interface
 * @param columns the terminal's columns
 * @returns whether the engine placed it
 */
async function openAt($: EngineInterface, columns: number): Promise<UiOpenResult> {
  $.ui.log(`cockpit: seat open at ${columns} columns (body ${paneColumns(columns)})`, { to: 'debug' })
  const opened = await $.ui.open({ id: PANE, columns: paneColumns(columns) })

  if (opened.isPlaced) {
    pendingBody = paneColumns(columns)
    leftAt = undefined
    ownCloses = 0
  }

  return opened
}

/** The pane's placement at its last render, so the debug log has a line each time it changes. */
let lastPlacement = ''

/**
 * Notes a change of the pane's placement in the debug log (never the transcript).
 * @param $ the engine interface
 * @param placement the placement and the terminal's columns
 */
function notePlacement($: EngineInterface, placement: string): void {
  if (placement === lastPlacement) return

  lastPlacement = placement
  $.ui.log(`cockpit: pane drawn ${placement}`, { to: 'debug' })
}

/**
 * How long the terminal's width must hold before a change that keeps the pane docked (another body width, from 144
 * columns up; an asked pane between 110 and 143). In Windows Terminal the engine draws every 25 to 50 ms while a window
 * edge is dragged; an open is made only for a body the pane does not have, so a short wait does not flap.
 */
export const SETTLE_MS = 150

/** Below this many columns a pane nobody asked for leaves the dock (amendment 5; the engine keeps it to 110). */
export const UNASKED_MIN = 144

/** A seat change waiting for the width to hold: an open at the width rule, at which width, and the width count then. */
let settling: { columns: number; tick: number } | undefined
/** Whether the person closed the pane (its close mark, ctrl+x x, `/cockpit`): it stays closed until asked (E.47). */
let isClosedByPerson = false
/**
 * Cockpit's own closes the close hook has not heard yet, so it tells them from the person's (live the engine skips the
 * hook for a plugin's own close; a test engine may run it later). Reset at each open: only an open pane can be closed.
 */
let ownCloses = 0
/** The body an open asked for that no Pane render has drawn yet: a draw at a new width cancels or replaces it. */
let pendingBody: number | undefined
/** Whether the session start's seat has run: until then no draw opens the pane (the start makes the one open). */
let isStartSeated = false

/**
 * Opens the pane at the width rule once no draw has brought a new width for 150 ms. A draw at a new width inside the
 * wait drops it and starts its own; draws at the same width leave it running. An open whose body the pane already has,
 * or already asked for, is not made.
 * @param $ the engine interface
 * @param columns the terminal's columns now
 */
function settleOpen($: EngineInterface, columns: number): void {
  const tick = widthTick()

  if (settling?.columns === columns && settling.tick === tick) return

  const mine = { columns, tick }
  settling = mine

  try {
    $.clock.after(SETTLE_MS, () => {
      if (settling !== mine) return

      settling = undefined

      if (widthTick() !== tick || (pendingBody ?? paneBody) === paneColumns(columns)) return

      void openAt($, columns).catch((error: unknown) => logSeatError($, error))
    })
  } catch (error: unknown) {
    settling = undefined
    logSeatError($, error)
  }
}

/**
 * Closes a pane nobody asked for where it may not stay: docked below 144 columns, inline, or opened and not yet drawn
 * when the terminal narrows. At once: a narrow dock squeezes the transcript, and an inline pane covers the
 * conversation. It leaves no open waiting behind; a draw that finds the width wide enough again opens it.
 * @param $ the engine interface
 * @param columns the terminal's columns
 */
async function leaveUnasked($: EngineInterface, columns: number): Promise<void> {
  leftAt = columns
  settling = undefined
  pendingBody = undefined
  paneBody = undefined
  $.ui.log(`cockpit: seat close at ${columns} columns (not asked)`, { to: 'debug' })
  ownCloses += 1
  await $.ui.close({ id: PANE })

  setDocked($, false)
}

/**
 * The seat for a draw at this width (amendments 5 and 10). A pane nobody asked for leaves at once below 144 columns:
 * docked, inline (the engine reseated it below 110), or opened and not drawn yet. A docked pane, or an asked one from
 * 110 up, opens again at the width rule once the width holds, only when that asks for another body. With no pane
 * placed, a fullscreen terminal at 144 columns or more gets one once the width holds, unless the person closed it or
 * the session start has not seated it yet.
 * @param $ the engine interface
 * @param placement the pane's seat now, `none` when no pane is drawn
 * @param columns the terminal's columns
 * @param isFullscreen whether this session docks panes at all
 * @param body the docked pane's body columns
 * @returns `leave` when the pane leaves (or has left) at this width: the left is then in fallback, not docked
 */
function seatFor($: EngineInterface, placement: 'dock' | 'inline' | 'none', columns: number, isFullscreen: boolean, body?: number): 'leave' | 'stay' {
  const isUnasked = placement === 'inline' ? askedInline === undefined : !isAsked

  if (placement === 'dock' || placement === 'inline') pendingBody = undefined
  if (placement === 'dock') paneBody = body

  // Below 144 a pane nobody asked for leaves at its first draw there, with no hold.
  if (isUnasked && columns < UNASKED_MIN && (placement !== 'none' || pendingBody !== undefined)) {
    // Left, or leaving: a late draw of it records no body, so the next draw wide enough opens it again.
    paneBody = undefined
    pendingBody = undefined

    if (leftAt !== columns) void leaveUnasked($, columns).catch((error: unknown) => logSeatError($, error))

    return 'leave'
  }

  if (placement === 'inline') return 'stay'

  if (placement === 'dock') {
    if (paneColumns(columns) !== body) settleOpen($, columns)
    else settling = undefined

    return 'stay'
  }

  // No pane drawn: an open not drawn yet at another width is replaced; none at all, one is made once the width holds.
  if (!isFullscreen || isAsked || isClosedByPerson || !isStartSeated || columns < UNASKED_MIN) return 'stay'
  if (pendingBody !== undefined || paneBody === undefined) settleOpen($, columns)

  return 'stay'
}

/**
 * Opens the pane at session start: placed at once from 144 columns. Narrower, the engine would keep the open waiting
 * and dock it by itself at the start's width; it is withdrawn instead, and a draw opens it once the terminal is wide.
 * The prompt hint's draws open nothing before this has run, so the start makes the one open.
 * @param $ the engine interface
 * @returns whether it was placed
 */
export async function seatAtStart($: EngineInterface): Promise<boolean> {
  $.ui.log(`cockpit: seat open at session start (body ${FIRST_COLUMNS})`, { to: 'debug' })

  try {
    const { isPlaced } = await $.ui.open({ id: PANE, columns: FIRST_COLUMNS })

    if (isPlaced) {
      pendingBody = FIRST_COLUMNS
      ownCloses = 0
    } else {
      ownCloses += 1
      await $.ui.close({ id: PANE })
    }

    return isPlaced
  } finally {
    isStartSeated = true
  }
}

/** The session started without a seat (not interactive, not the terminal, Cockpit off): draws may open the pane. */
export function markStartSeated(): void {
  isStartSeated = true
}

/**
 * Logs a seat change that failed; the pane keeps the seat it had.
 * @param $ the engine interface
 * @param error what the engine answered
 */
export function logSeatError($: EngineInterface, error: unknown): void {
  $.ui.log(`cockpit: seat change failed: ${String(error)}`, { to: 'debug' })
}

/**
 * Adds the pane's hooks: the `/cockpit` command, the pane's drawing, and its close.
 * @param on the `on` that `register` receives
 */
export function registerPane(on: On): void {
  // The person closed the pane: the transcript is no longer quiet, and an inline pane is no longer asked for.
  on('ui.close', { id: PANE }, ($, e, next) => {
    setDocked($, false)
    askedInline = undefined
    isAsked = false
    paneBody = undefined
    if (ownCloses > 0) ownCloses -= 1
    else isClosedByPerson = true

    return next(e)
  })

  on('command.run', { command: PANE }, async ($, e) => {
    if (!isOn()) {
      return { text: OFF_NOTE }
    }

    const isPlaced = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)

    if (isPlaced) {
      isClosedByPerson = true
      paneBody = undefined
      await $.ui.close({ id: PANE })

      setDocked($, false)

      return { text: 'Pane closed' }
    }

    const { columns, isFullscreen } = e.presentation
    askedInline = !isFullscreen || columns < DOCK_MIN ? 'cockpit' : undefined
    isAsked = true
    isClosedByPerson = false
    leftAt = undefined
    const opened = await openAt($, columns)

    return { text: opened.isPlaced ? `Pane docked at ${paneColumns(columns)} columns` : `Pane not placed · ${opened.reason}` }
  })

  // `/steps <n>` pins a past turn into the pane; `/steps` alone, or the live turn's number, releases it (E.45).
  // With no pane placed it also opens one, with the keyboard (E.46): where no dock exists the engine seats it
  // inline, the inspector, and Escape closes it; from 110 columns in fullscreen an asked open docks it (amendment 5).
  on('command.run', { command: STEPS }, async ($, e) => {
    if (!isOn()) {
      return { text: OFF_NOTE }
    }

    // `/steps n all` (E.4): the turn's ctrl+o rows, printed as the command's output; `/steps all` for the live turn.
    const words = e.args.trim().split(/\s+/)

    if (words.at(-1) === 'all') {
      const n = words.length > 1 ? Number(words[0]) : (await readLog($)).turnNo

      return { text: Number.isInteger(n) && n >= 1 ? await stepsAllText($, n, e.presentation.columns) : '/steps n all takes a turn number' }
    }

    const text = await pinFromCommand($, e.args)
    const asked = e.args.trim()
    const pin = await readPin($)
    const isPinned = asked.length === 0 || pin === Number(asked) || Number(asked) === (await readLog($)).turnNo

    // Docked, the pane already shows it. An inline pane already open takes the open again: the same pane, focused.
    if (docked() || !isPinned) {
      return { text }
    }

    const { columns, isFullscreen } = e.presentation
    askedInline = !isFullscreen || columns < DOCK_MIN ? 'steps' : undefined
    isAsked = true
    isClosedByPerson = false
    leftAt = undefined
    const opened = await $.ui.open({ id: PANE, columns: paneColumns(columns), rows: INSPECTOR_ROWS, focus: true, closeOnEscape: true })
    paneBody = opened.isPlaced ? paneColumns(columns) : undefined
    if (opened.isPlaced) ownCloses = 0

    return { text: opened.isPlaced ? text : `${text} · pane not placed · ${opened.reason}` }
  })

  // `/copy` stays the engine's (the last answer); Cockpit answers the forms it adds (E.24, G.78) and passes the rest on.
  on('command.run', { command: 'copy' }, async ($, e, next) => {
    if (!isOn()) return next(e)

    const said = await copyFromCommand($, e.args, e.presentation.columns)

    return said === undefined ? next(e) : { text: said }
  })

  // The focus ring moved in the pane: `c` copies what it is on.
  // On the Files tab a file row under the ring opens its first hunk in place (8.5), so a move onto or off one redraws.
  on('ui.focus', ($, e, next) => {
    if (e.component === 'Pane' && e.requestId === PANE) {
      const was = ringNow()
      noteRing(e.element)

      if (tabNow() === 'files' && was !== e.element && [was, e.element].some(k => k?.startsWith('file:') === true)) $.ui.invalidate('ui.render')
    }

    return next(e)
  }).catch((_$, e, next) => next(e)) // a ring that cannot be noted never stops the ring

  // `/tui` switches the screen mid-session (probe 19: the engine remounts the transcript and loads the hooks module
  // again; `$.state` is kept). A switch is said once, as a notice row the remount reprints (F.40): off, that the dock
  // is gone and capsules take its place; on, that the pane is back, its width and how many turns its log keeps.
  // The switch is kept before the command runs: the copy that runs it is replaced while it does, so nothing after
  // `next` is sure to run, and its output text is the engine's. The copy that comes after says it, once.
  on('command.run', { command: 'tui' }, async ($, e, next) => {
    const asked = e.args.trim().toLowerCase()
    const isWanted = asked === 'fullscreen' ? true : asked === 'classic' || asked === 'default' ? false : undefined

    if (isOn() && isWanted !== undefined && isWanted !== e.presentation.isFullscreen) {
      await keepSwitch($, { isFullscreen: isWanted, columns: e.presentation.columns })
    }

    return next(e)
  })

  // While the pane holds the keyboard, the prompt's hint line says so (E.18): keys typed now reach the pane. It is
  // drawn on every screen, first after a reload too, so it also reads the on switch again then, and says a `/tui`
  // switch the copy before this one kept.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    await readEnvOnce($)

    const notice = isOn()
      ? await switchNotice($, e.viewport?.isFullscreen, async () => storedTurnCount($)).catch((error: unknown) => {
          $.ui.log(`cockpit: /tui note not read: ${String(error)}`, { to: 'debug' })

          return undefined
        })
      : undefined

    if (notice !== undefined) $.ui.log(notice)

    if (isOn() && e.surface === 'terminal') {
      // Docked, the hint is measured beside the pane; the Pane render says the terminal's width and the seat then.
      noteColumns(docked() ? undefined : e.viewport?.columns)

      if (!docked() && e.viewport !== undefined) seatFor($, 'none', e.viewport.columns, e.viewport.isFullscreen === true)
    }

    if (!isOn() || !isPaneFocused || e.surface !== 'terminal') {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, hint: PANE_HINT } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!isOn()) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box } = ui
    const { placement, bodyColumns, scroll } = e.props
    const viewport = e.viewport

    if (e.surface === 'terminal' && viewport !== undefined) {
      const columns = terminalColumns(placement, viewport.columns, bodyColumns)
      const isFullscreen = viewport.isFullscreen === true
      noteColumns(columns)
      notePlacement($, `${placement} ${columns}`)

      if (placement === 'inline') {
        setDocked($, false)
        seatFor($, 'inline', columns, isFullscreen)

        if (askedInline === undefined) {
          return <Box />
        }
      } else if (seatFor($, 'dock', columns, isFullscreen, bodyColumns) === 'leave') {
        // A pane nobody asked for, below 144: it leaves at this draw, and a draw after its close is no dock either.
        setDocked($, false)

        return <Box />
      } else {
        setDocked($, true)
      }
    }

    // The prompt's hint line follows who holds the keyboard.
    if (e.props.isFocused !== isPaneFocused) {
      isPaneFocused = e.props.isFocused
      $.ui.invalidate('ui.render')
    }

    // The v8 pane (8): the tabs, the view, the hint row; fitted to the body while no dialog has grown it (correction
    // C). Reading `second` redraws this each second while a turn or a background agent runs; reading the view's
    // counter, when a key changes the view.
    await readSecond($)
    await readViewTick($)
    const view = viewNow(e.props.isFocused)
    const log = await readLog($)
    const roster = await readRoster($)
    const work = await readWork($)
    const isTicking = log.isTurnRunning || roster.some(a => a.state === 'running')
    const isCovered = e.props.isPromptCovered === true
    const now = isTicking || hasCopied() ? await $.clock.now() : (log.last?.endedAt ?? 0)

    if (!isCovered || openRows === undefined) openRows = scroll.bodyRows

    const pinNo = await readPin($)
    const pinned = pinNo === null ? undefined : (await readHistory($)).find(r => r.turnNo === pinNo)
    const isInspector = placement === 'inline' && askedInline === 'steps'
    const fitTo = isCovered ? Math.min(openRows, scroll.bodyRows) : scroll.bodyRows
    const viewedId = e.props.view.agentId
    noteViewed(viewedId)
    const details = [...(await readDetails($)), ...(pinned?.details ?? [])]

    if (isInspector) {
      const steps = pinned?.steps ?? log.steps
      const rows = steps.map(s => ({
        glyph: s.isRunning ? ('current' as const) : s.mark === '✕' ? ('failed' as const) : ('ok' as const),
        kind: s.kind,
        subject: s.subject,
        result: s.isRunning ? 'running' : s.result,
        tone: s.isRunning ? ('accent' as const) : s.mark === '✕' ? ('err' as const) : ('dim' as const),
        ms: details.find(d => d.id === s.id)?.ms ?? undefined
      }))
      const failed = steps.filter(s => s.mark === '✕').length

      // Every step (`s`): the card grows and the engine scrolls it; `b` and `s` go back.
      const isAll = view.kind === 'all'
      const keys: [string, string][] = isAll
        ? [
            ['s', 'fit'],
            ['c', 'copy'],
            ['b', 'back'],
            ['esc', 'close']
          ]
        : INSPECTOR_KEYS.map(([k, a]): [string, string] => [k, a])
      const card = inspectorRows(
        pinned?.turnNo ?? log.turnNo,
        steps.length,
        failed,
        rows,
        isAll ? rows.length + 6 : Math.min(INSPECTOR_ROWS, fitTo),
        bodyColumns,
        keys
      )

      return drawPaneV8($, e, card.map(parts => ({ parts })).concat([{ parts: [] }]), isAll ? ['s', 'c', 'b'] : ['s', 'c', 'p', 'n'])
    }

    // The file row under the ring on the Files tab, and its first hunk, drawn in place under it (8.5).
    const ringed = e.props.isFocused && tabNow() === 'files' ? ringNow() : undefined
    const selectedPath = ringed?.startsWith('file:') === true ? ringed.slice('file:'.length) : undefined
    const selectedFile = selectedPath === undefined ? undefined : { path: selectedPath, hunk: firstHunk((await fileView($, selectedPath)).patch) }
    const viewed = viewedId === undefined ? (view.kind === 'agent' ? roster.find(a => a.id === view.id) : undefined) : roster.find(a => a.id === viewedId)
    const pane = assemblePane({
      width: bodyColumns,
      rows: fitTo,
      now,
      isFocused: e.props.isFocused,
      isCovered,
      log,
      roster,
      work,
      details,
      flow: await readFlow($),
      pinned,
      view,
      tab: tabNow(),
      isUrlsShown: urlsShown(),
      viewed,
      version: pluginVersion(),
      selectedFile,
      note: copiedNote(now)
    })
    return drawPaneV8($, e, pane.lines)
  })
}

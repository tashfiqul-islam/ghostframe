// The Cockpit pane (spec C.1, E.37; corrections A, B and K): its seat at the width rule, `/cockpit`, and its drawing.
import type { EngineInterface, Register, UiOpenResult } from 'claude-code'

import { paneLines } from './fit'
import { readDetails } from './keys/details'
import { drawPane, hintRows } from './keys/draw'
import { allRows, detailRows, diffRows } from './keys/views'
import { copiedNote, hasCopied, noteRing, readViewTick, viewNow, wholeNow } from './keys/view'
import type { Line } from './line'
import { noteColumns, setDocked, widthTick } from './left'
import { readLog, readRoster, readSecond } from './log'
import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { OFF_NOTE, isOn, readEnvOnce } from './switch'
import { readWork } from './work'
import { PANE, STEPS, docked } from './mode'
import { readHistory, readPin, storedTurnCount } from './history/store'
import { pinFromCommand } from './keys/view'
import { INSPECTOR_ROWS, inspectorLines } from './fallback/inspector'
import { copyFromCommand, stepsAllText } from './copy'
import { keepSwitch, switchNotice } from './tui'

export type On = Parameters<Register>[0]

// The first open comes before any drawing has measured the terminal: ask for the hero width,
// and the first Pane render opens again at the width rule.
export const FIRST_COLUMNS = 72

// shortcut: kept in the module, so a reload forgets them; the next Pane render then opens once more
// at the width rule, and an inline pane the person asked for before the reload is closed. Move them
// to $.state when the pane holds anything worth keeping across a reload.
/** The terminal's columns at Cockpit's last open, so it opens again only when the width changes (correction K). */
let openedAt: number | undefined
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
 * Opens (or re-opens) the pane at the width rule for a terminal this wide.
 * @param $ the engine interface
 * @param columns the terminal's columns
 * @returns whether the engine placed it
 */
async function openAt($: EngineInterface, columns: number): Promise<UiOpenResult> {
  openedAt = columns
  $.ui.log(`cockpit: seat open at ${columns} columns (body ${paneColumns(columns)})`, { to: 'debug' })

  return $.ui.open({ id: PANE, columns: paneColumns(columns) })
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
 * How long a seat change waits after the draw that asks for it. The engine draws nothing while a window is dragged and
 * draws every site once, about 0.5 s after the width stops (phase 10 drag probe: 1.145 s → 1.649 s, 4.1 s → 4.613 s),
 * so the draw itself says the width has held longer than E.47's 300 ms. Waiting more only drew the screen twice (the
 * engine's draw at the new width, then Cockpit's change). One tick lets a later draw of the same burst win.
 */
export const SETTLE_MS = 1

/** Below this many columns a pane nobody asked for leaves the dock (amendment 5; the engine keeps it to 110). */
export const UNASKED_MIN = 144

/** A seat change waiting for the width to hold: what it does, at which width, and the count of width changes then. */
let settling: { action: 'open' | 'close'; columns: number; tick: number } | undefined
/** Whether the person closed the pane (its close mark, ctrl+x x, `/cockpit`): it stays closed until asked (E.47). */
let isClosedByPerson = false
/** Whether a close is Cockpit's own, so the close hook tells it from the person's. */
let isClosing = false

/**
 * Changes the seat just after the draw that asks for it: the engine draws only once a resize has settled, so a drag
 * across a threshold changes nothing until it stops. A width change inside the wait drops it: the draw at the new width
 * decides again.
 * @param $ the engine interface
 * @param action open at the width rule, or close a pane nobody asked for
 * @param columns the terminal's columns now
 */
function settle($: EngineInterface, action: 'open' | 'close', columns: number): void {
  const tick = widthTick()

  if (settling?.action === action && settling.columns === columns && settling.tick === tick) return

  const mine = { action, columns, tick }
  settling = mine

  try {
    $.clock.after(SETTLE_MS, () => {
      if (settling !== mine) return

      settling = undefined

      if (widthTick() !== tick) return

      void (action === 'open' ? openAt($, columns) : leaveUnasked($, columns)).catch((error: unknown) => logSeatError($, error))
    })
  } catch (error: unknown) {
    settling = undefined
    logSeatError($, error)
  }
}

/**
 * Closes a pane nobody asked for where it may not stay: inline, or docked below 144 columns. It leaves no open
 * waiting behind (one would dock by itself at its old width once the terminal widens); a draw that finds the width
 * wide enough again opens it at the width rule (`seatFor`).
 * @param $ the engine interface
 * @param columns the terminal's columns
 */
async function leaveUnasked($: EngineInterface, columns: number): Promise<void> {
  leftAt = columns
  $.ui.log(`cockpit: seat close at ${columns} columns (not asked)`, { to: 'debug' })
  isClosing = true

  try {
    await $.ui.close({ id: PANE })
  } finally {
    isClosing = false
  }

  setDocked($, false)
}

/**
 * The seat for a draw at this width (amendments 5 and 10): an inline pane nobody asked for leaves at once (it would
 * cover the conversation); a docked one nobody asked for leaves below 144 columns; a docked pane opens again at the width
 * rule at a new width; with no pane placed, a fullscreen terminal at 144 columns or more gets one, unless the person
 * closed it. Each waits for the draw's burst to end (settle).
 * @param $ the engine interface
 * @param placement the pane's seat now, `none` when no pane is placed
 * @param columns the terminal's columns
 * @param isFullscreen whether this session docks panes at all
 */
function seatFor($: EngineInterface, placement: 'dock' | 'inline' | 'none', columns: number, isFullscreen: boolean): void {
  if (placement === 'inline') {
    if (askedInline === undefined && leftAt !== columns) {
      settling = undefined
      void leaveUnasked($, columns).catch((error: unknown) => logSeatError($, error))
    }

    return
  }

  if (placement === 'dock') {
    if (!isAsked && columns < UNASKED_MIN) {
      if (leftAt !== columns) settle($, 'close', columns)
    } else if (columns !== openedAt) settle($, 'open', columns)
    else if (settling?.action === 'close') settling = undefined

    return
  }

  if (isFullscreen && !isAsked && !isClosedByPerson && columns >= UNASKED_MIN) settle($, 'open', columns)
}

/**
 * Opens the pane at session start: placed at once from 144 columns. Narrower, the engine would keep the open waiting
 * and dock it by itself at the start's width; it is withdrawn instead, and a draw opens it once the terminal is wide.
 * @param $ the engine interface
 * @returns whether it was placed
 */
export async function seatAtStart($: EngineInterface): Promise<boolean> {
  const { isPlaced } = await $.ui.open({ id: PANE, columns: FIRST_COLUMNS })

  if (!isPlaced) {
    isClosing = true

    try {
      await $.ui.close({ id: PANE })
    } finally {
      isClosing = false
    }
  }

  return isPlaced
}

/**
 * Logs a seat change that failed; the pane keeps the seat it had.
 * @param $ the engine interface
 * @param error what the engine answered
 */
export function logSeatError($: EngineInterface, error: unknown): void {
  $.ui.log(`cockpit: seat change failed: ${String(error)}`)
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
    if (!isClosing) isClosedByPerson = true

    return next(e)
  })

  on('command.run', { command: PANE }, async ($, e) => {
    if (!isOn()) {
      return { text: OFF_NOTE }
    }

    const isPlaced = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)

    if (isPlaced) {
      isClosedByPerson = true
      await $.ui.close({ id: PANE })

      setDocked($, false)

      return { text: 'pane closed' }
    }

    const { columns, isFullscreen } = e.presentation
    askedInline = !isFullscreen || columns < DOCK_MIN ? 'cockpit' : undefined
    isAsked = true
    isClosedByPerson = false
    leftAt = undefined
    const opened = await openAt($, columns)

    return { text: opened.isPlaced ? `pane open · ${paneColumns(columns)} columns` : `pane not placed · ${opened.reason}` }
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
    openedAt = columns
    const opened = await $.ui.open({ id: PANE, columns: paneColumns(columns), rows: INSPECTOR_ROWS, focus: true, closeOnEscape: true })

    return { text: opened.isPlaced ? text : `${text} · pane not placed · ${opened.reason}` }
  })

  // `/copy` stays the engine's (the last answer); Cockpit answers the forms it adds (E.24, G.78) and passes the rest on.
  on('command.run', { command: 'copy' }, async ($, e, next) => {
    if (!isOn()) return next(e)

    const said = await copyFromCommand($, e.args, e.presentation.columns)

    return said === undefined ? next(e) : { text: said }
  })

  // The focus ring moved in the pane: `c` copies what it is on.
  on('ui.focus', (_$, e, next) => {
    if (e.component === 'Pane' && e.requestId === PANE) noteRing(e.element)

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
          $.ui.log(`cockpit: /tui note not read: ${String(error)}`)

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
      } else {
        // Docked, the left stays docked until a seat change settles (one nobody asked for leaving below 144).
        setDocked($, true)
        seatFor($, 'dock', columns, isFullscreen)
      }
    }

    // The prompt's hint line follows who holds the keyboard.
    if (e.props.isFocused !== isPaneFocused) {
      isPaneFocused = e.props.isFocused
      $.ui.invalidate('ui.render')
    }

    // Every section, fitted to the body so the engine never scrolls it (E.37); or, in the focused pane, a view (E.44)
    // as tall as it needs, which the engine scrolls. Reading `second` redraws this each second while a turn or a
    // background agent runs; reading the view's counter, when a key changes the view.
    await readSecond($)
    await readViewTick($)
    const view = viewNow(e.props.isFocused)
    const log = await readLog($)
    const roster = await readRoster($)
    const work = await readWork($)
    const isTicking = log.isTurnRunning || roster.some(a => a.state === 'running')
    const isCovered = e.props.isPromptCovered === true
    const now = isTicking || hasCopied() ? await $.clock.now() : 0

    if (!isCovered || openRows === undefined) openRows = scroll.bodyRows

    const pinNo = await readPin($)
    const pinned = pinNo === null ? undefined : (await readHistory($)).find(r => r.turnNo === pinNo)
    const isPinned = pinned !== undefined
    const isInspector = placement === 'inline' && askedInline === 'steps'
    const fitTo =
      (isCovered ? Math.min(openRows, scroll.bodyRows) : scroll.bodyRows) - (e.props.isFocused ? hintRows(view, bodyColumns, isPinned, isInspector) : 0)
    const shown =
      pinned !== undefined
        ? { ...log, steps: pinned.steps, dropped: pinned.dropped, turnNo: pinned.turnNo }
        : log.steps.length > 0 || log.prev === null
          ? log
          : { ...log, steps: log.prev.steps, dropped: log.prev.dropped, turnNo: log.prev.turnNo }
    let lines: Line[]

    if (view.kind === 'all') {
      lines = allRows(shown, bodyColumns)
    } else if (view.kind === 'diff') {
      lines = diffRows(view.path, view.patch, bodyColumns, view.note)
    } else if (view.kind === 'step') {
      const at = shown.steps.findIndex(s => s.id === view.id)
      const step = shown.steps[at]
      const detail = (await readDetails($)).find(d => d.id === view.id) ?? pinned?.details.find(d => d.id === view.id)
      lines = step === undefined ? [] : detailRows(step, detail, shown.dropped + at + 1, shown.turnNo, bodyColumns)
    } else if (isInspector) {
      lines = inspectorLines(log, bodyColumns, fitTo, pinned)
    } else {
      lines = paneLines(log, isTicking ? now : 0, bodyColumns, fitTo, isCovered, { roster, work }, wholeNow(), pinned)
    }

    return drawPane($, e, lines, view, copiedNote(now), isPinned, isInspector)
  })
}

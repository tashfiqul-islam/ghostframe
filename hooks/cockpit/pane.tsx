// The Cockpit pane (spec C.1, E.37; corrections A, B and K): its seat at the width rule, `/cockpit`, and its drawing.
import type { EngineInterface, Register, UiOpenResult } from 'claude-code'

import { paneLines } from './fit'
import { readDetails } from './keys/details'
import { drawPane, hintRows } from './keys/draw'
import { allRows, detailRows, diffRows } from './keys/views'
import { copiedNote, hasCopied, noteRing, readViewTick, viewNow, wholeNow } from './keys/view'
import type { Line } from './line'
import { columnsNow, noteScreen, sayScreen, screenToSay, setDocked, widthTick } from './left'
import { readLog, readRoster, readSecond } from './log'
import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { OFF_NOTE, isOn } from './switch'
import { readWork } from './work'
import { PANE, STEPS, docked } from './mode'
import { readHistory, readPin } from './history/store'
import { pinFromCommand } from './keys/view'
import { INSPECTOR_ROWS, inspectorLines } from './fallback/inspector'
import { copyFromCommand, stepsAllText } from './copy'

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
/** The width a re-open waits to see stable, so a drag across a threshold does not flap (E.47, amendment 10). */
let settling: number | undefined
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

  return $.ui.open({ id: PANE, columns: paneColumns(columns) })
}

/** How long the terminal's width must hold before the pane opens again (E.47). */
export const SETTLE_MS = 300

/** Below this many columns a pane nobody asked for leaves the dock (amendment 5; the engine keeps it to 110). */
export const UNASKED_MIN = 144

/**
 * Opens the pane again once the terminal's width has held for 300 ms: a width change inside the wait starts it again
 * at the new width. Every open passes `columns` (correction K).
 * @param $ the engine interface
 * @param columns the terminal's columns now
 */
function openWhenStable($: EngineInterface, columns: number): void {
  if (settling === columns) return

  settling = columns
  const tick = widthTick()

  try {
    $.clock.after(SETTLE_MS, () => {
      if (settling !== columns) return

      settling = undefined

      if (widthTick() !== tick) openWhenStable($, columnsNow() ?? columns)
      else void openAt($, columns).catch((error: unknown) => logSeatError($, error))
    })
  } catch (error: unknown) {
    settling = undefined
    logSeatError($, error)
  }
}

/**
 * Closes a pane nobody asked for where it may not stay: inline, or docked below 144 columns. In fullscreen it opens
 * again once the width holds, and that open waits undrawn until the terminal is wide enough for the dock again.
 * @param $ the engine interface
 * @param columns the terminal's columns
 * @param isFullscreen whether this session docks panes at all
 */
async function leaveUnasked($: EngineInterface, columns: number, isFullscreen: boolean): Promise<void> {
  leftAt = columns
  await $.ui.close({ id: PANE })

  if (isFullscreen) openWhenStable($, columns)
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

    return next(e)
  })

  on('command.run', { command: PANE }, async ($, e) => {
    if (!isOn()) {
      return { text: OFF_NOTE }
    }

    const isPlaced = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)

    if (isPlaced) {
      await $.ui.close({ id: PANE })

      setDocked($, false)

      return { text: 'pane closed' }
    }

    const { columns, isFullscreen } = e.presentation
    askedInline = !isFullscreen || columns < DOCK_MIN ? 'cockpit' : undefined
    isAsked = true
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

  // While the pane holds the keyboard, the prompt's hint line says so (E.18): keys typed now reach the pane. The hint
  // is drawn on every screen, so it is also where a switch of screen by `/tui` is said, once (F.40, probe 19).
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (isOn() && e.surface === 'terminal') {
      noteScreen(e.viewport?.isFullscreen, e.viewport?.columns)

      if (screenToSay() !== undefined) sayScreen($, paneColumns(e.viewport?.columns ?? 0), (await readHistory($)).length)
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
      noteScreen(viewport.isFullscreen, columns)

      if (placement === 'inline') {
        setDocked($, false)

        if (askedInline === undefined && leftAt !== columns) {
          void leaveUnasked($, columns, isFullscreen).catch((error: unknown) => logSeatError($, error))
        }

        if (askedInline === undefined) {
          return <Box />
        }
      } else if (!isAsked && columns < UNASKED_MIN) {
        // The engine keeps a docked pane down to 110 columns; one nobody asked for leaves below 144 (amendment 5).
        setDocked($, false)

        if (leftAt !== columns) void leaveUnasked($, columns, isFullscreen).catch((error: unknown) => logSeatError($, error))

        return <Box />
      } else {
        setDocked($, true)

        if (columns !== openedAt) openWhenStable($, columns)
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

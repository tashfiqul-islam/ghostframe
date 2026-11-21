// The Cockpit pane (spec C.1, E.37; corrections A, B and K): its seat at the width rule, `/cockpit`, and its drawing.
import type { EngineInterface, Register, UiOpenResult } from 'claude-code'

import { drawRows } from './draw'
import { paneRows } from './fit'
import { setDocked } from './left'
import { readLog, readRoster, readSecond } from './log'
import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { OFF_NOTE, isOn } from './switch'
import { readWork } from './work'
import { PANE } from './mode'

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
/** The person's `/cockpit` ran where no dock exists, so an inline pane is theirs and stays. */
let isAskedInline = false
/**
 * The pane's body rows while no dialog covers the prompt. A permission dialog or a question card grows the pane
 * (correction C); the pane is still fitted to this height, so every row stays where it was and the new rows stay
 * blank until the dialog closes.
 */
let openRows: number | undefined

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

/**
 * Closes an inline pane nobody asked for. In fullscreen it then opens again on its own, which waits
 * undrawn until the terminal is wide enough for the dock again.
 * @param $ the engine interface
 * @param columns the terminal's columns
 * @param isFullscreen whether this session docks panes at all
 */
async function leaveInline($: EngineInterface, columns: number, isFullscreen: boolean): Promise<void> {
  leftAt = columns
  await $.ui.close({ id: PANE })

  if (isFullscreen) {
    await openAt($, columns)
  }
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
  // The person closed the pane: the transcript is no longer quiet.
  on('ui.close', { id: PANE }, ($, e, next) => {
    setDocked($, false)

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
    isAskedInline = !isFullscreen || columns < DOCK_MIN
    leftAt = undefined
    const opened = await openAt($, columns)

    return { text: opened.isPlaced ? `pane open · ${paneColumns(columns)} columns` : `pane not placed · ${opened.reason}` }
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
      setDocked($, placement !== 'inline')

      if (placement === 'inline') {
        if (!isAskedInline && leftAt !== columns) {
          void leaveInline($, columns, viewport.isFullscreen === true).catch((error: unknown) => logSeatError($, error))
        }

        if (!isAskedInline) {
          return <Box />
        }
      } else if (columns !== openedAt) {
        void openAt($, columns).catch((error: unknown) => logSeatError($, error))
      }
    }

    // Every section, fitted to the body so the engine never scrolls it (E.37).
    // Reading `second` redraws this each second while a turn or a background agent runs; only the clocks change.
    await readSecond($)
    const log = await readLog($)
    const roster = await readRoster($)
    const work = await readWork($)
    const isTicking = log.isTurnRunning || roster.some(a => a.state === 'running')
    const isCovered = e.props.isPromptCovered === true

    if (!isCovered || openRows === undefined) openRows = scroll.bodyRows

    const fitTo = isCovered ? Math.min(openRows, scroll.bodyRows) : scroll.bodyRows
    const rows = paneRows(log, isTicking ? await $.clock.now() : 0, bodyColumns, fitTo, isCovered, { roster, work })

    return <Box flexDirection="column">{drawRows(ui, rows)}</Box>
  })
}

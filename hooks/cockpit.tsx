// Cockpit, phase 1: the seat. The pane opens at session start, docks at the width rule (hooks/seat.ts)
// and draws an empty frame with a column ruler. Spec: docs/design/cockpit-v7.md E.36, C.1 and E.24.
import type { EngineInterface, Register, SessionStartInput, UiOpenResult } from 'claude-code'

import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { C } from './tokens'

type On = Parameters<Register>[0]
type SessionStart = Pick<SessionStartInput, 'isInteractive' | 'surface'>

const PANE = 'cockpit'

// The first open comes before any drawing has measured the terminal: ask for the hero width,
// and the first Pane render opens again at the width rule.
const FIRST_COLUMNS = 72

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
function logSeatError($: EngineInterface, error: unknown): void {
  $.ui.log(`cockpit: seat change failed: ${String(error)}`)
}

/**
 * One row of the column ruler: the tens digit every ten columns, or every units digit.
 * @param width the pane's body columns
 * @param isTens the tens row
 * @returns the row, exactly `width` cells
 */
function rulerRow(width: number, isTens: boolean): string {
  return Array.from({ length: width }, (_, i) => (isTens ? (i % 10 === 0 ? String(Math.floor(i / 10) % 10) : ' ') : String(i % 10))).join('')
}

/**
 * Cockpit's part of `session.start` (a plugin hooks it once): registers `/cockpit` and opens the pane.
 * Unasked, the engine docks it from 144 columns (110 once asked) and holds it undrawn below that.
 * @param $ the engine interface
 * @param e the session start's input
 */
export async function startCockpit($: EngineInterface, e: SessionStart): Promise<void> {
  await $.command.register({ name: PANE, description: 'Open or close the Cockpit pane' })

  if (e.isInteractive && e.surface === 'terminal') {
    void $.ui.open({ id: PANE, columns: FIRST_COLUMNS }).catch((error: unknown) => logSeatError($, error))
  }
}

/**
 * Adds Cockpit's hooks: the `/cockpit` command and the pane's drawing.
 * @param on the `on` that `register` receives
 */
export function registerCockpit(on: On): void {
  on('command.run', { command: PANE }, async ($, e) => {
    const isPlaced = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)

    if (isPlaced) {
      await $.ui.close({ id: PANE })

      return { text: 'pane closed' }
    }

    const { columns, isFullscreen } = e.presentation
    isAskedInline = !isFullscreen || columns < DOCK_MIN
    leftAt = undefined
    const opened = await openAt($, columns)

    return { text: opened.isPlaced ? `pane open · ${paneColumns(columns)} columns` : `pane not placed · ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { placement, bodyColumns, scroll } = e.props
    const viewport = e.viewport

    if (e.surface === 'terminal' && viewport !== undefined) {
      const columns = terminalColumns(placement, viewport.columns, bodyColumns)

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

    const terminal = viewport === undefined ? '?' : String(terminalColumns(placement, viewport.columns, bodyColumns))

    return (
      <Box flexDirection="column">
        <Text color={C.muted} wrap="truncate">
          {rulerRow(bodyColumns, true)}
        </Text>
        <Text color={C.muted} wrap="truncate">
          {rulerRow(bodyColumns, false)}
        </Text>
        <Text color={C.muted} wrap="truncate">
          {`${bodyColumns} of ${terminal} columns · ${scroll.bodyRows} rows · ${placement}`}
        </Text>
      </Box>
    )
  })
}

// Cockpit's part of the left while its pane is docked (spec E.1, E.5, E.32, E.33): the quiet transcript's `↗` rows
// and receipts, and the one-row live area.
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { remember } from '../shared/held'
import { drawRows } from './draw'
import { liveRow } from './head'
import { readFrame, readLog, readReceipts } from './log'
import { docked, setDockedFlag, shownAtTurn } from './mode'
import { receiptRows, shipRows } from './quiet'
import { isOn } from './switch'

/**
 * Whether the left is quiet now (phase 4): Cockpit on, its pane docked, and its tab shown when the running turn
 * started. For what is live (the spinner row, the agent list); a transcript row asks `isQuietRow`. Off, the
 * transcript is as it was.
 */
export const isQuiet = (): boolean => isOn() && docked() && shownAtTurn()

// Each transcript row's mode, by its request: the mode of its first draw. A row once drawn never changes when the
// pane is closed, docked again, or hidden behind another tab: only rows drawn later take the new mode.
// shortcut: kept in the module, so a reload forgets it and rows drawn again after one take the mode of that moment.
const rowModes = new Map<string, boolean>()
const ROWS_MAX = 2_000

/**
 * Whether a transcript row draws quiet: the mode it was first drawn in, or the mode now for a new row.
 * @param row the row's render request
 * @returns whether it is quiet
 */
export function isQuietRow(row: string | undefined): boolean {
  if (row === undefined) return isQuiet()

  const had = rowModes.get(row)

  if (had !== undefined) return had

  const now = isQuiet()
  remember(rowModes, row, now, ROWS_MAX)

  return now
}

/**
 * Sets whether the pane is docked. Rows already drawn keep their mode; the live rows follow at once.
 * @param $ the engine interface
 * @param value whether it is
 */
export function setDocked($: EngineInterface, value: boolean): void {
  if (setDockedFlag(value)) $.ui.invalidate('ui.render')
}

/**
 * Cockpit's part of a folded `ToolGroup` while quiet: nothing, except a `↗` row for a push or a pull request.
 * @param $ the engine interface
 * @param e the render
 * @param width the transcript rule's width
 * @returns the rows' tree (an empty Box draws nothing)
 */
export async function drawQuietGroup($: EngineInterface, e: RenderInput<'ToolGroup', 'terminal'>, width: number): Promise<RenderElement> {
  const ui = $.ui.resolve(e)
  const log = await readLog($)
  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
  const clockOf = (id: string) => steps.find(s => s.id === id || s.calls?.includes(id) === true)?.clock
  const rows = shipRows(e.props.calls, clockOf, width)

  return <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>
}

/**
 * Cockpit's part of a turn's last answer block while quiet: the receipt of the engine turn that block ended, with
 * its `still failing` rows, one blank row above (E.32). Every turn that answered gets exactly one, keyed by the
 * engine's turn id, which a block knows from its first draw: the engine's footer can't carry it, since the turns
 * an agent's reports start share one footer, or have none (phase 5 probe). Nothing for an interrupted turn
 * (correction G), nor before the turn's receipt is kept; it then draws when it is.
 * @param $ the engine interface
 * @param e the block's render
 * @param turn the engine turn the block ended
 * @param width the transcript rule's width
 * @returns the tree, or undefined when there is none to draw
 */
export async function drawTurnReceipt(
  $: EngineInterface,
  e: RenderInput<'AssistantMessage', 'terminal'>,
  turn: string,
  width: number
): Promise<RenderElement | undefined> {
  const receipt = (await readReceipts($)).findLast(r => r.turn === turn)
  const rows = receipt === undefined ? [] : receiptRows(receipt, width)

  if (rows.length === 0) return undefined

  const ui = $.ui.resolve(e)

  return (
    <ui.Box flexDirection="column" marginTop={1}>
      {drawRows(ui, rows)}
    </ui.Box>
  )
}

/**
 * Cockpit's part of the `Spinner` site (a plugin hooks it once): while the pane is docked, the left's live area
 * is one row, `working` and the turn's time (E.33). Undefined leaves the site to the caller.
 * @param $ the engine interface
 * @param e the render
 * @returns the row's tree, or undefined
 */
export async function drawLive($: EngineInterface, e: RenderInput<'Spinner', 'terminal'>): Promise<RenderElement | undefined> {
  if (!isQuiet() || e.viewport === undefined) return undefined

  const now = await $.clock.now()
  const ui = $.ui.resolve(e)
  const { Box } = ui
  // The transcript's frame: its last column stays empty, and it never passes 120 (C.1).
  const width = Math.min(e.viewport.columns - 1, 120)

  return <Box>{drawRows(ui, [liveRow(await readLog($), now, await readFrame($), width)])}</Box>
}

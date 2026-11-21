// Cockpit's part of the left while its pane is docked (spec E.1, E.5, E.32, E.33): the quiet transcript's `↗` rows
// and receipt, and the one-row live area.
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { drawRows } from './draw'
import { liveRow } from './head'
import { readFrame, readLog, readReceipts } from './log'
import { receiptRows, shipRows } from './quiet'
import { isOn } from './switch'

/** The pane is docked now: the left's live area is then one row (E.33); otherwise it is the engine's. */
let isDocked = false

/** Whether the left is quiet now: Cockpit on and its pane docked (phase 4). Off, the transcript is as it was. */
export const isQuiet = (): boolean => isOn() && isDocked

/**
 * Sets whether the pane is docked. A change redraws the transcript, so it turns quiet, or back, at once.
 * @param $ the engine interface
 * @param docked whether it is
 */
export function setDocked($: EngineInterface, docked: boolean): void {
  if (docked === isDocked) return

  isDocked = docked
  $.ui.invalidate('ui.render')
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
 * Cockpit's part of `TurnDuration` while quiet: the receipt of the turn the footer stands for, with its
 * `still failing` rows, and one blank row above. Nothing for an interrupted turn (correction G).
 * @param $ the engine interface
 * @param e the render
 * @param turn the id of the turn the footer stands for, when known; unknown, the current turn's
 * @param width the transcript rule's width
 * @returns the tree; an empty one while the current turn's receipt is on its way (the engine may raise the
 *   footer before `turn.complete` keeps it, and the old footer must not flash); undefined for an earlier turn
 *   that has no receipt, which keeps the old footer
 */
export async function drawReceipt(
  $: EngineInterface,
  e: RenderInput<'TurnDuration', 'terminal'>,
  turn: string | undefined,
  width: number
): Promise<RenderElement | undefined> {
  const ui = $.ui.resolve(e)
  const current = (await readLog($)).turn
  const wanted = turn ?? current
  const receipt = (await readReceipts($)).findLast(r => r.turn === wanted)

  if (receipt === undefined) return wanted === current ? <ui.Box /> : undefined

  const rows = receiptRows(receipt, width)

  return rows.length === 0 ? (
    <ui.Box />
  ) : (
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
  if (!isOn() || !isDocked || e.viewport === undefined) return undefined

  const now = await $.clock.now()
  const ui = $.ui.resolve(e)
  const { Box } = ui
  // The transcript's frame: its last column stays empty, and it never passes 120 (C.1).
  const width = Math.min(e.viewport.columns - 1, 120)

  return <Box>{drawRows(ui, [liveRow(await readLog($), now, await readFrame($), width)])}</Box>
}

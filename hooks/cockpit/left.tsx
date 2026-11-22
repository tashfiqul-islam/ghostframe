// Cockpit's part of the left while its pane is docked (spec E.1, E.5, E.32, E.33): the quiet transcript's `↗` rows
// and receipts, and the one-row live area.
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { remember } from '../shared/held'
import { drawRow, drawRows } from './draw'
import { pinFromCommand } from './keys/view'
import { liveRow } from './head'
import { readFrame, readLog, readReceipts } from './log'
import { beforeStart, docked, seated, setDockedFlag, shownAtTurn } from './mode'
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
// The rows of the transcript a resume brought back, drawn before the session started.
const resumedRows = new Set<string>()
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

  // A resumed transcript is drawn before the session starts and the pane is placed: its rows are not held to that
  // moment's mode, and draw again in the pane's. (A row drawn before Cockpit docks mid-session keeps its mode.)
  if (beforeStart()) resumedRows.add(row)

  if (resumedRows.has(row) && !seated()) return now

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
 * Cockpit's part of a standalone call's row (`ToolUse`: an `Agent` launch, a fetch, a search) while quiet: nothing,
 * except a `↗` row for a push or a pull request, as for a folded group.
 * @param $ the engine interface
 * @param e the render
 * @param width the transcript rule's width
 * @returns the rows' tree (an empty Box draws nothing)
 */
export async function drawQuietCall($: EngineInterface, e: RenderInput<'ToolUse', 'terminal'>, width: number): Promise<RenderElement> {
  const ui = $.ui.resolve(e)
  const log = await readLog($)
  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
  const p = e.props
  const rows = shipRows(
    [{ tool_use_id: p.tool_use_id, tool: p.tool, input: p.input, output: p.output, isErrored: p.isErrored }],
    id => steps.find(s => s.id === id)?.clock,
    width
  )

  return <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>
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
 * A click on a receipt: pins its turn and says so in a toast (a receipt of the live turn pins nothing: the pane
 * already shows it). It only pins: nothing is sent, run again or rewound.
 * @param $ the engine interface
 * @param turnNo the receipt's turn
 */
async function pinAndSay($: EngineInterface, turnNo: number): Promise<void> {
  $.ui.toast(await pinFromCommand($, String(turnNo)))
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
  const { Box, Button } = ui
  const turnNo = receipt?.turnNo ?? 0
  const above = rows.slice(0, -1)
  const own = rows.at(-1) ?? []

  // A click on the receipt pins its turn in the pane (E.45; probe 25: a Button there is pressed by a click).
  return (
    <Box flexDirection="column" marginTop={1}>
      {drawRows(ui, above)}
      <Button key={`receipt:${turn}`} plain onPress={() => void pinAndSay($, turnNo)}>
        {drawRow(ui, own, 'receipt')}
      </Button>
    </Box>
  )
}

/**
 * Whether an answer row is the one a receipt ends on: the turn's answer, where the quiet left puts `claude` on a
 * resumed transcript (its rows have no place in the flow).
 * shortcut: a resumed answer split over several messages gets the label on its last row; seed the quiet openers
 * from `$.session.messages()` if that shows.
 * @param $ the engine interface
 * @param row the row's id
 * @returns whether it is
 */
export async function endsKeptTurn($: EngineInterface, row: string): Promise<boolean> {
  return (await readReceipts($)).some(r => r.answer === row && r.turn !== null)
}

/**
 * Cockpit's part of an answer row while quiet: the receipt that names the row (its turn's last answer row, by the
 * id it is drawn under, live and after a resume, so two answers with the same text never swap receipts); for a
 * turn that named no row, the turn's receipt under its last block in the flow.
 * @param $ the engine interface
 * @param e the row's render
 * @param turn the row's turn in the flow, null when it has no place there
 * @param endsTurn whether it is its turn's last text block in the flow
 * @param width the transcript rule's width
 * @returns the tree, or undefined when no receipt ends on this row
 */
export async function drawAnswerReceipt(
  $: EngineInterface,
  e: RenderInput<'AssistantMessage', 'terminal'>,
  turn: string | null,
  endsTurn: boolean,
  width: number
): Promise<RenderElement | undefined> {
  const list = await readReceipts($)
  const own = list.findLast(r => r.answer === e.requestId)
  const turns = turn === null || !endsTurn ? undefined : list.findLast(r => r.turn === turn)
  const receipt = own ?? (turns?.answer === '' ? turns : undefined)

  return receipt?.turn === null || receipt === undefined ? undefined : drawTurnReceipt($, e, receipt.turn, width)
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

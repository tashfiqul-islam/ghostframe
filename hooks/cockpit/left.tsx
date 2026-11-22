// Cockpit's part of the left (spec E.1, E.3, E.5, E.32, E.33, E.47): docked, the quiet transcript's `↗` rows and
// receipts and the one-row live area; in fallback (Cockpit on, no pane docked), the same quiet transcript with a
// capsule per stretch of work and a row per failure, and the whole live area (fallback/).
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { remember } from '../shared/held'
import { drawRow, drawRows } from './draw'
import { pinFromCommand } from './keys/view'
import { liveRow } from './head'
import { readFrame, readLog, readReceipts } from './log'
import { beforeStart, docked, seated, setDockedFlag, shownAtTurn } from './mode'
import { receiptRows, shipRows } from './quiet'
import { drawAgentFailure, drawBlockCapsule, drawFallbackCalls, drawFallbackLive, footerCapsule } from './fallback/draw'
import { capsulesIn, claimFooter } from './fallback/stretch'
import { isOn } from './switch'

/**
 * Whether the left is quiet now (phase 4): Cockpit on, its pane docked, and its tab shown when the running turn
 * started. For what is live (the spinner row, the agent list); a transcript row asks `isQuietRow`. Off, the
 * transcript is as it was.
 */
export const isQuiet = (): boolean => isOn() && docked() && shownAtTurn()

/**
 * Whether the left is in fallback now (E.3, E.47): Cockpit on and no pane docked (too narrow, not fullscreen, or
 * closed), so the facts the pane would show fold into capsules, failure rows and the full live area.
 */
export const isFallback = (): boolean => isOn() && !docked()

/** How a transcript row draws: quiet beside the docked pane, quiet with capsules in fallback, or as it was. */
type LeftMode = 'docked' | 'fallback' | 'full'

const modeNow = (): LeftMode => (isQuiet() ? 'docked' : isFallback() ? 'fallback' : 'full')

// Each transcript row's mode, by its request: the mode of its first draw. A row once drawn never changes when the
// pane is closed, docked again, or hidden behind another tab: only rows drawn later take the new mode.
// shortcut: kept in the module, so a reload forgets it and rows drawn again after one take the mode of that moment.
const rowModes = new Map<string, LeftMode>()
// The rows of the transcript a resume brought back, drawn before the session started.
const resumedRows = new Set<string>()
const ROWS_MAX = 2_000

/**
 * A transcript row's mode: the mode it was first drawn in, or the mode now for a new row.
 * @param row the row's render request
 * @returns the mode
 */
function rowMode(row: string | undefined): LeftMode {
  if (row === undefined) return modeNow()

  const had = rowModes.get(row)

  if (had !== undefined) return had

  const now = modeNow()

  // A resumed transcript is drawn before the session starts and the pane is placed: its rows are not held to that
  // moment's mode, and draw again in the pane's. (A row drawn before Cockpit docks mid-session keeps its mode.)
  if (beforeStart()) resumedRows.add(row)

  if (resumedRows.has(row) && !seated()) return now

  remember(rowModes, row, now, ROWS_MAX)

  return now
}

/**
 * Whether a transcript row draws quiet (Cockpit's left, docked or in fallback): narration, steps and the engine's
 * agent rows leave it, and each turn's receipt ends its answer.
 * @param row the row's render request
 * @returns whether it is quiet
 */
export const isQuietRow = (row: string | undefined): boolean => rowMode(row) !== 'full'

/**
 * Whether a quiet row draws in fallback: with capsules and failure rows, since no pane shows the steps.
 * @param row the row's render request
 * @returns whether it does
 */
export const isFallbackRow = (row: string | undefined): boolean => rowMode(row) === 'fallback'

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
  const p = e.props

  if (isFallbackRow(e.requestId)) {
    return drawFallbackCalls(
      $,
      ui,
      e.requestId,
      [{ tool_use_id: p.tool_use_id, tool: p.tool, input: p.input, output: p.output, isErrored: p.isErrored }],
      width
    )
  }

  const log = await readLog($)
  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
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

  if (isFallbackRow(e.requestId)) return drawFallbackCalls($, ui, e.requestId, e.props.calls, width)

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
  const fallback = isFallbackRow(e.requestId) && receipt !== undefined ? { capsules: capsulesIn(receipt.turnNo) } : undefined
  const rows = receipt === undefined ? [] : receiptRows(receipt, width, fallback)

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
 * is one row, `working` and the turn's time (E.33); in fallback, the whole live area. Undefined leaves the site to
 * the caller.
 * @param $ the engine interface
 * @param e the render
 * @returns the row's tree, or undefined
 */
export async function drawLive($: EngineInterface, e: RenderInput<'Spinner', 'terminal'>): Promise<RenderElement | undefined> {
  if (e.viewport === undefined) return undefined
  if (isFallback()) return drawFallbackLive($, $.ui.resolve(e), e.viewport.columns)
  if (!isQuiet()) return undefined

  const now = await $.clock.now()
  const ui = $.ui.resolve(e)
  const { Box } = ui
  // The transcript's frame: its last column stays empty, and it never passes 120 (C.1).
  const width = Math.min(e.viewport.columns - 1, 120)

  return <Box>{drawRows(ui, [liveRow(await readLog($), now, await readFrame($), width)])}</Box>
}

/**
 * Cockpit's part of a block of Claude's text that stays, in fallback: the capsule that opens it (E.3 case 1).
 * @param $ the engine interface
 * @param e the block's render
 * @param turn the engine turn the block belongs to, if known
 * @param width the transcript rule's width
 * @returns the capsule's row, and whether it comes right after an event row (no blank row above it then, C.2)
 */
export async function drawAnswerCapsule(
  $: EngineInterface,
  e: RenderInput<'AssistantMessage', 'terminal'>,
  turn: string | null | undefined,
  width: number
): Promise<{ capsule: RenderElement | undefined; isAfterEvent: boolean }> {
  return isFallbackRow(e.requestId) ? drawBlockCapsule($, $.ui.resolve(e), e.requestId, turn, width) : { capsule: undefined, isAfterEvent: false }
}

/**
 * Cockpit's part of the turn footer (`TurnDuration`) while quiet: nothing, except in fallback for a turn that wrote
 * no text, where the footer draws the turn's capsule and its receipt (E.3 case 3). The footer claims, at its first
 * draw, the turn that just ended; a turn that wrote text has its receipt under its answer instead.
 * @param $ the engine interface
 * @param e the footer's render
 * @param width the transcript rule's width
 * @returns the tree (an empty Box draws nothing)
 */
export async function drawQuietFooter($: EngineInterface, e: RenderInput<'TurnDuration', 'terminal'>, width: number): Promise<RenderElement> {
  const ui = $.ui.resolve(e)
  const { Box } = ui

  if (!isFallbackRow(e.requestId)) return <Box />

  const turn = claimFooter(e.requestId, (await readLog($)).turn)
  const receipt = turn === null ? undefined : (await readReceipts($)).findLast(r => r.turn === turn)

  if (turn === null || receipt === undefined || receipt.answer !== '') return <Box />

  const capsule = await footerCapsule($, e.requestId, turn, width)
  const rows = receiptRows(receipt, width, { capsules: capsulesIn(receipt.turnNo) })

  return (
    <Box flexDirection="column" marginTop={1}>
      {drawRows(ui, [...(capsule === undefined ? [] : [capsule]), ...rows])}
    </Box>
  )
}

/**
 * Cockpit's part of an agent's notice (`UserMessage`) while quiet: nothing, except in fallback for an agent that
 * failed, whose `✕` row draws at once (E.13).
 * @param $ the engine interface
 * @param e the notice's render
 * @param width the transcript rule's width
 * @returns the tree (an empty Box draws nothing)
 */
export async function drawAgentNotice($: EngineInterface, e: RenderInput<'UserMessage', 'terminal'>, width: number): Promise<RenderElement> {
  const ui = $.ui.resolve(e)
  const task = e.props.origin.kind === 'task-notification' ? e.props.task : undefined
  const failed = isFallbackRow(e.requestId) && task !== undefined ? await drawAgentFailure($, ui, e.requestId, task, width) : undefined

  return failed ?? <ui.Box />
}

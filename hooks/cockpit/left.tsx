// Cockpit's part of the left (spec E.1, E.3, E.5, E.32, E.33, E.47): docked, the quiet transcript's `↗` rows and
// receipts and the one-row live area; in fallback (Cockpit on, no pane docked), the same quiet transcript with a
// capsule per stretch of work and a row per failure, and the whole live area (fallback/).
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { remember } from '../shared/held'
import type { Part } from '../shared/parts'
import type { Ui } from '../shared/rule'
import { drawRow, drawRows } from './draw'
import { pinFromCommand } from './keys/view'
import { liveRow } from './head'
import { readFrame, readLog, readReceipts } from './log'
import { beforeStart, docked, seated, setDockedFlag, shownAtTurn } from './mode'
import { receiptRows, shipRows } from './quiet'
import { capsuleCount, drawAgentFailure, drawBlockCapsule, drawFallbackCalls, drawFallbackLive, footerCapsule } from './fallback/draw'

import { readFlow, isNarrationAt } from '../shared/flow'
import { shellText } from '../shared/calls/ships'
import { turnOfCall, turnView } from './fallback/facts'
import { isOn } from './switch'
import { diffFrame, noteUnfolded, outputFrame, sentenceRows, stepRow, unfolded } from './unfolded'

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

/** A transcript row as its render carries it: its request, and the screen it is drawn on. */
export type RowSite = { requestId: string; viewport?: { columns?: number; isFullscreen?: boolean | undefined } | undefined }

// Outside fullscreen (the main screen, tmux) a row is printed once into the scrollback and never drawn again, so each
// row keeps the mode of its first draw (amendment 9). In fullscreen the engine redraws every visible row, and a row
// takes the mode the session is in now (amendment 10): what it draws is worked out from its own data, never from what
// an earlier draw decided, so it is the same after a resize, a resume or a reload.
// shortcut: kept in the module, so a reload forgets it; main-screen rows drawn again after one take that moment's mode.
const rowModes = new Map<string, LeftMode>()
// The rows of the transcript a resume brought back, drawn before the session started.
const resumedRows = new Set<string>()
const ROWS_MAX = 2_000

/**
 * A transcript row's mode: in fullscreen the mode now; on the main screen the mode it was first drawn in.
 * @param site the row's render
 * @returns the mode
 */
function rowMode(site: RowSite): LeftMode {
  const row = site.requestId

  // Docked, a row's width is the region beside the pane, not the terminal's.
  noteColumns(docked() ? undefined : site.viewport?.columns)

  // The ctrl+o view is the full record (E.4): quiet, its steps and sentences drawn as text rows, the same at any width.
  if (isOn() && unfolded()) return 'docked'

  const had = rowModes.get(row)

  // Fullscreen, the pane leaving or coming back redraws every row in the mode now (amendment 10). Whether a row was
  // drawn beside Cockpit's tab or another pane's is kept from its first draw (amendment 9): that is not a fallback.
  if (site.viewport?.isFullscreen !== false) {
    const now = modeNow()

    // Off (a copy of the module that has not read its switch yet, after a reload), nothing is kept: the row draws again
    // in Cockpit's mode once it is on.
    if (now === 'fallback' || !isOn() || (resumedRows.has(row) && !seated())) return now
    if (had !== undefined && had !== 'fallback') return had

    remember(rowModes, row, now, ROWS_MAX)

    return now
  }

  if (!isOn()) return modeNow()
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
export const isQuietRow = (row: RowSite): boolean => rowMode(row) !== 'full'

/**
 * Whether a quiet row draws in fallback: with capsules and failure rows, since no pane shows the steps.
 * @param row the row's render request
 * @returns whether it does
 */
export const isFallbackRow = (row: RowSite): boolean => rowMode(row) === 'fallback'

/** The terminal's columns as last drawn, so a re-open can wait for the width to hold (pane.tsx). */
let columns: number | undefined
/** How many times the width has changed: a wait for it to hold starts again when this moves. */
let widthChanges = 0

/** The terminal's columns as last drawn; undefined before any draw. */
export const columnsNow = (): number | undefined => columns

/** A count that moves each time the terminal's width changes. */
export const widthTick = (): number => widthChanges

/**
 * Notes the terminal's width as a draw knows it.
 * @param width the terminal's columns, when the draw knows them
 */
export function noteColumns(width: number | undefined): void {
  if (width === undefined || width === columns) return

  columns = width
  widthChanges += 1
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
 * Notes what a site says of the view (its `isExpanded`): the ctrl+o view, or not (E.4).
 * @param $ the engine interface
 * @param isExpanded the site's prop, undefined where it says nothing
 */
export function noteView($: EngineInterface, isExpanded: boolean | undefined): void {
  if (isOn()) noteUnfolded($, isExpanded)
}

/** The kinds whose output the ctrl+o view shows in a frame under their row. */
const OUTPUT_KINDS = new Set(['shell', 'test'])

/**
 * A call's rows in the ctrl+o view (E.4, F.8): its step row, inset under the sentence that announced it, then its
 * diff (an edit or a write) or its output (a command, a test) in a frame. A launch of several agents is one step
 * (amendment 1): its other calls draw nothing. Undefined for a call Cockpit's log does not have (the engine's row).
 * @param $ the engine interface
 * @param e the call's render, expanded
 * @param width the transcript rule's width
 * @returns the rows' tree, or undefined
 */
export async function drawUnfoldedCall($: EngineInterface, e: RenderInput<'ToolUse', 'terminal'>, width: number): Promise<RenderElement | undefined> {
  const p = e.props
  const turn = await turnOfCall($, await readFlow($), p.tool_use_id)
  const view = turn === undefined ? undefined : await turnView($, turn)
  const step = view?.steps.find(s => s.id === p.tool_use_id || s.calls?.includes(p.tool_use_id) === true)

  if (view === undefined || step === undefined) return undefined

  const ui = $.ui.resolve(e)

  if (step.id !== p.tool_use_id) return <ui.Box />

  const detail = view.details.find(d => d.id === step.id)
  const below =
    detail !== undefined && detail.patch.length > 0
      ? diffFrame(step.subject, detail.patch, width)
      : OUTPUT_KINDS.has(step.kind)
        ? outputFrame(shellText(p.output), width)
        : []

  return <ui.Box flexDirection="column">{drawRows(ui, [stepRow(step, detail?.ms, width), ...below])}</ui.Box>
}

/**
 * Whether a call's result row (`ToolResult`) draws nothing in the ctrl+o view: its output is in its step's frame.
 * @param $ the engine interface
 * @param id the call's id
 * @returns whether it does
 */
export async function isUnfoldedResult($: EngineInterface, id: string): Promise<boolean> {
  if (!isOn() || !unfolded()) return false

  const turn = await turnOfCall($, await readFlow($), id)
  const view = turn === undefined ? undefined : await turnView($, turn)

  return view?.steps.some(s => s.id === id || s.calls?.includes(id) === true) === true
}

/**
 * A sentence Claude said while working, in the ctrl+o view (E.4): `│` rows in muted, wrapped, with the turn clock at
 * which the step it announced started. Undefined for a block that is not narration (the answer draws as it does).
 * @param $ the engine interface
 * @param e the block's render
 * @param key the block's key in the flow
 * @param width the transcript rule's width
 * @returns the rows' tree, or undefined
 */
export async function drawUnfoldedSentence(
  $: EngineInterface,
  e: RenderInput<'AssistantMessage', 'terminal'>,
  key: string,
  width: number
): Promise<RenderElement | undefined> {
  if (!isOn() || !unfolded()) return undefined

  const flow = await readFlow($)
  const at = flow.findLastIndex(f => f.kind === 'text' && f.key === key)
  const f = flow[at]

  if (f === undefined || f.turn === null || !isNarrationAt(flow, at)) return undefined

  const view = await turnView($, f.turn)
  const next = flow.slice(at + 1).find(g => g.turn === f.turn && g.kind === 'tool')
  const clock = next === undefined ? undefined : view?.startOf(next.key)
  const ui = $.ui.resolve(e)

  return (
    <ui.Box flexDirection="column" marginTop={1}>
      {drawRows(ui, sentenceRows(e.props.text.trim(), clock, width))}
    </ui.Box>
  )
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

  const calls = [{ tool_use_id: p.tool_use_id, tool: p.tool, input: p.input, output: p.output, isErrored: p.isErrored }]
  const isFallbackNow = isFallbackRow(e)
  const tail = await noTextReceipt($, ui, [p.tool_use_id], width, isFallbackNow)

  if (isFallbackNow) return withTail(ui, await drawFallbackCalls($, ui, calls, width), tail)

  const log = await readLog($)
  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
  const rows = shipRows(calls, id => steps.find(s => s.id === id)?.clock, width)

  return withTail(ui, <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>, tail)
}

/** A call's rows, then the receipt of a turn that ended on it, if one did. */
const withTail = (ui: Pick<Ui, 'Box'>, rows: RenderElement, tail: RenderElement | undefined): RenderElement =>
  tail === undefined ? (
    rows
  ) : (
    <ui.Box flexDirection="column">
      {rows}
      {tail}
    </ui.Box>
  )

/**
 * The receipt of a turn that wrote no answer row (E.3 case 3, E.47: no turn is left without its numbers), drawn under
 * the row of the turn's last call, which the receipt names: docked, the receipt; in fallback, the capsule of the
 * turn's last stretch and the receipt. It reads only what is kept (the receipt, history), never what an earlier draw
 * decided, so it is drawn after a reload and a resume too. Nothing for an interrupted turn (correction G).
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param ids the call ids of the row
 * @param width the transcript rule's width
 * @param isFallbackNow whether the row draws in fallback
 * @returns the tree, or undefined when no such turn ended on this row
 */
async function noTextReceipt(
  $: EngineInterface,
  ui: Pick<Ui, 'Box' | 'Button' | 'Text'>,
  ids: readonly string[],
  width: number,
  isFallbackNow: boolean
): Promise<RenderElement | undefined> {
  const receipt = (await readReceipts($)).findLast(r => r.answer === '' && r.lastCall !== undefined && ids.includes(r.lastCall))
  const turn = receipt?.turn

  if (receipt === undefined || turn === null || turn === undefined) return undefined

  const capsule = isFallbackNow ? await footerCapsule($, turn, width) : undefined
  const rows = receiptRows(receipt, width, isFallbackNow ? { capsules: await capsuleCount($, turn) } : undefined)

  if (rows.length === 0) return undefined

  return receiptTree($, ui, receipt.turnNo, turn, [...(capsule === undefined ? [] : [capsule]), ...rows.slice(0, -1)], rows.at(-1) ?? [])
}

/**
 * A receipt's tree: one blank row above, the rows above it, then the receipt itself as a Button: a click pins its turn
 * in the pane (E.45; probe 25: a Button there is pressed by a click).
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param turnNo the receipt's typed turn
 * @param turn its engine turn, for the Button's key
 * @param above the rows above it (a capsule, `still failing` rows)
 * @param own the receipt's row
 * @returns the tree
 */
function receiptTree(
  $: EngineInterface,
  ui: Pick<Ui, 'Box' | 'Button' | 'Text'>,
  turnNo: number,
  turn: string,
  above: readonly Part[][],
  own: readonly Part[]
): RenderElement {
  const { Box, Button } = ui

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
 * Cockpit's part of a folded `ToolGroup` while quiet: nothing, except a `↗` row for a push or a pull request.
 * @param $ the engine interface
 * @param e the render
 * @param width the transcript rule's width
 * @returns the rows' tree (an empty Box draws nothing)
 */
export async function drawQuietGroup($: EngineInterface, e: RenderInput<'ToolGroup', 'terminal'>, width: number): Promise<RenderElement> {
  const ui = $.ui.resolve(e)

  const ids = e.props.calls.flatMap(c => (c.tool_use_id === undefined ? [] : [c.tool_use_id]))
  const isFallbackNow = isFallbackRow(e)
  const tail = await noTextReceipt($, ui, ids, width, isFallbackNow)

  if (isFallbackNow) return withTail(ui, await drawFallbackCalls($, ui, e.props.calls, width), tail)

  const log = await readLog($)
  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
  const clockOf = (id: string) => steps.find(s => s.id === id || s.calls?.includes(id) === true)?.clock
  const rows = shipRows(e.props.calls, clockOf, width)

  return withTail(ui, <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>, tail)
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
  const fallback = isFallbackRow(e) && receipt !== undefined ? { capsules: await capsuleCount($, turn) } : undefined
  const rows = receipt === undefined ? [] : receiptRows(receipt, width, fallback)

  if (rows.length === 0) return undefined

  return receiptTree($, $.ui.resolve(e), receipt?.turnNo ?? 0, turn, rows.slice(0, -1), rows.at(-1) ?? [])
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
 * @param key the block's key in the flow, if it has a place there
 * @param turn the engine turn the block belongs to, if known
 * @param width the transcript rule's width
 * @returns the capsule's row, and whether it comes right after an event row (no blank row above it then, C.2)
 */
export async function drawAnswerCapsule(
  $: EngineInterface,
  e: RenderInput<'AssistantMessage', 'terminal'>,
  key: string | undefined,
  turn: string | null | undefined,
  width: number
): Promise<{ capsule: RenderElement | undefined; isAfterEvent: boolean }> {
  return isFallbackRow(e) ? drawBlockCapsule($, $.ui.resolve(e), key, turn, width) : { capsule: undefined, isAfterEvent: false }
}

/**
 * Cockpit's part of the turn footer (`TurnDuration`) while quiet: nothing. A turn that wrote text has its receipt
 * under its answer, and one that wrote none under its last call's row (E.3 case 3): the engine's footer names no
 * turn (phase 5), so it cannot carry one.
 * @param $ the engine interface
 * @param e the footer's render
 * @returns the tree (an empty Box draws nothing)
 */
export function drawQuietFooter($: EngineInterface, e: RenderInput<'TurnDuration', 'terminal'>): RenderElement {
  return $.ui.resolve(e).Box({})
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
  const failed = isFallbackRow(e) && task !== undefined ? await drawAgentFailure($, ui, task, width) : undefined

  return failed ?? <ui.Box />
}

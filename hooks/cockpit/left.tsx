// Cockpit's part of the left (spec E.1, E.3, E.5, E.32, E.33, E.47): docked, the quiet transcript's `↗` rows and
// receipts and the one-row live area; in fallback (Cockpit on, no pane docked), the same quiet transcript with a
// capsule per stretch of work and a row per failure, and the whole live area (fallback/).
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { Receipt, RosterAgent } from '../../types'
import { remember } from '../shared/held'
import type { Part } from '../shared/parts'
import type { Ui } from '../shared/rule'
import { drawRow, drawRows } from './draw'
import { pinFromCommand } from './keys/view'
import { readFrame, readLog, readReceipts, readRoster } from './log'
import { readWork } from './work'
import { stepLineOf, stepsAllLines } from './copy'
import { beforeStart, docked, seated, setDockedFlag, shownAtTurn } from './mode'
import { FAILURE_ROWS } from './steps/log'
import { insteadRows, moreRow, refusalRows } from './v8/events'
import { failureCard, receiptRow, slashOutputRow, slashRow, stepsAllRows, workedRow } from './v8/left'
import { liveArea } from './v8/live'
import { receiptCounts } from './v8/receipt'
import { shipEventRows } from './v8/ships'
import { spineOnly, textCells } from '../shared/look/spine'
import { drawAgentFailure, drawBlockCapsule, drawFallbackCalls, footerCapsule } from './fallback/draw'

import { readFlow, isNarrationAt } from '../shared/flow'
import { turnOfCall, turnView } from './fallback/facts'
import { isKeptNarration, keptRecords, storedReceiptList } from './history/store'
import { isOn } from './switch'
import { noteUnfolded, unfolded } from './unfolded'
import { noticeRow, sentenceRows } from './v8/events'
import { stepLineRow } from './v8/left'
import { diffCard } from '../shared/look/code'
import { clockTime } from '../shared/look/format'

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

/** The width from which the seat docks a pane nobody asked for (amendment 5): what a resumed row guesses before it. */
const SEAT_MIN = 144

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
    // A resumed transcript is drawn before the session starts and the pane is seated (amendment 8): it takes the mode
    // the seat will give, docked from 144 columns in fullscreen, so it does not draw once in fallback first.
    if (beforeStart()) resumedRows.add(row)
    if (resumedRows.has(row) && !seated() && isOn()) return (site.viewport?.columns ?? 0) >= SEAT_MIN ? 'docked' : 'fallback'

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
 * The v8 text column's width for a transcript row (6.1): 86 beside the pane and wide, 78 with no pane under 110.
 * @param row the row's render
 * @returns the cells
 */
// In ctrl+o the engine hides the pane (correction D): the row is as wide as the terminal, narrow below 110 like fallback's.
export const leftCells = (row: RowSite): number => textCells(row.viewport?.columns, !isFallbackRow(row) && !(isOn() && unfolded()))

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
 * The receipts rows draw from: the state's, or, until the session's start has brought them there (a resumed
 * transcript is drawn first, amendment 8, and again while the start restores history), the store's, so a resumed
 * answer draws its receipt and its `claude` on its first draw.
 * @param $ the engine interface
 * @returns the receipts, oldest first
 */
async function receiptsNow($: EngineInterface): Promise<Receipt[]> {
  const live = await readReceipts($)

  return live.length > 0 ? live : storedReceiptList($)
}

/**
 * Sets whether the pane is docked. Rows already drawn keep their mode; the live rows follow at once.
 * @param $ the engine interface
 * @param value whether it is
 */
export function setDocked($: EngineInterface, value: boolean): void {
  if (!setDockedFlag(value)) return

  $.ui.log(`cockpit: left ${value ? 'docked' : 'fallback'}`, { to: 'debug' })
  $.ui.invalidate('ui.render')
}

/**
 * Every agent this session launched that Cockpit still knows of: the live roster's, then each kept turn's (the store's
 * for rows drawn before the session starts, amendment 8), so a resumed agent's rows are known as its (amendment 9).
 * @param $ the engine interface
 * @returns the agents, the live roster's first
 */
export async function keptAgents($: EngineInterface): Promise<RosterAgent[]> {
  return [...(await readRoster($)), ...(await keptRecords($)).flatMap(r => r.roster)]
}

/**
 * Whether a text row is narration a kept turn recorded (amendment 10): a resumed transcript has no flow to tell.
 * @param $ the engine interface
 * @param row the row's id
 * @returns whether it is
 */
export async function isNarrationRow($: EngineInterface, row: string): Promise<boolean> {
  return isOn() && isKeptNarration($, row)
}

/**
 * Notes what a site says of the view (its `isExpanded`): the ctrl+o view, or not (E.4).
 * @param $ the engine interface
 * @param isExpanded the site's prop, undefined where it says nothing
 */
export function noteView($: EngineInterface, isExpanded: boolean | undefined): void {
  if (isOn()) noteUnfolded($, isExpanded)
}

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
  // A diff in place under an edit (screen 30); a command's output stays in the pane's step drawer.
  const below = detail !== undefined && detail.patch.length > 0 ? diffCard(detail.patch, step.subject, width) : []
  const line = stepLineOf(step, detail?.ms ?? undefined)

  return <ui.Box flexDirection="column">{drawRows(ui, [stepLineRow(line, width), ...below])}</ui.Box>
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
  const ui = $.ui.resolve(e)

  // A resumed transcript has no flow: a sentence history kept as narration draws without its clock.
  if (f === undefined && (await isKeptNarration($, e.requestId))) {
    return <ui.Box flexDirection="column">{drawRows(ui, sentenceRows('', e.props.text.trim(), width))}</ui.Box>
  }

  if (f === undefined || f.turn === null || !isNarrationAt(flow, at)) return undefined

  const view = await turnView($, f.turn)
  const next = flow.slice(at + 1).find(g => g.turn === f.turn && g.kind === 'tool')
  const startAt = next === undefined ? undefined : view?.startOf(next.key)
  const clock = startAt === undefined || view?.startedAt === null || view?.startedAt === undefined ? '' : clockTime(view.startedAt + startAt)

  return <ui.Box flexDirection="column">{drawRows(ui, sentenceRows(clock, e.props.text.trim(), width))}</ui.Box>
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
  const rows = [
    ...shipEventRows(
      calls,
      id => steps.find(s => s.id === id)?.clock,
      width,
      id => steps.find(s => s.id === id)?.commit
    ),
    ...insteadRows(steps, [p.tool_use_id], width),
    ...refusalRows(steps, [p.tool_use_id], width)
  ]

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
  const receipt = (await receiptsNow($)).findLast(r => r.answer === '' && r.lastCall !== undefined && ids.includes(r.lastCall))
  const turn = receipt?.turn

  if (receipt === undefined || turn === null || turn === undefined) return undefined

  if (receipt.state === 'interrupted') return undefined

  // A turn with no answer text gets one worked node (7.13): its last stretch's in fallback, the whole turn's docked.
  const worked = isFallbackNow ? await footerCapsule($, turn, width) : workedRow(receiptCounts(receipt), width)
  const rows = receiptRowsOf(receipt, width, isFallbackNow)

  return receiptTree($, ui, receipt.turnNo, turn, [...(worked === undefined ? [] : [worked]), ...rows.slice(0, -1)], rows.at(-1) ?? [])
}

/**
 * A receipt's rows (7.8, 7.12): the spine's blank row; docked, the failure card for what still fails and a blank row;
 * then the receipt. In fallback each failure drew its own row when it settled (13.1), so no card repeats them.
 * @param r the receipt
 * @param width the text column's cells
 * @param isFallbackNow whether the row draws in fallback
 * @returns the rows, the receipt last
 */
function receiptRowsOf(r: Receipt, width: number, isFallbackNow: boolean): Part[][] {
  // A result that only repeats its subject (`exit 3`) is said once.
  const open = r.open.map(f => ({ where: `${f.kind} ${f.subject}`, said: f.result === f.subject ? '' : f.result }))
  const card = isFallbackNow || open.length === 0 ? [] : [...failureCard(open.length, '', open, '', r.turnNo, width), spineOnly()]
  // In fallback the first three failure keys drew their rows as they settled; the rest are counted here, once.
  // shortcut: counted per receipt (engine turn) while rows are capped per typed turn; they differ only for a typed
  // turn an agent's report split, where a few failures may draw neither a row nor a count. Upgrade if one is seen.
  const more = isFallbackNow && r.failures > FAILURE_ROWS ? [moreRow(r.failures - FAILURE_ROWS, r.turnNo)] : []

  return [spineOnly(), ...more, ...card, receiptRow(receiptCounts(r), width)]
}

/**
 * A receipt's tree: the rows above it, the rows above it, then the receipt itself as a Button: a click pins its turn
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
    <Box flexDirection="column">
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
  const rows = [
    ...shipEventRows(e.props.calls, clockOf, width, id => steps.find(s => s.id === id)?.commit),
    ...insteadRows(steps, ids, width),
    ...refusalRows(steps, ids, width)
  ]

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
  const receipt = (await receiptsNow($)).findLast(r => r.turn === turn)
  const rows = receipt === undefined || receipt.state === 'interrupted' ? [] : receiptRowsOf(receipt, width, isFallbackRow(e))

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
  return (await receiptsNow($)).some(r => r.answer === row && r.turn !== null)
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
  const list = await receiptsNow($)
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

  const isFallbackNow = isFallback()

  if (!isFallbackNow && !isQuiet()) return undefined

  const now = await $.clock.now()
  const ui = $.ui.resolve(e)
  const rows = liveArea(
    await readLog($),
    await readRoster($),
    (await readWork($)).todo,
    now,
    await readFrame($),
    e.viewport.columns,
    isFallbackNow,
    e.props.message
  )

  return <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>
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

// When each command's output row first drew (7.15: its clock labels its `/` node). shortcut: kept in the module, so a
// reload draws a command again with the reload's time; fine, the clock is a label, not a record.
const commandClocks = new Map<string, number>()

/** Output that says the command could not do what was asked (7.15: `×`). */
const REFUSED = /^(?:There is no|no |Not copied|nothing|turn \d+ had no|\S+ takes a)/i

/**
 * A slash command's output while Cockpit is on (7.15): the command as a `/` node with its clock, then one quiet row,
 * `✓` or `×`; `/steps n all` prints the turn's step rows. Undefined for a command Cockpit leaves to the engine (an
 * output of several lines it did not write).
 * @param $ the engine interface
 * @param e the output's render
 * @returns the rows' tree, or undefined
 */
export async function drawCommandOutput($: EngineInterface, e: RenderInput<'CommandOutput', 'terminal'>): Promise<RenderElement | undefined> {
  if (!isOn()) return undefined

  const p = e.props
  const text = p.text.trim()
  const words = p.args.trim().split(/\s+/)
  const isStepsAll = p.command === 'steps' && words.at(-1) === 'all'

  if (!isStepsAll && text.includes('\n')) return undefined

  const at = commandClocks.get(e.requestId) ?? (await $.clock.now())

  remember(commandClocks, e.requestId, at, ROWS_MAX)

  const ui = $.ui.resolve(e)
  const clock = clockTime(at)
  const command = `/${p.command}${p.args.trim().length > 0 ? ` ${p.args.trim()}` : ''}`

  if (isStepsAll) {
    const n = words.length > 1 ? Number(words[0]) : (await readLog($)).turnNo
    const lines = Number.isInteger(n) && n >= 1 ? await stepsAllLines($, n) : undefined

    if (lines !== undefined && lines.total > 0) {
      return <ui.Box flexDirection="column">{drawRows(ui, [...stepsAllRows(clock, n, lines.total, lines.shown), spineOnly()])}</ui.Box>
    }
  }

  const isOk = !p.isErrored && !REFUSED.test(text)

  return <ui.Box flexDirection="column">{drawRows(ui, [slashRow(clock, command), slashOutputRow(isOk, text), spineOnly()])}</ui.Box>
}

/**
 * A notice from the engine while Cockpit is on (7.10, 13.3): grey and one line on the spine, `●` with its clock.
 * @param $ the engine interface
 * @param e the notice's render
 * @returns the row's tree, or undefined while Cockpit is off
 */
export async function drawNotice($: EngineInterface, e: RenderInput<'InfoNotice', 'terminal'>): Promise<RenderElement | undefined> {
  if (!isOn()) return undefined

  const ui = $.ui.resolve(e)
  const at = commandClocks.get(e.requestId) ?? (await $.clock.now())

  remember(commandClocks, e.requestId, at, ROWS_MAX)

  const text = [e.props.text.replace(/\s+/g, ' ').trim(), ...(e.props.command ? [e.props.command] : [])].join(' · ')
  const isWarning = /context|compact/i.test(text) && /%/.test(text)

  return (
    <ui.Box flexDirection="column">
      {drawRows(ui, [noticeRow(isWarning ? 'warning' : 'notice', text, leftCells(e), isWarning ? '' : clockTime(at)), spineOnly()])}
    </ui.Box>
  )
}

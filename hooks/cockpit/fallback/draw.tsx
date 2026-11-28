// Fallback's part of the left (spec E.3, E.5, E.13, E.33): Cockpit on and no pane docked. Steps leave the
// transcript as they do docked, but with no pane to show them a stretch of work closes in one capsule row, a
// failure draws its row at once, and the live area above the prompt is the whole of it. left.tsx routes each site
// here; these draw. Every row is worked out from the turn's own data at each draw (amendment 10, facts.ts), so a row
// drawn again after a resize, a resume or a reload draws the same.
import { insteadRows, moreRow, refusalRows } from '../rows/events'
import type { EngineInterface, RenderElement } from 'claude-code'

import type { Part } from '../../shared/parts'
import type { Ui } from '../../shared/rule'
import { flowNow } from '../../shared/flow'
import { drawRows } from '../draw'
import { keptRecords } from '../history/store'
import { readLog, readRoster } from '../log'
import type { GroupCall } from '../quiet'
import { workedCounts } from '../rows/receipt'
import { workedRow } from '../rows/left'
import { shipEventRows } from '../rows/ships'
import type { Capsule } from './capsule'
import { isShownFailure } from '../steps/log'
import { failureOf, failureRows } from './events'
import type { Failure } from './events'
import { turnOfCall, turnView } from './facts'
import type { TurnView } from './facts'
import { callAnchor, footerAnchor, isAfterEventAt, textAnchor } from './plan'

/**
 * A capsule as the worked node (7.13), with the failure keys of its stretch that drew no row counted directly above
 * it: `+ n more · /steps n`, under the turn's failure rows and before the answer (13.1).
 */
const capsuleRows = (c: Capsule, width: number, turnNo: number): Part[][] => [
  ...(c.unshown > 0 ? [moreRow(c.unshown, turnNo)] : []),
  workedRow(workedCounts(c), width)
]

/**
 * A call's failure row, from its settled step and its kept output: the same at every draw, and never taken back by a
 * later fix (E.5), since a settled step and its output do not change.
 * @param view the call's typed turn
 * @param id the call's id
 * @returns the failure, or undefined (none, or not settled yet)
 */
function failureFor(view: TurnView, id: string): Failure | undefined {
  const at = view.steps.findIndex(s => s.id === id || s.calls?.includes(id) === true)
  const step = view.steps[at]

  // A key that failed before, or a fourth key: the receipt's `+ n more` row stands for it (13.1).
  if (step === undefined || step.isRunning || !isShownFailure(view.steps, at)) return undefined

  const detail = view.details.find(d => d.id === id)

  // Its output not kept yet (the step's end is still being written): drawn on the next draw, with it.
  if (detail?.ms === null) return undefined

  return failureOf(step, detail?.excerpt ?? [])
}

/**
 * The fallback rows of a call's site (`ToolGroup`, or a standalone `ToolUse`): the capsule of the stretch before it
 * when it started after five silent minutes (E.3 case 2), then for each call its `↗` rows and its failure row with
 * its detail.
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param calls the site's calls
 * @param width the transcript rule's width
 * @returns the rows' tree (an empty Box draws nothing)
 */
export async function drawFallbackCalls($: EngineInterface, ui: Pick<Ui, 'Box' | 'Text'>, calls: readonly GroupCall[], width: number): Promise<RenderElement> {
  const ids = calls.flatMap(c => (c.tool_use_id === undefined ? [] : [c.tool_use_id]))
  // As last written (	urnView says why): the log the view reads redraws the row.
  const flow = await flowNow($)
  const turn = (await Promise.all(ids.map(async id => turnOfCall($, flow, id)))).find(t => t !== undefined)
  if (turn === undefined) return <ui.Box />

  const view = await turnView($, turn)

  if (view === undefined) return <ui.Box />

  const capsule = ids.map(id => view.plan.capsules.get(callAnchor(id))).find(c => c !== undefined)
  const clockOf = (id: string) => view.steps.find(s => s.id === id || s.calls?.includes(id) === true)?.clock
  const rows = calls.flatMap(c => {
    const failure = c.tool_use_id === undefined ? undefined : failureFor(view, c.tool_use_id)

    const ms = c.tool_use_id === undefined ? undefined : (view.details.find(d => d.id === c.tool_use_id)?.ms ?? undefined)

    const id = c.tool_use_id === undefined ? [] : [c.tool_use_id]

    // The same event rows as docked (a mode switch keeps them): what Claude did instead, `↗`, ⊘ and ▍, the failure.
    return [
      ...insteadRows(view.steps, id, width),
      ...shipEventRows([c], clockOf, width, k => view.steps.find(s => s.id === k)?.commit),
      ...refusalRows(view.steps, id, width),
      ...(failure === undefined ? [] : failureRows(failure, width, ms))
    ]
  })
  const all = [...(capsule === undefined ? [] : capsuleRows(capsule, width, view.turnNo)), ...rows]

  if (all.length === 0) return <ui.Box />

  // C.2: one blank row above the first event row after a prompt or a block of text; none between event rows.
  // A call not stored yet is the newest row of its turn.
  const stored = flow.findLastIndex(f => f.kind === 'tool' && f.key === ids[0])
  const top = isAfterEventAt(flow, stored >= 0 ? stored : flow.length, turn, view.plan) ? 0 : 1

  return (
    <ui.Box flexDirection="column" marginTop={top}>
      {drawRows(ui, all)}
    </ui.Box>
  )
}

/**
 * The capsule that opens a block of Claude's text that stays (E.3 case 1): the stretch since the turn's last capsule.
 * A block whose turn Cockpit kept nothing of (a transcript from before Cockpit was on) draws none.
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param key the block's key in the flow
 * @param turn the engine turn the block belongs to, if known
 * @param width the transcript rule's width
 * @returns the capsule's row, and whether it comes right after an event row (C.2: then no blank row above it)
 */
export async function drawBlockCapsule(
  $: EngineInterface,
  ui: Pick<Ui, 'Box' | 'Text'>,
  key: string | undefined,
  turn: string | null | undefined,
  width: number
): Promise<{ capsule: RenderElement | undefined; isAfterEvent: boolean }> {
  if (turn === undefined || turn === null || key === undefined) return { capsule: undefined, isAfterEvent: false }

  const view = await turnView($, turn)
  const capsule = view?.plan.capsules.get(textAnchor(key))

  if (view === undefined || capsule === undefined) return { capsule: undefined, isAfterEvent: false }

  const at = view.flow.findLastIndex(f => f.kind === 'text' && f.key === key)

  return {
    capsule: <ui.Box flexDirection="column">{drawRows(ui, capsuleRows(capsule, width, view.turnNo))}</ui.Box>,
    isAfterEvent: at >= 0 && isAfterEventAt(view.flow, at, turn, view.plan)
  }
}

/**
 * The capsule a footer draws above a turn's receipt when the turn wrote no text (E.3 case 3).
 * @param $ the engine interface
 * @param turn the engine turn it closes
 * @param width the transcript rule's width
 * @returns the capsule's rows (its `+ n more` row first when it has one); none without a capsule
 */
export async function footerCapsule($: EngineInterface, turn: string, width: number): Promise<Part[][]> {
  const view = await turnView($, turn)
  const capsule = view?.plan.capsules.get(footerAnchor(turn))

  return view === undefined || capsule === undefined ? [] : capsuleRows(capsule, width, view.turnNo)
}

/**
 * A failed agent's row, drawn from its notice (E.13): `✕ failed · agent <name> · <reason>`, on the turn clock when it
 * ended, from the roster of its turn (the live one, or history's).
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param task the notice's agent: its id and the call that launched it
 * @param width the transcript rule's width
 * @returns the row, or undefined when the agent did not fail (or has not reported yet)
 */
export async function drawAgentFailure(
  $: EngineInterface,
  ui: Pick<Ui, 'Box' | 'Text'>,
  task: { id?: string | undefined; toolUseId?: string | undefined },
  width: number
): Promise<RenderElement | undefined> {
  const isIt = (a: { id: string; call: string }) => a.id === task.id || (task.toolUseId !== undefined && a.call === task.toolUseId)
  const live = (await readRoster($)).find(isIt)
  const record = live === undefined ? (await keptRecords($)).find(r => r.roster.some(isIt)) : undefined
  const agent = live ?? record?.roster.find(isIt)

  if (agent === undefined || agent.state !== 'failed') return undefined

  const startedAt = record?.startedAt ?? (await readLog($)).startedAt ?? agent.startedAt
  const failure: Failure = { kind: 'agent', subject: agent.name, result: agent.subject, clock: (agent.endedAt ?? agent.startedAt) - startedAt, lines: [] }

  return (
    <ui.Box flexDirection="column" marginTop={1}>
      {drawRows(ui, failureRows(failure, width))}
    </ui.Box>
  )
}

// Fallback's part of the left (spec E.3, E.5, E.13, E.33): Cockpit on and no pane docked. Steps leave the
// transcript as they do docked, but with no pane to show them a stretch of work closes in one capsule row, a
// failure draws its row at once, and the live area above the prompt is the whole of it. left.tsx routes each site
// here; these draw.
import type { EngineInterface, RenderElement } from 'claude-code'

import type { LogStep } from '../../../types'
import type { Ui } from '../../shared/rule'
import { readDetails } from '../keys/details'
import { drawRows } from '../draw'
import { readFrame, readLog, readRoster } from '../log'
import { shipRows } from '../quiet'
import type { GroupCall } from '../quiet'
import { readWork } from '../work'
import { capsuleRow } from './capsule'
import { failureOf, failureRows } from './events'
import type { Failure } from './events'
import { liveRows } from './live'
import { heldCapsule, heldFailure, holdFailure, holdNoCapsule, isAfterEvent, isSilent, noteRow, takeStretch } from './stretch'

/** The engine's mark at the end of the live band (`[-]`, types) and a cell of gap before it. */
const BAND_MARK = 6

const stepOfCall = (steps: readonly LogStep[], id: string) => steps.find(s => s.id === id || s.calls?.includes(id) === true)

/**
 * A call's failure row, decided when its step settles and kept: a later fix never takes it back (E.5).
 * @param $ the engine interface
 * @param id the call's id
 * @returns the failure, or undefined (none, or not settled yet)
 */
async function failureFor($: EngineInterface, id: string): Promise<Failure | undefined> {
  const held = heldFailure(id)

  if (held !== undefined) return held ?? undefined

  const log = await readLog($)
  const step = stepOfCall(log.steps, id)

  // Not in this turn's log (yet, or any more): nothing to decide now.
  if (step === undefined || step.isRunning) return undefined

  const detail = (await readDetails($)).find(d => d.id === id)

  // Its output not kept yet (the step's end is still being written): decided on the next draw, with it.
  if (detail?.ms === null) return undefined

  const failure = failureOf(step, detail?.excerpt ?? []) ?? null

  holdFailure(id, failure)

  if (failure !== null) noteRow(log, await $.clock.now())

  return failure ?? undefined
}

/**
 * The fallback rows of a call's site (`ToolGroup`, or a standalone `ToolUse`): a capsule first when the left has
 * been silent for five minutes (E.3 case 2, decided at the site's first draw), then for each call its `↗` rows and
 * its failure row with its detail.
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param row the site's request
 * @param calls the site's calls
 * @param width the transcript rule's width
 * @returns the rows' tree (an empty Box draws nothing)
 */
export async function drawFallbackCalls(
  $: EngineInterface,
  ui: Pick<Ui, 'Box' | 'Text'>,
  row: string,
  calls: readonly GroupCall[],
  width: number
): Promise<RenderElement> {
  const log = await readLog($)
  const now = await $.clock.now()
  let capsule = heldCapsule(row)

  if (capsule === undefined) {
    const first = calls[0]?.tool_use_id
    const at = first === undefined ? -1 : log.steps.findIndex(s => s.id === first)
    // The stretch so far: every step before this site's own calls.
    const until = at < 0 ? log.dropped + log.steps.length : log.dropped + at

    if (isSilent(log, now)) capsule = takeStretch(row, log, now, until)
    else holdNoCapsule(row)
  }

  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
  const clockOf = (id: string) => stepOfCall(steps, id)?.clock
  const failures = await Promise.all(calls.map(async c => (c.tool_use_id === undefined ? undefined : failureFor($, c.tool_use_id))))
  const rows = calls.flatMap((c, i) => {
    const failure = failures[i]

    return [...shipRows([c], clockOf, width), ...(failure === undefined ? [] : failureRows(failure, width))]
  })

  const all = [...(capsule === null || capsule === undefined ? [] : [capsuleRow(capsule, width)]), ...rows]

  if (all.length === 0) return <ui.Box />

  // C.2: one blank row above the first event row after a prompt or a block of text; none between event rows.
  const top = isAfterEvent(row, log.turnNo, 'event') ? 0 : 1

  return (
    <ui.Box flexDirection="column" marginTop={top}>
      {drawRows(ui, all)}
    </ui.Box>
  )
}

/**
 * The capsule that opens a block of Claude's text that stays (E.3 case 1): the stretch since the turn's last
 * capsule, decided at the block's first visible draw, when every step before it has finished. A block of another
 * turn than the log's (a resumed transcript, a row drawn again after a reload) draws none.
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param row the block's request
 * @param turn the engine turn the block belongs to, if known
 * @param width the transcript rule's width
 * @returns the capsule's row, and whether it comes right after an event row (C.2: then no blank row above it)
 */
export async function drawBlockCapsule(
  $: EngineInterface,
  ui: Pick<Ui, 'Text'>,
  row: string,
  turn: string | null | undefined,
  width: number
): Promise<{ capsule: RenderElement | undefined; isAfterEvent: boolean }> {
  const log = await readLog($)
  let capsule = heldCapsule(row)

  if (capsule === undefined) {
    if (turn === undefined || turn === null || turn !== log.turn) holdNoCapsule(row)
    else capsule = takeStretch(row, log, await $.clock.now())
  }

  const drawn = capsule === null || capsule === undefined ? undefined : drawRows(ui, [capsuleRow(capsule, width)])[0]
  const after = isAfterEvent(row, log.turnNo, 'other')

  return { capsule: drawn, isAfterEvent: drawn !== undefined && after }
}

/**
 * The capsule a footer draws above a turn's receipt when the turn wrote no text (E.3 case 3).
 * @param $ the engine interface
 * @param row the footer's request
 * @param turn the engine turn it closes
 * @param width the transcript rule's width
 * @returns the capsule's parts, or undefined
 */
export async function footerCapsule($: EngineInterface, row: string, turn: string, width: number): Promise<ReturnType<typeof capsuleRow> | undefined> {
  let capsule = heldCapsule(row)

  if (capsule === undefined) {
    const log = await readLog($)

    if (turn !== log.turn) holdNoCapsule(row)
    else capsule = takeStretch(row, log, await $.clock.now())
  }

  return capsule === null || capsule === undefined ? undefined : capsuleRow(capsule, width)
}

/**
 * A failed agent's row, drawn at once from its notice (E.13): `✕ failed · agent <name> · <reason>`, on the turn
 * clock when it ended.
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param row the notice's request
 * @param task the notice's agent: its id and the call that launched it
 * @param width the transcript rule's width
 * @returns the row, or undefined when the agent did not fail
 */
export async function drawAgentFailure(
  $: EngineInterface,
  ui: Pick<Ui, 'Box' | 'Text'>,
  row: string,
  task: { id?: string | undefined; toolUseId?: string | undefined },
  width: number
): Promise<RenderElement | undefined> {
  let failure = heldFailure(`agent:${row}`)

  if (failure === undefined) {
    const agent = (await readRoster($)).find(a => a.id === task.id || (task.toolUseId !== undefined && a.call === task.toolUseId))

    // Not settled in the roster yet: decided when its report comes.
    if (agent === undefined || agent.state === 'running') return undefined

    const log = await readLog($)
    const ended = agent.endedAt ?? agent.startedAt
    failure =
      agent.state === 'failed'
        ? { kind: 'agent', subject: agent.name, result: agent.subject, clock: ended - (log.startedAt ?? agent.startedAt), lines: [] }
        : null
    holdFailure(`agent:${row}`, failure)
  }

  if (failure === null) return undefined

  const top = isAfterEvent(`agent:${row}`, (await readLog($)).turnNo, 'event') ? 0 : 1

  return (
    <ui.Box flexDirection="column" marginTop={top}>
      {drawRows(ui, failureRows(failure, width))}
    </ui.Box>
  )
}

/**
 * The live area in fallback (E.33): the now-row, the roster and the to-do in progress, across the band.
 * @param $ the engine interface
 * @param ui the surface's elements
 * @param columns the terminal's columns
 * @returns the band's tree
 */
export async function drawFallbackLive($: EngineInterface, ui: Pick<Ui, 'Box' | 'Text'>, columns: number): Promise<RenderElement> {
  const now = await $.clock.now()
  const rows = liveRows(await readLog($), await readRoster($), (await readWork($)).todo, now, await readFrame($), columns - BAND_MARK)

  return <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>
}

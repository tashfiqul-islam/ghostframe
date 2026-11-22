// A typed turn's facts for fallback's rows, read from Cockpit's state each time a row draws (amendment 10): the live
// typed turn from the step log, an earlier one from history. Whichever mode the row is drawn in, and however often,
// it reads the same facts, so it draws the same rows.
import type { EngineInterface } from 'claude-code'

import type { FlowStamp, LogStep, Receipt, StepDetail } from '../../../types'
import { readFlow } from '../../shared/flow'
import { readHistory } from '../history/store'
import { readDetails } from '../keys/details'
import { readLog, readReceipts } from '../log'
import { planTurn } from './plan'
import type { Plan } from './plan'

/** A typed turn as fallback reads it: its number, steps, receipts, the session's flow, and its capsule plan. */
export type TurnView = {
  turnNo: number
  steps: readonly LogStep[]
  details: readonly StepDetail[]
  receipts: readonly Receipt[]
  flow: readonly FlowStamp[]
  plan: Plan
  /** The typed turn's start (wall clock), null when unknown. */
  startedAt: number | null
  /** A step's start on the turn clock (ms), when its detail is kept. */
  startOf: (id: string) => number | undefined
}

/**
 * The typed turn an engine turn belongs to, with its facts and plan; undefined when Cockpit kept nothing of it.
 * @param $ the engine interface
 * @param turn the engine turn
 * @returns the turn's view
 */
export async function turnView($: EngineInterface, turn: string): Promise<TurnView | undefined> {
  const log = await readLog($)
  const receipts = await readReceipts($)
  const flow = await readFlow($)
  const own = receipts.find(r => r.turn === turn)
  const isLive = log.turn === turn || own?.turnNo === log.turnNo
  const record = isLive ? undefined : (await readHistory($)).find(r => r.turns.includes(turn) || r.turnNo === own?.turnNo)

  if (!isLive && record === undefined) return undefined

  const turnNo = isLive ? log.turnNo : (record?.turnNo ?? 0)
  const mine = receipts.filter(r => r.turnNo === turnNo)
  const turns = [
    ...new Set([...(record?.turns ?? []), ...mine.flatMap(r => (r.turn === null ? [] : [r.turn])), ...(isLive && log.turn !== null ? [log.turn] : [])])
  ]
  const steps = isLive ? log.steps : (record?.steps ?? [])
  const startedAt = isLive ? log.startedAt : (record?.startedAt ?? null)
  const kept = await readDetails($)
  const details = [...kept, ...(record?.details ?? []).filter(d => !kept.some(k => k.id === d.id))]
  const startOf = (id: string) => {
    const d = details.find(x => x.id === id)

    return d === undefined || startedAt === null ? undefined : d.startAt - startedAt
  }
  const silentTurns = new Set(mine.flatMap(r => (r.answer === '' && r.turn !== null && r.state !== 'interrupted' ? [r.turn] : [])))

  return { turnNo, steps, details, receipts: mine, flow, startedAt, startOf, plan: planTurn(flow, { turns, steps, startOf, silentTurns }) }
}

/**
 * The engine turn a call was made in: from the flow, or, for a call the engine raised before its message was stored,
 * the live turn when its log has the call.
 * @param $ the engine interface
 * @param flow the session's flow
 * @param id the call's id
 * @returns the turn, or undefined when neither has it
 */
export async function turnOfCall($: EngineInterface, flow: readonly FlowStamp[], id: string): Promise<string | undefined> {
  const f = flow.findLast(x => x.kind === 'tool' && x.key === id)

  if (f?.turn !== undefined && f.turn !== null) return f.turn

  const log = await readLog($)

  return log.steps.some(s => s.id === id || s.calls?.includes(id) === true) ? (log.turn ?? undefined) : undefined
}

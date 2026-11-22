// Where each capsule's stretch of work ends, and what each fallback row decided at its first draw (spec E.3, E.5). A
// capsule closes the stretch since the turn's last one; a row keeps what it first drew, so a resize or a scroll
// draws it again unchanged. Written while drawing: the engine raises rows in transcript order, and a row is decided
// once, the first time it draws.
// shortcut: kept in the module, so a reload forgets them; rows drawn again after one draw no capsule and no
// failure row (they are no longer known to be this turn's). Move them to $.state if that shows.
import type { StepLog } from '../../../types'
import { remember } from '../../shared/held'
import { capsuleOf } from './capsule'
import type { Capsule } from './capsule'
import type { Failure } from './events'

/** Five minutes with no new row on the left and a step ends: that step's row draws a capsule (E.3 case 2). */
export const SILENT_MS: number = 5 * 60_000

const ROWS_MAX = 2_000
const TURNS_MAX = 200

/** A typed turn's stretch: the step its next capsule starts at (counting dropped steps), and when a row last drew. */
type Cut = { upTo: number; at: number; capsules: number }

const cuts = new Map<number, Cut>()
const capsules = new Map<string, Capsule | null>()
const failures = new Map<string, Failure | null>()
const claims = new Map<string, string | null>()
// What the left last drew in each typed turn (an event row, or anything else), and whether each row came right
// after an event row: C.2 puts no blank row between event rows and a capsule, and one after anything else.
const lastKinds = new Map<number, 'event' | 'other'>()
const afterEvents = new Map<string, boolean>()

const cutOf = (log: StepLog, now: number): Cut => cuts.get(log.turnNo) ?? { upTo: 0, at: log.startedAt ?? now, capsules: 0 }

/**
 * The capsule a row drew at its first draw, if it was decided already.
 * @param row the row's request
 * @returns the capsule, null for none, undefined when not yet decided
 */
export const heldCapsule = (row: string): Capsule | null | undefined => capsules.get(row)

/**
 * Decides a row's capsule, once: the steps since the turn's last capsule, up to `until` (all of them by default).
 * A stretch of no steps draws none. The next capsule starts where this one ends.
 * @param row the row's request
 * @param log the typed turn's log
 * @param now the wall clock in ms
 * @param until one past the stretch's last step, counting dropped steps
 * @returns the capsule, or null
 */
export function takeStretch(row: string, log: StepLog, now: number, until: number = log.dropped + log.steps.length): Capsule | null {
  const held = capsules.get(row)

  if (held !== undefined) return held

  const cut = cutOf(log, now)
  const capsule = capsuleOf(log.steps, cut.upTo - log.dropped, until - log.dropped) ?? null

  remember(capsules, row, capsule, ROWS_MAX)

  if (capsule !== null) remember(cuts, log.turnNo, { upTo: until, at: now, capsules: cut.capsules + 1 }, TURNS_MAX)

  return capsule
}

/**
 * Decides that a row carries no capsule.
 * @param row the row's request
 */
export function holdNoCapsule(row: string): void {
  if (!capsules.has(row)) remember(capsules, row, null, ROWS_MAX)
}

/**
 * A row appeared on the left in this turn (a failure, a push): the five minutes of silence start again.
 * @param log the typed turn's log
 * @param now the wall clock in ms
 */
export function noteRow(log: StepLog, now: number): void {
  remember(cuts, log.turnNo, { ...cutOf(log, now), at: now }, TURNS_MAX)
}

/**
 * Whether the left has been silent for five minutes in the running turn (E.3 case 2).
 * @param log the typed turn's log
 * @param now the wall clock in ms
 * @returns whether it has
 */
export const isSilent = (log: StepLog, now: number): boolean => log.isTurnRunning && now - cutOf(log, now).at >= SILENT_MS

/**
 * How many capsules a typed turn drew: its receipt gives the total of steps when it drew more than one (E.32).
 * @param turnNo the typed turn's number
 * @returns the count
 */
export const capsulesIn = (turnNo: number): number => cuts.get(turnNo)?.capsules ?? 0

/**
 * A call's failure row, as it was decided when its step settled.
 * @param id the call's id
 * @returns the failure, null for none, undefined while its step has not settled
 */
export const heldFailure = (id: string): Failure | null | undefined => failures.get(id)

/**
 * Keeps a call's failure row (or that it has none) once its step settled.
 * @param id the call's id
 * @param failure the failure, or null
 */
export function holdFailure(id: string, failure: Failure | null): void {
  remember(failures, id, failure, ROWS_MAX)
}

/**
 * Whether a row comes right after an event row on the left, decided at its first draw and kept; the row becomes
 * what the left last drew.
 * @param row the row's request
 * @param turnNo the typed turn it is drawn in
 * @param kind what it is: an event row (a failure, a push) or anything else (a block of text)
 * @returns whether the row above it is an event row
 */
export function isAfterEvent(row: string, turnNo: number, kind: 'event' | 'other'): boolean {
  const held = afterEvents.get(row)

  if (held !== undefined) return held

  const after = lastKinds.get(turnNo) === 'event'

  remember(afterEvents, row, after, ROWS_MAX)
  remember(lastKinds, turnNo, kind, TURNS_MAX)

  return after
}

/**
 * The engine turn a footer closes, claimed at its first draw (E.3 case 3).
 * @param row the footer's request
 * @param turn the turn to claim when none is yet
 * @returns the claimed turn
 */
export function claimFooter(row: string, turn: string | null): string | null {
  const had = claims.get(row)

  if (had !== undefined) return had

  remember(claims, row, turn, ROWS_MAX)

  return turn
}

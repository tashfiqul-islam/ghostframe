// The turn rule while Cockpit is on (spec E.1, amendment 12): `─ [ TURN n ] ──── 09:23`, the first row of a typed
// prompt, its number the step log's. Pure: the prompt site draws what this returns.
import type { Part } from '../shared/parts'
import { fmtClock } from '../shared/time'
import { C } from '../shared/tokens'
import { vw } from '../shared/text'

/** What came right before a turn, named on its rule: a resume, a compaction, a rewind. */
export type TurnAfter = 'resume' | 'compact' | 'rewind'

const STATE: Record<TurnAfter, string> = { resume: 'RESUMED', compact: 'AFTER COMPACT', rewind: 'AFTER REWIND' }
// Below this many cells the clock may go (E.1, amendment 12); the label never does.
const CLOCK_MIN = 40

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dayOf = (ms: number) => new Date(ms).toDateString()

/**
 * The rule's clock: the 24-hour wall clock, with the day (`Thu 19 Nov · 09:02`) when it differs from the previous turn's.
 * @param at the prompt's submit time (ms)
 * @param prevAt the previous typed prompt's, if any
 * @returns the clock's text
 */
export function turnClock(at: number, prevAt: number | undefined): string {
  if (prevAt === undefined || dayOf(prevAt) === dayOf(at)) return fmtClock(at)

  const d = new Date(at)

  return `${DAYS[d.getDay()] ?? ''} ${d.getDate()} ${MONTHS[d.getMonth()] ?? ''} · ${fmtClock(at)}`
}

/**
 * The rule's row, exactly `width` cells when the label fits: `─`, the label from column 2, the fill, then the clock
 * ending on the last cell. A clock that leaves no fill, or a row under 40 cells, goes; the label stays whole.
 * @param turnNo the turn's number
 * @param after what came right before it
 * @param clock the clock's text, '' for none
 * @param width the receipt's width
 * @returns the row's parts
 */
export function turnRuleParts(turnNo: number, after: TurnAfter | undefined, clock: string, width: number): Part[] {
  const label: Part[] = [
    { t: '─ ', color: C.rule },
    { t: '[ ', color: C.dim },
    { t: `TURN ${turnNo}`, color: C.textBright },
    ...(after === undefined ? [] : [{ t: ` · ${STATE[after]}`, color: C.muted }]),
    { t: ' ]', color: C.dim }
  ]
  const used = label.reduce((n, p) => n + vw(p.t), 0)
  const withClock = clock.length > 0 && width >= CLOCK_MIN ? width - used - 2 - vw(clock) : 0

  if (withClock >= 1) return [...label, { t: ` ${'─'.repeat(withClock)} `, color: C.rule }, { t: clock, color: C.muted }]

  const fill = width - used - 1

  return fill < 1 ? label : [...label, { t: ` ${'─'.repeat(fill)}`, color: C.rule }]
}

// Cockpit v8's formats (spec section 5): clock times, the day, durations, counts and state words. One formatter each,
// used by every row that shows one.

const two = (n: number) => String(n).padStart(2, '0')

/**
 * A clock time (5.1): `HH:MM:SS`, 24-hour, local.
 * @param ms the wall clock
 * @returns 8 cells
 */
export function clockTime(ms: number): string {
  const d = new Date(ms)

  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/**
 * The ruler's end label (5.1): `HH:MM`, or `HH:MM:SS` when the turn is under two minutes.
 * @param ms the wall clock
 * @param spanMs the turn's length
 * @returns the label
 */
export function rulerTime(ms: number, spanMs: number): string {
  return spanMs < 120_000 ? clockTime(ms) : clockTime(ms).slice(0, 5)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * The day (5.1): its three-letter name when the local calendar day differs from the previous typed prompt's, else ''.
 * @param ms the prompt's submit time
 * @param prevMs the previous typed prompt's, if any
 * @returns `Tue`, or ''
 */
export function dayWord(ms: number, prevMs: number | undefined): string {
  if (prevMs === undefined || new Date(ms).toDateString() === new Date(prevMs).toDateString()) return ''

  return DAYS[new Date(ms).getDay()] ?? ''
}

/**
 * A duration (5.2): `<1s`, `6s`, `2m 44s`, `1m 06s`, `1h 02m`. No decimals anywhere.
 * @param ms the duration
 * @returns at most 7 cells; '' for a value that is not a duration
 */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1_000) return '<1s'

  const s = Math.floor(ms / 1_000)

  if (s < 60) return `${s}s`
  if (s < 3_600) return `${Math.floor(s / 60)}m ${two(s % 60)}s`

  return `${Math.floor(s / 3_600)}h ${two(Math.floor((s % 3_600) / 60))}m`
}

/**
 * A count joined to its noun (5.3): `1 step`, `2 steps`. A noun given with its plural (`['entry', 'entries']`) uses it.
 * @param n the count
 * @param noun the singular, or the singular and the plural
 * @returns the count
 */
export function count(n: number, noun: string | readonly [string, string]): string {
  const [one, many] = typeof noun === 'string' ? [noun, `${noun}s`] : noun

  return `${n} ${n === 1 ? one : many}`
}

/** `+12 −1`, `+12`, `−1` (5.3): the minus is U+2212; a zero side is left out. */
export function changeCount(adds: number, dels: number): string {
  return [...(adds > 0 ? [`+${adds}`] : []), ...(dels > 0 ? [`−${dels}`] : [])].join(' ')
}

/** A state word (5.5). */
export type StateWord = 'DONE' | 'FAILED' | 'LIVE' | 'NEEDS YOU' | 'WAITING' | 'BLOCKED' | 'DENIED' | 'INTERRUPTED' | 'QUEUED' | 'PLAN' | 'AGENT'

/**
 * The pane head's time range (5.1): `10:14:02 → 10:16:46`, `10:14:02 → now` while live, with the day before it when
 * the turn's day is not the previous prompt's.
 * @param start the turn's start
 * @param end its end, undefined while live
 * @param day the day word, '' for none
 * @returns the range
 */
export function timeRange(start: number, end: number | undefined, day = ''): string {
  return `${day.length > 0 ? `${day} ` : ''}${clockTime(start)} → ${end === undefined ? 'now' : clockTime(end)}`
}

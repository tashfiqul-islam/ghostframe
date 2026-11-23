// The braille trace (spec 7.3, 7.12) and the sparkline (8.2): a turn's activity, one cell per bucket.
import type { Part } from '../parts'
import { SPARK } from './glyphs'
import { TOKEN, TRACE_STEPS } from './palette'

// A level's cell, 0 to 6: rising (the cell before is lower or the same) and falling (the cell before is higher).
const RISING = '⣀⣠⣤⣴⣶⣾⣿'
const FALLING = '⣀⣄⣤⣦⣶⣷⣿'
/** The trace's top level. */
export const TRACE_TOP = 6

/**
 * The braille trace (7.3, 7.12): one cell per level, from 0 to 6, coloured by its level (section 2's trace steps).
 * @param levels each bucket's level
 * @returns one part per cell
 */
export function trace(levels: readonly number[]): Part[] {
  return levels.map((raw, i) => {
    const level = Math.max(0, Math.min(TRACE_TOP, Math.round(raw)))
    const isFalling = i > 0 && Math.round(levels[i - 1] ?? 0) > level

    return { t: (isFalling ? FALLING : RISING)[level] ?? '⣀', color: TRACE_STEPS[level] ?? TRACE_STEPS[0] }
  })
}

/** The thought row's trace (7.3): its shape is drawn the same for every thought, since only the duration is known. */
export const THOUGHT_LEVELS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 5, 3, 2, 4, 6, 5, 2, 0]

/**
 * Activity bucketed into levels: the counts in `buckets` cells, scaled so the busiest is the top level.
 * @param times each step's time into the turn
 * @param spanMs the turn's length
 * @param buckets how many cells
 * @param top the top level
 * @returns each cell's level
 */
export function levelsOf(times: readonly number[], spanMs: number, buckets: number, top: number = TRACE_TOP): number[] {
  if (buckets <= 0) return []

  const counts = Array.from({ length: buckets }, () => 0)

  for (const t of times) {
    const at = spanMs <= 0 ? 0 : Math.min(buckets - 1, Math.floor((t / spanMs) * buckets))
    counts[at] = (counts[at] ?? 0) + 1
  }

  const max = Math.max(1, ...counts)

  return counts.map(n => Math.round((n / max) * top))
}

/**
 * The sparkline (8.2): one cell per bucket, `machine`, a failed bucket in `err`.
 * @param levels each bucket's level, 0 to 7
 * @param failed the buckets that held a failure
 * @returns one part per cell
 */
export function sparkline(levels: readonly number[], failed: ReadonlySet<number> = new Set()): Part[] {
  return levels.map((l, i) => ({ t: SPARK[Math.max(0, Math.min(SPARK.length - 1, Math.round(l)))] ?? '▁', color: failed.has(i) ? TOKEN.err : TOKEN.machine }))
}

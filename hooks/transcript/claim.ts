// A drawn row's claim on one stamp (a prompt's submit, a turn's close), by the row's request: written while drawing.
import { remember } from '../shared/held'

// Rows each claim map remembers, oldest dropped first.
const CLAIMS_MAX = 500

/**
 * The stamp a row shows, claimed for it. A row keeps the stamp it claimed while that still fits; a first draw
 * takes the free fit the latest event stamped, else the oldest free fit. A stamp with no id is never free.
 * @param claims each row's claimed stamp id, by the row's request
 * @param row the row's request
 * @param fits the stamps this row could show, oldest first
 * @param idOf a stamp's id, undefined when it has none
 * @param latest the id of the stamp the latest event made (the row the engine draws for it)
 * @returns the claimed stamp, or undefined when none is free
 */
export function claim<T, I>(claims: Map<string, I>, row: string, fits: readonly T[], idOf: (t: T) => I | undefined, latest: I | undefined): T | undefined {
  const held = claims.get(row)
  const kept = held === undefined ? undefined : fits.find(t => idOf(t) === held)

  if (kept !== undefined) return kept

  // Every path claims: a row's one fit would otherwise be free for the next row to take.
  const taken = new Set([...claims.entries()].filter(([r]) => r !== row).map(([, id]) => id))
  const free = fits.filter(t => {
    const id = idOf(t)

    return id !== undefined && !taken.has(id)
  })
  const pick = free.find(t => idOf(t) === latest) ?? free[0]
  const id = pick === undefined ? undefined : idOf(pick)

  if (id !== undefined) remember(claims, row, id, CLAIMS_MAX)

  return pick
}

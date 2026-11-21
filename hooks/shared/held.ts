// ─── Held: bounded in-memory stores ─────────────────────────────────────────

// Least recently remembered goes first: a key written again moves to the newest end.
export const remember = <K, V>(m: Map<K, V>, k: K, v: V, max: number): void => {
  m.delete(k)
  m.set(k, v)

  while (m.size > max) {
    const oldest = m.keys().next().value

    if (oldest === undefined) break
    m.delete(oldest)
  }
}

/**
 * A turn-keyed list cut back to `max` entries a whole turn at a time, oldest first, so an
 * old row never loses part of its turn on a redraw. `current`'s turn is never cut.
 */
// shortcut: one filter pass per dropped turn, and a current turn longer than `max` stays
// whole; fine at caps of a few hundred, batch the cut if a cap grows to many thousands.
export const capTurns = <T extends { turn?: string | null | undefined }>(list: T[], max: number, current: string | null | undefined): T[] => {
  let out = list

  while (out.length > max && out[0] !== undefined && out[0].turn !== current) {
    const oldest = out[0].turn

    out = out.filter(x => x.turn !== oldest)
  }

  return out
}

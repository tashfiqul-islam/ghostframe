// ─── Held: bounded in-memory stores ─────────────────────────────────────────

// A value this plugin alone writes, changed without reading it back. What a hook moves through `$.state` is copied
// into and out of its worker whole, so a change by `update` (a read, then a write) costs twice a write. The value as
// last written is held in the module and read from `$.state` once per load of it (after a reload, the first change
// reads it). The engine's rules keep `$` and the atom in the file that owns the value, so it reads and writes there:
//
//   if (held.value === undefined) await loadHeld(held, read($, list))
//   const value = changeHeld(held, fn)
//   await $.state.set({ plugin: 'ghostframe', key: 'list' }, { shape: 'list-1', value })

/** A value this plugin alone writes, as it last wrote it. */
export type Held<T> = { value?: { v: T }; loading?: Promise<void> | undefined; tick?: number }

/**
 * Holds the value read from `$.state`, once: changes waiting on the same first read share it.
 * @param held where the value is held
 * @param reading the read of its atom
 */
export async function loadHeld<T>(held: Held<T>, reading: Promise<T>): Promise<void> {
  if (held.value !== undefined) return
  held.loading ??= (async () => {
    try {
      const v = await reading

      held.value ??= { v }
    } catch (error: unknown) {
      held.loading = undefined
      throw error
    }
  })()
  await held.loading
}

/**
 * Changes the held value, at once: run right after `loadHeld`, with nothing awaited between, so two changes in flight
 * each see the other's.
 * @param held where the value is held, loaded
 * @param fn the change
 * @returns the changed value, to write
 */
export function changeHeld<T>(held: Held<T>, fn: (value: T) => T): T {
  if (held.value === undefined) throw new Error('changeHeld before loadHeld')
  // Frozen (its top level): draws and hooks share the held value, so a change in place would throw, not leak.
  const v = Object.freeze(fn(held.value.v)) as T

  held.value = { v }

  return v
}

/**
 * The next tick of a held value: what its writer writes beside it, so a draw reads a number (and is drawn again when
 * it moves) instead of a copy of the whole value. Starts from the clock, so a reload of the module still moves it on.
 * @param held the held value
 * @returns the tick to write
 */
export function nextTick<T>(held: Held<T>): number {
  held.tick = Math.max(Date.now(), (held.tick ?? 0) + 1)

  return held.tick
}

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

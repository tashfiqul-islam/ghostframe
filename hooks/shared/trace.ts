// ─── Trace: what a draw read, so the same row drawn again unchanged is served whole ─────────────────────────────────

// The engine draws a transcript row again as the person scrolls, each time as a fresh request, and each `$` call a
// draw makes is a round trip to the engine. A draw that opens a trace notes, beside each value it reads, a version of
// it (a held value's identity, a primitive, a copy's JSON); a later draw of the same row reads those sources again, all
// at once, and when every version is the same it returns the tree it kept. The sources are read again, never assumed:
// each read keeps the draw subscribed to what it read, as the first draw was.
//
// Draws interleave at their awaits, so a read is noted in every trace open at the time: a trace may hold more than its
// own draw read (read again, never missed), and a source noted twice with two versions spoils the trace.

/** A value a draw reads: each is read again by the draw that kept the tree. */
export type Source =
  | 'flow'
  | 'flowNow'
  | 'streaming'
  | 'turn'
  | 'firstTexts'
  | 'openers'
  | 'running'
  | 'receipts'
  | 'stepLog'
  | 'keptNarration'
  | 'history'
  | 'historyNow'
  | 'details'

/** What one draw read: each source and its version, and whether a source gave two versions. */
export type Trace = { versions: Map<Source, unknown>; isSpoilt: boolean }

const open = new Set<Trace>()

/**
 * Notes a source's version in every trace open now.
 * @param source what was read
 * @param version its version: a held value's identity, a primitive, or a copy's JSON
 */
export function noteRead(source: Source, version: unknown): void {
  for (const t of open) {
    if (!t.versions.has(source)) t.versions.set(source, version)
    else if (!Object.is(t.versions.get(source), version)) t.isSpoilt = true
  }
}

/**
 * Opens a trace for a draw; close it when the draw ends, whatever the end.
 * @returns the trace
 */
export function openTrace(): Trace {
  const t: Trace = { versions: new Map(), isSpoilt: false }

  open.add(t)

  return t
}

/**
 * Closes a trace: reads from now on are not its draw's.
 * @param t the trace
 */
export function closeTrace(t: Trace): void {
  open.delete(t)
}

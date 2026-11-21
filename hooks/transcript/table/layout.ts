import { vw } from '../../shared/text'
import { drawnWidth, runWidth, toWords } from '../prose'
import type { Run } from '../prose'
import type { Align, Kind, Table } from './parse'

export const GAP = 3
const MIN_FIXED = 8
const MIN_PROSE = 12
// A prose column never gets narrower than its longest word, up to this many cells.
const MAX_WORD_FLOOR = 24

// Measured exactly as drawn (a chip tight before punctuation is one cell narrower).
// A short number never sits alone at a line's end in a prose cell: `2 regressions,`
// wraps as one unit (and counts as one word for the column's floor).
const SHORT_NUMBER = /^[−+-]?\d[\d,.]*%?$/

export function cellWords(runs: Run[]): Run[][] {
  const runWords = toWords(runs)
  const out: Run[][] = []

  for (let i = 0; i < runWords.length; i++) {
    const word = runWords[i] ?? []
    const next = runWords[i + 1]
    const text = word.map(r => r.t).join('')

    if (next !== undefined && word.every(r => r.s === 'plain') && text.length <= 4 && SHORT_NUMBER.test(text)) {
      out.push([...word, { t: ' ', s: 'plain' }, ...next])
      i++
    } else {
      out.push(word)
    }
  }

  return out
}

export const cellsWidth = (runs: Run[]) => drawnWidth(runs)

export type Layout = { widths: number[]; hidden: number }

/**
 * Fixed columns take what they need first; prose columns share the rest, the
 * widest wrapping first. Short of room: fixed columns clip down to 8 cells, then
 * right-most columns drop.
 */
export function layoutTable(t: Table, room: number): Layout {
  const natural = t.header.map((h, i) => Math.max(vw(h), ...t.rows.map(r => cellsWidth(r[i]?.runs ?? [])), 1))
  // The widest single word in each column (a chip counts its padding).
  const longest = t.header.map((_, i) =>
    Math.max(1, ...t.rows.flatMap(r => cellWords(r[i]?.runs ?? []).map(word => word.reduce((n, x) => n + runWidth(x), 0))))
  )

  for (let cols = natural.length; cols >= 1; cols--) {
    const nat = natural.slice(0, cols)
    const kinds = t.kind.slice(0, cols)
    const proseIdx = kinds.flatMap((k, i) => (k === 'prose' ? [i] : []))
    const fixedIdx = kinds.flatMap((k, i) => (k === 'fixed' ? [i] : []))
    const widths = [...nat]
    const avail = room - GAP * (cols - 1)
    // Each prose column's floor: its longest word (≤ 24), never below 12, never above
    // what it needs. Fixed columns clip, then right-most columns drop, before a word does.
    const floorOf = (i: number) => Math.min(nat[i] ?? 1, Math.max(MIN_PROSE, Math.min(longest[i] ?? 1, MAX_WORD_FLOOR)))
    const proseFloor = proseIdx.reduce((s, i) => s + floorOf(i), 0)
    let fixedSum = fixedIdx.reduce((s, i) => s + (nat[i] ?? 0), 0)

    // Shrink the widest fixed columns (clipping) while prose wouldn't keep its floor.
    while (fixedSum + proseFloor > avail) {
      let wi = -1

      for (const i of fixedIdx) {
        const floor = Math.min(nat[i] ?? 1, MIN_FIXED)

        if ((widths[i] ?? 0) > floor && (wi < 0 || (widths[i] ?? 0) > (widths[wi] ?? 0))) wi = i
      }

      if (wi < 0) break
      widths[wi] = (widths[wi] ?? 1) - 1
      fixedSum--
    }

    if (fixedSum + proseFloor > avail) {
      if (cols === 1) return { widths: [Math.max(1, room)], hidden: natural.length - 1 }
      continue
    }

    // Prose shares what's left: cap the widest first (water level), floors kept.
    let left = avail - fixedSum
    const proseNat = proseIdx.map(i => nat[i] ?? 1)

    if (proseNat.reduce((a, b) => a + b, 0) > left) {
      let level = Math.max(...proseNat)

      while (level > 1 && proseIdx.reduce((s, i, k) => s + Math.max(Math.min(proseNat[k] ?? 1, level), floorOf(i)), 0) > left) {
        level--
      }

      proseIdx.forEach((i, k) => {
        widths[i] = Math.max(Math.min(proseNat[k] ?? 1, level), floorOf(i))
      })
      left -= proseIdx.reduce((s, i) => s + (widths[i] ?? 0), 0)

      // Hand leftover cells to the widest prose columns still under their natural width.
      for (const i of proseIdx.toSorted((a, b) => (nat[b] ?? 0) - (nat[a] ?? 0))) {
        if (left <= 0) break
        const extra = Math.min(left, (nat[i] ?? 0) - (widths[i] ?? 0))

        if (extra > 0) {
          widths[i] = (widths[i] ?? 0) + extra
          left -= extra
        }
      }
    }

    return { widths, hidden: natural.length - cols }
  }

  return { widths: [Math.max(1, room)], hidden: natural.length - 1 }
}

// ─── Stable layout while a reply streams ─────────────────────────────────────
// A reply taller than the window can't be erased once its top has scrolled away,
// so nothing above the line being written may move. A table's columns are fixed
// from its header and first complete rows the first time it draws during a turn
// (widths, alignment, kind); later rows and growing cells wrap inside them, with
// no blank lines between rows. Once the turn is complete it re-flows only if the
// whole reply fits in the window (and the engine doesn't say it is off screen);
// a reply taller than the window keeps its frozen columns for good.

export type Frozen = Layout & { align: Align[]; kind: Kind[] }
export type Drawn = { table: Table; layout: Layout; airy: boolean }
export type TableBlock = { table: Table; partial: boolean; settled?: Table }

/**
 * How a table draws now, and what to hold for its next draw (`undefined`: nothing).
 * `live`: a main-loop turn is running. `held`: what an earlier draw of it this turn froze.
 * `mayReflow`: once the turn is done, the whole reply fits in the window either way.
 */
export function streamLayout(
  b: TableBlock,
  room: number,
  live: boolean,
  held: Frozen | undefined,
  isOffScreen: boolean,
  mayReflow = true
): { drawn: Drawn; hold: Frozen | undefined } {
  const t = b.table
  const fixed = (f: Frozen): Drawn => ({
    table: { ...t, align: f.align, kind: f.kind, nameFirst: f.align[0] === 'left' },
    layout: { widths: f.widths, hidden: f.hidden },
    airy: false
  })

  if (!live) {
    return held !== undefined && (isOffScreen || !mayReflow)
      ? { drawn: fixed(held), hold: held }
      : { drawn: { table: t, layout: layoutTable(t, room), airy: true }, hold: undefined }
  }

  if (held !== undefined) {
    return { drawn: fixed(held), hold: held }
  }

  // Freeze from the rows that are complete; a header alone (or a half-written first row)
  // draws freely until then: it is the last thing in the reply, the one part that may move.
  const basis = b.partial ? b.settled : t

  if (basis !== undefined && basis.rows.length > 0) {
    const f: Frozen = { ...layoutTable(basis, room), align: basis.align, kind: basis.kind }

    return { drawn: fixed(f), hold: f }
  }

  return { drawn: { table: t, layout: layoutTable(t, room), airy: false }, hold: undefined }
}

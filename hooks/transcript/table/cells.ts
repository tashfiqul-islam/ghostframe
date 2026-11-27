import { graphemesOf } from '../../shared/look/width'
import { cellWidth, clipMiddle, cutWords } from '../../shared/text'
import { runWidth, wrapWords } from '../prose'
import type { Run } from '../prose'
import { cutLabel } from '../research/labels'
import { cellWords, cellsWidth } from './layout'
import { MARK, NUMBER, isPathCell, plain } from './parse'
import type { Align, Cell, Kind, Table } from './parse'

export const MAX_LINES = 4

/** Clip styled runs to `n` cells, ending in `…` when cut (or when `force`d). */
export function clipRuns(runs: Run[], n: number, force = false): Run[] {
  if (!force && cellsWidth(runs) <= n) {
    return runs
  }

  const target = n - 1
  const out: Run[] = []
  let used = 0

  for (const r of runs) {
    const w = runWidth(r)

    if (used + w <= target) {
      out.push(r)
      used += w
      continue
    }

    const room = target - used - (r.s === 'code' ? 2 : 0)

    if (room >= 1) {
      // Prose cuts at a word (cutWords); a code chip keeps its exact characters.
      // A URL label cuts its slug at a hyphen (cutLabel).
      out.push({ t: r.s === 'code' ? cut(r.t, room) : r.s === 'label' ? cutLabel(r.t, room) : cutWords(r.t, room), s: r.s })
    }

    break
  }

  // Never punctuation or a space right before the `…` (§0.2).
  const last = out[out.length - 1]

  if (last !== undefined && last.s !== 'code') {
    const t = last.t.replace(/[\s.,;:!?·—–\-/]+$/u, '')

    if (t.length > 0) out[out.length - 1] = { ...last, t }
    else out.pop()
  }

  out.push({ t: '…', s: 'plain' })

  return out
}

function cut(s: string, n: number): string {
  let out = ''
  let w = 0

  for (const ch of graphemesOf(s)) {
    if (w + cellWidth(ch) > n) break
    out += ch
    w += cellWidth(ch)
  }

  return out
}

/**
 * The lines a cell draws in a column of `width`: a prose cell wraps (≤ 4 lines,
 * the 4th ending in `…` if more was left); a fixed cell is one clipped line.
 */
export function cellLines(cell: Cell, width: number, kind: Kind): Run[][] {
  if (kind === 'fixed' || cell.empty) {
    const only = cell.runs[0]

    if (isPathCell(cell) && only !== undefined) {
      const inner = only.s === 'code' ? width - 2 : width

      return [[{ t: clipMiddle(only.t, Math.max(1, inner)), s: only.s }]]
    }

    return [clipRuns(cell.runs, width)]
  }

  const lines = wrapWords(cellWords(cell.runs), width).map(line => line.flatMap((word, wi) => (wi > 0 ? [{ t: ' ', s: 'plain' as const }, ...word] : word)))

  if (lines.length <= MAX_LINES) {
    return lines.map(l => clipRuns(l, width))
  }

  const kept = lines.slice(0, MAX_LINES - 1).map(l => clipRuns(l, width))
  const rest = lines.slice(MAX_LINES - 1).flatMap((l, i) => (i > 0 ? [{ t: ' ', s: 'plain' as const }, ...l] : l))

  return [...kept, clipRuns(rest, width, true)]
}

/**
 * A body cell's own alignment (§0.2 tables): a number-like cell right-aligns and a text
 * cell left-aligns, whatever its column says, so a link in a numeric column reads from
 * the left edge. Empty and mark cells (✓, —, yes) keep the column's alignment.
 */
export function cellAlign(cell: Cell | undefined, column: Align): Align {
  if (cell === undefined || cell.empty) return column

  const text = plain(cell)

  if (MARK.test(text)) return column
  if (NUMBER.test(text)) return 'right'

  return 'left'
}

/**
 * A header's alignment: its column's, except that a column whose non-empty cells are
 * mostly number-like (more than half) right-aligns its header over the numbers, even
 * when a few text cells keep it from being a numeric column.
 */
export function headerAlign(t: Pick<Table, 'rows' | 'align'>, ci: number): Align {
  const column = t.align[ci] ?? 'left'

  if (column !== 'left') return column

  const cells = t.rows.map(r => r[ci]).filter((c): c is Cell => c !== undefined && !c.empty)
  const numbers = cells.filter(c => NUMBER.test(plain(c))).length

  return cells.length > 0 && numbers * 2 > cells.length ? 'right' : column
}

/** Spaces to put left and right of a drawn line so it fills `width` with its alignment. */
export function padding(runs: Run[], width: number, align: Align): [number, number] {
  const gap = Math.max(0, width - cellsWidth(runs))

  if (align === 'right') return [gap, 0]
  if (align === 'center') return [Math.floor(gap / 2), gap - Math.floor(gap / 2)]

  return [0, gap]
}

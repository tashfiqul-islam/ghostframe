import { fitParts } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import { clip, vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { frameBottom, frameRow, frameTop } from '../frame'
import type { FigureBlock } from './fence'
import { countOf, listLines, parseList } from './list'
import { toneRow } from './tone'

// ─── The frame ───────────────────────────────────────────────────────────────

export const WIDER_NOTE = 'wider than window · ctrl+o'

/**
 * The figure framed at `width`: the top rule with `[ TITLE ]`, each row inset 1 and
 * never wrapped (a row wider than the frame is cut at the right), and, once the fence
 * closes, the bottom rule (noting, dim, when any row was cut). Rows already drawn never
 * change as more arrive.
 */
export function figureLines(f: FigureBlock, width: number, narrow = false): Part[][] {
  const inner = width - 4
  const list = parseList(f.rows, f.closed)

  if (list !== undefined) {
    const { rows, notes, cut } = listLines(list, inner, narrow, f.closed)

    return [
      frameTop(width, f.title, f.closed ? { t: countOf(list), color: C.muted } : undefined),
      ...rows.map(r => frameRow(width, r)),
      ...(f.closed ? [frameBottom(width, cut ? { t: WIDER_NOTE, color: C.dim } : undefined), ...notes.map(n => fitParts(n, width))] : [])
    ]
  }

  const wider = f.rows.some(r => vw(r) > inner)

  return [
    frameTop(width, f.title, undefined),
    ...f.rows.map(r => frameRow(width, toneRow(vw(r) > inner ? clip(r, inner) : r))),
    ...(f.closed ? [frameBottom(width, wider ? { t: WIDER_NOTE, color: C.dim } : undefined)] : [])
  ]
}

// A reply's tables: each streamed table's frozen columns, and its lines as laid out.
import { remember } from '../../../shared/held'
import { C } from '../../../shared/tokens'
import type { Block } from '../../blocks/split'
import type { citationsOf } from '../../citations'
import { spansOf } from '../../prose'
import type { Run, Span } from '../../prose'
import { cellAlign, cellLines, headerAlign, padding } from '../../table/cells'
import { GAP as TABLE_GAP, streamLayout } from '../../table/layout'
import type { Drawn, Frozen } from '../../table/layout'

// Each streamed table's frozen columns; a reply taller than the window keeps them for good.
// Written while drawing, which $.state refuses, so it lives here. Widths only, never lines.
// A reload (or an evicted entry) costs that table one re-flow.
const frozen = new Map<string, Frozen>()
const FROZEN_MAX = 2000

export const tableLines = ({ table: t, layout: tableLayout, airy: mayAir }: Drawn): Span[][] => {
  const { widths, hidden } = tableLayout
  const total = widths.reduce((a, b) => a + b, 0) + TABLE_GAP * (widths.length - 1)

  type DrawnCell = { runs: Run[]; color: string; empty: boolean }

  // A row is as tall as its tallest cell; the others are top-aligned.
  const rowLines = (cells: DrawnCell[], isHeader: boolean): Span[][] => {
    const per = widths.map((w, ci) => {
      const drawnCell = cells[ci] ?? { runs: [], color: C.text, empty: true }

      return cellLines({ runs: drawnCell.runs, empty: drawnCell.empty }, w, isHeader ? 'fixed' : (t.kind[ci] ?? 'fixed'))
    })
    const height = Math.max(1, ...per.map(p => p.length))

    return Array.from({ length: height }, (_, li) =>
      widths.flatMap((w, ci) => {
        const drawnCell = cells[ci]
        const runs = per[ci]?.[li] ?? []
        const column = t.align[ci] ?? 'left'
        const [l, r] = padding(runs, w, isHeader ? headerAlign(t, ci) : cellAlign(drawnCell, column))
        const tail = ci < widths.length - 1 ? r + TABLE_GAP : 0
        const base = drawnCell?.empty ? C.dim : (drawnCell?.color ?? C.text)

        return [...(l > 0 ? [{ t: ' '.repeat(l), color: C.text }] : []), ...spansOf(runs, base), ...(tail > 0 ? [{ t: ' '.repeat(tail), color: C.text }] : [])]
      })
    )
  }

  const header = rowLines(
    t.header.map(h => ({ runs: [{ t: h, s: 'plain' as const }], color: C.muted, empty: false })),
    true
  )
  const body = t.rows.map(cells =>
    rowLines(
      cells.map((c, ci) => ({ ...c, color: ci === 0 && t.nameFirst ? C.textBright : C.text })),
      false
    )
  )
  // A blank line between rows when rows wrap (§5.18), at any width. Settled (the turn
  // done, the reply re-flowed): between every two rows once any row wraps. Streaming or
  // frozen: next to each row that wraps, so a blank row only ever lands below a row
  // already drawn, or above the row being written.
  const wraps = body.map(r => r.length > 1)
  const anyWraps = wraps.some(w => w)
  const gapBefore = (ri: number) => ri > 0 && (mayAir ? anyWraps : wraps[ri] === true || wraps[ri - 1] === true)

  return [
    ...header,
    [{ t: '─'.repeat(total), color: C.hairline }],
    ...body.flatMap((r, ri) => (gapBefore(ri) ? [[], ...r] : r)),
    ...(hidden > 0 ? [[{ t: `${hidden} ${hidden === 1 ? 'column' : 'columns'} hidden`, color: C.dim }]] : [])
  ]
}

// Tables keep their columns while the turn streams (see streamLayout): each is keyed by
// this message, its place among the message's tables, the measure and its header.
export function tableDraws(
  blocks: readonly Block[],
  message: string,
  width: number,
  live: boolean,
  isOffScreen: boolean,
  tables: ReturnType<typeof citationsOf>['tables']
): Map<Block, Drawn> {
  let tableNo = 0
  const plans = blocks.flatMap(b => {
    if (b.kind !== 'table') return []

    const tableKey = `${message}|${tableNo++}|${width}|${b.table.header.join('␟')}`

    // A table with links lays out with its markers renumbered through the turn.
    return [{ b, src: tables.get(b)?.block ?? b, key: tableKey, held: frozen.get(tableKey) }]
  })
  const decide = (mayReflow: boolean) =>
    new Map(plans.map(p => [p.b as Block, { key: p.key, ...streamLayout(p.src, width, live, p.held, isOffScreen, mayReflow) }]))
  const drawsOf = (m: ReturnType<typeof decide>) => new Map([...m].map(([b, r]) => [b, r.drawn]))

  // A table keeps the layout it froze while streaming, when the turn ends too: no
  // re-flow at completion. (It used to re-flow when the reply alone fit the window, but
  // the region the terminal redraws also holds the turn rule, the prompt and the footer:
  // past the window's height the redraw printed the whole turn a second time.)
  const decided = decide(false)

  for (const { key: tableKey, hold } of decided.values()) {
    if (hold === undefined) {
      frozen.delete(tableKey)
    } else {
      remember(frozen, tableKey, hold, FROZEN_MAX)
    }
  }

  return drawsOf(decided)
}

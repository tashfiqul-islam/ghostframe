// Cards on the left (spec 1.6, 7.2, 7.5 to 7.9): surfaces across the text column with soft half-cell top and bottom
// edges (`▄` `▀`) in the card's own colour, and a 2-cell inner pad.
import type { Part } from '../parts'
import { vw } from '../text'
import { GLYPH } from './glyphs'
import { TOKEN } from './palette'
import { NO_LABEL, SPINE, spineRow } from './spine'
import type { Label } from './spine'

/** A card's inner pad on each side (6.1). */
export const PAD = 2

/**
 * A card's top edge: `▄` across the width in the card's colour, over what is above it (the terminal's ground, or the
 * colour of the strip above, `above`).
 * @param color the card's colour
 * @param width the text column's cells
 * @param above the background above the edge, undefined for the terminal's
 * @returns the row
 */
export function topEdge(color: string, width: number, above?: string): Part[] {
  return spineRow(NO_LABEL, SPINE, [{ t: GLYPH.edgeTop.repeat(width), color, ...(above === undefined ? {} : { bg: above }) }])
}

/**
 * A card's bottom edge: `▀` across the width in the card's colour.
 * @param color the card's colour
 * @param width the text column's cells
 * @returns the row
 */
export function bottomEdge(color: string, width: number): Part[] {
  return spineRow(NO_LABEL, SPINE, [{ t: GLYPH.edgeBottom.repeat(width), color }])
}

/**
 * One row of a card: the inner pad, the parts, and the rest of the width, all on the card's colour. The parts are
 * cut to fit; the pad on the right stays.
 * @param parts the row's content
 * @param bg the card's colour
 * @param width the text column's cells
 * @param label the label column, for a card that carries one (an added message's clock)
 * @param right parts held at the right end, 2 cells from the edge (`added`, `QUEUED`, `c copy`)
 * @returns the row
 */
export function cardRow(parts: readonly Part[], bg: string, width: number, label: Label = NO_LABEL, right: readonly Part[] = []): Part[] {
  const inner = width - PAD * 2
  const rightW = right.reduce((n, p) => n + vw(p.t), 0)
  // With nothing held at the right, a row may run into the right pad (screen 01's note ends on the card's last cell).
  const room = rightW > 0 ? inner - rightW - 1 : inner + PAD
  const kept: Part[] = []
  let used = 0

  for (const p of parts) {
    if (used >= room) break

    const chars = Array.from(p.t)
    let t = ''

    for (const ch of chars) {
      if (used + vw(t + ch) > room) break
      t += ch
    }

    kept.push({ ...p, t, bg: p.bg ?? bg })
    used += vw(t)
  }

  const gap = inner + PAD - used - rightW - (rightW > 0 ? PAD : 0)

  return spineRow(label, SPINE, [
    { t: ' '.repeat(PAD), color: TOKEN.dim, bg },
    ...kept,
    { t: ' '.repeat(Math.max(0, gap)), color: TOKEN.dim, bg },
    ...right.map(p => ({ ...p, bg: p.bg ?? bg })),
    ...(rightW > 0 ? [{ t: ' '.repeat(PAD), color: TOKEN.dim, bg }] : [])
  ])
}

/**
 * A whole card: its top edge, its rows on its colour, its bottom edge.
 * @param rows each row's content
 * @param bg the card's colour
 * @param width the text column's cells
 * @returns the rows
 */
export function card(rows: readonly (readonly Part[])[], bg: string, width: number): Part[][] {
  return [topEdge(bg, width), ...rows.map(r => cardRow(r, bg, width)), bottomEdge(bg, width)]
}

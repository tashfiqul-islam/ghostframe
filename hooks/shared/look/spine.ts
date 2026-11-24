// The left's grid (spec 6.1): `| 2 margin | 10 label, right-aligned | 1 | spine | 2 | text column 86 |`. Every row
// Cockpit draws on the left is built here, so the label, the spine and the text column line up on every row.
import type { Part } from '../parts'
import { widthOf } from './width'
import { GLYPH } from './glyphs'
import { TOKEN } from './palette'

/** The label column's width (6.1). */
export const LABEL_CELLS = 10
/** The column the spine sits in, counting from 0. */
export const SPINE_AT = 13
/** The column the text column starts at, counting from 0. */
export const TEXT_AT = 16
/** The text column's width beside a pane or wide (6.1); it never grows past this. */
export const TEXT_CELLS = 86
/** The text column's width with no pane under 110 columns (6.1). */
export const NARROW_TEXT_CELLS = 78
/** Below this many columns with no pane, the narrow text column (6.1). */
export const NARROW_BELOW = 110

/**
 * The text column's width for a left region this wide (6.1): 86, or 78 narrow; never wider than the region leaves.
 * @param columns the terminal's columns, or the left region's beside a pane
 * @param isDocked whether a pane is docked beside it
 * @returns the cells
 */
export function textCells(columns: number | undefined, isDocked: boolean): number {
  const want = !isDocked && columns !== undefined && columns < NARROW_BELOW ? NARROW_TEXT_CELLS : TEXT_CELLS

  return columns === undefined ? want : Math.max(20, Math.min(want, columns - TEXT_AT - 1))
}

/** A label for the label column: its text and colour. */
export type Label = { t: string; color: string }

/** No label. */
export const NO_LABEL: Label = { t: '', color: TOKEN.dim }

/** The spine itself, `│` in its colour. */
export const SPINE: Part = { t: GLYPH.spine, color: TOKEN.spine }

/** No spine: the turn's spine breaks here (a step row printed by `/steps n all`, between turns). */
export const NO_SPINE: Part = { t: ' ', color: TOKEN.spine }

/**
 * One left row (6.1): the label right-aligned in its 10 cells, the spine's glyph, then the text column.
 * @param label the label, '' for none
 * @param glyph what sits in the spine column: the spine, a node glyph, or nothing
 * @param body the text column's parts
 * @returns the row's parts
 */
export function spineRow(label: Label, glyph: Part, body: readonly Part[]): Part[] {
  const t = label.t.length > LABEL_CELLS ? label.t.slice(0, LABEL_CELLS) : label.t

  return [
    { t: ' '.repeat(2 + LABEL_CELLS - widthOf(t)), color: TOKEN.dim },
    ...(t.length > 0 ? [{ t, color: label.color }] : []),
    { t: ' ', color: TOKEN.dim },
    glyph,
    ...(body.length > 0 ? [{ t: '  ', color: TOKEN.dim }, ...body] : [])
  ]
}

/** A row of the spine alone: `│` with nothing beside it, the one blank row inside a turn. */
export const spineOnly = (glyph: Part = SPINE): Part[] => spineRow(NO_LABEL, glyph, [])

/** The text of a row, for tests and copies: its parts' text joined, trailing spaces kept. */
export const rowText = (row: readonly Part[]): string => row.map(p => p.t).join('')

// Helpers that read a capture: a cell or text at a place, the left and pane regions found from the divider, rows that
// match, the receipt, the pane's pill, and a cell's colour against a token from spec section 2. They assert
// structure only, never Claude's wording.
import { PILL, TINT, TOKEN } from '../../hooks/shared/look/palette.ts'
import { rowText, type Capture, type Cell } from './screen.ts'

/** A rectangle of the screen: columns `x0` to `x1 - 1`, rows `y0` to `y1 - 1`. */
export type Region = { x0: number; x1: number; y0: number; y1: number }

/** Where the screen's parts are: the left, the pane (when docked) and the divider between them. */
export type Layout = { left: Region; pane: Region | undefined; divider: number | undefined }

/** A token from section 2: a text colour, a tint or a pill background. */
export type Token = `token.${keyof typeof TOKEN}` | `tint.${keyof typeof TINT}` | `pill.${keyof typeof PILL}`

/**
 * The hex a section 2 token names.
 * @param token `token.accent`, `tint.selected`, `pill.done`, …
 * @returns `#RRGGBB`
 */
export function hexOf(token: Token): string {
  const dot = token.indexOf('.')
  const group = token.slice(0, dot)
  const name = token.slice(dot + 1)
  const table: Record<string, string> = group === 'token' ? TOKEN : group === 'tint' ? TINT : PILL
  const value = table[name]

  if (value === undefined) throw new Error(`No ${group} named ${name} in section 2`)

  return value
}

/**
 * The cell at a place.
 * @param cap the capture
 * @param y the row
 * @param x the column
 * @returns the cell
 */
export function at(cap: Capture, y: number, x: number): Cell {
  const cell = cap.cells[y]?.[x]

  if (cell === undefined) throw new Error(`No cell at row ${y}, column ${x} on a ${cap.cols}×${cap.rows} screen`)

  return cell
}

/**
 * The text that starts at a place.
 * @param cap the capture
 * @param y the row
 * @param x the column
 * @param length how many cells
 * @returns the text
 */
export const textAt = (cap: Capture, y: number, x: number, length: number): string => rowText(cap, y, x, x + length)

/**
 * Whether a cell's foreground (or background) is a token's colour.
 * @param cell the cell
 * @param token the token
 * @param side which colour, default the foreground
 * @returns whether they match
 */
export const colourIs = (cell: Cell, token: Token, side: 'fg' | 'bg' = 'fg'): boolean => cell[side]?.toUpperCase() === hexOf(token).toUpperCase()

// The engine's input box: a full-width rule above and below the prompt.
const isRule = (cap: Capture, y: number): boolean => /^─{40,}$/.test(rowText(cap, y).trim()) && rowText(cap, y).trim().length >= cap.cols - 2

/**
 * The left and pane regions. The body ends at the input box's top rule; the divider is the column that holds `│` on
 * most of the body's rows.
 * @param cap the capture
 * @returns the layout
 */
export function layoutOf(cap: Capture): Layout {
  const bottom = Array.from({ length: cap.rows }, (_, y) => y).find(y => isRule(cap, y)) ?? cap.rows
  let divider: number | undefined

  for (let x = 1; x < cap.cols - 1; x++) {
    let bars = 0

    for (let y = 0; y < bottom; y++) if (cap.cells[y]?.[x]?.ch === '│') bars++
    if (bars >= Math.max(8, bottom * 0.8) && (divider === undefined || x > divider)) divider = x
  }
  // A pane is at least 40 cells; a `│` column further left is the spine.
  if (divider !== undefined && cap.cols - divider < 40) divider = undefined

  return divider === undefined
    ? { left: { x0: 0, x1: cap.cols, y0: 0, y1: bottom }, pane: undefined, divider }
    : { left: { x0: 0, x1: divider, y0: 0, y1: bottom }, pane: { x0: divider + 1, x1: cap.cols, y0: 0, y1: bottom }, divider }
}

/**
 * A region's rows as text.
 * @param cap the capture
 * @param region the region
 * @returns one string per row, trailing spaces kept
 */
export function rowsOf(cap: Capture, region: Region): string[] {
  return Array.from({ length: region.y1 - region.y0 }, (_, i) => rowText(cap, region.y0 + i, region.x0, region.x1))
}

/** The left's rows (the whole body when no pane is docked). */
export const leftRows = (cap: Capture): string[] => rowsOf(cap, layoutOf(cap).left)

/** The pane's rows, or none when no pane is docked. */
export function paneRows(cap: Capture): string[] {
  const pane = layoutOf(cap).pane

  return pane === undefined ? [] : rowsOf(cap, pane)
}

/**
 * The rows that match a pattern: empty when "no row matches" holds.
 * @param rows the rows
 * @param pattern what no row may match
 * @returns each matching row with its index
 */
export function rowsMatching(rows: readonly string[], pattern: RegExp): { y: number; text: string }[] {
  return rows.flatMap((text, y) => (pattern.test(text) ? [{ y, text }] : []))
}

/** A duration in a label (spec 5.2). */
const DURATION = String.raw`(?:<1s|\d+s|\d+m \d\ds|\d+h \d\dm)`

/** A receipt row (7.12): a duration, `✓` or `×` and its state word. */
export const RECEIPT: RegExp = new RegExp(String.raw`^\s*${DURATION} ([✓×!]) {2}(DONE|FAILED|WAITING)\b`)

/** A turn header (7.1). */
export const HEADER: RegExp = /^\s*\d\d:\d\d:\d\d ◆ {2}TURN (\d+)/

/** The engine's permission dialog. */
export const DIALOG: RegExp = /Do you want to (proceed|make this edit|create)|❯\s*1\.\s*Yes/

/**
 * The left's receipt rows.
 * @param cap the capture
 * @returns each receipt with its row and state word
 */
export function receipts(cap: Capture): { y: number; word: string; text: string }[] {
  return leftRows(cap).flatMap((text, y) => {
    const m = RECEIPT.exec(text)

    return m === null ? [] : [{ y, word: m[2] ?? '', text: text.trimEnd() }]
  })
}

/** The rows of the left that are turn headers. */
export const headers = (cap: Capture): { y: number; turn: number }[] =>
  leftRows(cap).flatMap((text, y) => {
    const m = HEADER.exec(text)

    return m === null ? [] : [{ y, turn: Number(m[1]) }]
  })

/** Whether the engine's permission dialog is on screen. */
export const isDialogUp = (cap: Capture): boolean => DIALOG.test(rowsOf(cap, { x0: 0, x1: cap.cols, y0: 0, y1: cap.rows }).join('\n'))

/**
 * Whether the latest turn has drawn its receipt: a receipt below the last turn header on screen.
 * @param cap the capture
 * @returns whether the turn has ended with a receipt
 */
export function hasReceipt(cap: Capture): boolean {
  const last = receipts(cap).at(-1)
  const header = headers(cap).at(-1)

  return last !== undefined && (header === undefined || last.y > header.y)
}

/** The pane head's pill (8.2): `▐ <glyph> <WORD> ▌`. */
export type Pill = { y: number; x: number; glyph: string; word: string; fg: string | null; bg: string | null }

/**
 * The pane's first pill.
 * @param cap the capture
 * @returns the pill, or undefined when the pane draws none
 */
export function pillOf(cap: Capture): Pill | undefined {
  const pane = layoutOf(cap).pane

  if (pane === undefined) return undefined
  const rows = rowsOf(cap, pane)

  for (const [i, text] of rows.entries()) {
    const m = /▐ (\S) ([A-Z][A-Z ]*[A-Z]) ▌/.exec(text)

    if (m !== null) {
      const x = pane.x0 + m.index + 2
      const cell = at(cap, pane.y0 + i, x)

      return { y: pane.y0 + i, x, glyph: m[1] ?? '', word: m[2] ?? '', fg: cell.fg, bg: cell.bg }
    }
  }

  return undefined
}

/**
 * The pane row drawn as selected (6.2): `▐` in its first column.
 * @param cap the capture
 * @returns the row, its `▐` cell and every cell's background across the pane
 */
export function selectedRow(cap: Capture): { y: number; bar: Cell; backgrounds: (string | null)[] } | undefined {
  const pane = layoutOf(cap).pane

  if (pane === undefined) return undefined
  for (let y = pane.y0; y < pane.y1; y++) {
    const bar = at(cap, y, pane.x0)
    // The head pill also starts with `▐`, one column in; the select bar is in the pane's first column.

    if (bar.ch === '▐') return { y, bar, backgrounds: (cap.cells[y] ?? []).slice(pane.x0, pane.x1).map(c => c.bg) }
  }

  return undefined
}

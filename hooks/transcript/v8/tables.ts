// Table, note and plan cards on the left (spec 7.6, 7.7, 7.9). Pure.
import type { Part } from '../../shared/parts'
import { bottomEdge, cardRow, PAD, topEdge } from '../../shared/look/card'
import { count } from '../../shared/look/format'
import { GLYPH } from '../../shared/look/glyphs'
import { TINT, TOKEN } from '../../shared/look/palette'
import { widthOf } from '../../shared/look/width'
import { inline } from './inline'

/** A pipe row's cells, trimmed; the outer pipes dropped. */
const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.trim().replace(/\\\|/g, '|'))

const NUMERIC = /^[−+-]?[$€£¥]?\d[\d.,]*\s*(%|[a-zA-Zµ]{1,3})?$/
const GAP = 3

/** A result cell's lead glyph in its colour (7.6): `✓` ok, `×` err. */
function cellParts(text: string): Part[] {
  // `✗`: a ballot x Claude may write for a failure, read as `×`.
  const m = new RegExp(`^([${GLYPH.ok}${GLYPH.fail}\\u2717])\\s+(.*)$`, 'u').exec(text)

  if (m === null) return inline(text, TOKEN.text)

  const isOk = m[1] === GLYPH.ok

  return [{ t: `${isOk ? GLYPH.ok : GLYPH.fail} `, color: isOk ? TOKEN.ok : TOKEN.err }, ...inline(m[2] ?? '', TOKEN.text)]
}

/** The cells a cell's parts take once drawn. */
const shownWidth = (parts: readonly Part[]) => parts.reduce((n, p) => n + widthOf(p.t), 0)

/** A table row's colour (7.6): every second row on the zebra tint. */
const zebra = (i: number) => (i % 2 === 0 ? TOKEN.code : TINT.zebra)

/**
 * A pipe table as a card (7.6): a `codeHead` header band in sentence case, bold, `muted`; zebra rows; numbers
 * right-aligned. The first column takes a third of the card or its content, whichever is wider; the others their
 * content, 3 cells apart; the last the rest.
 * @param lines the table's lines: header, separator, rows
 * @param width the text column's cells
 * @returns the rows
 */
export function tableCard(lines: readonly string[], width: number): Part[][] {
  const header = cellsOf(lines[0] ?? '')
  const rows = lines.slice(2).map(cellsOf)
  const inner = width - PAD * 2
  const cols = header.length
  // Cells are measured as drawn: a header's `code` and `**bold**` lose their markers like a body cell's do.
  const headParts = header.map(h => inline(h, TOKEN.muted).map(p => ({ ...p, bold: true })))
  const bodyParts = rows.map(r => header.map((_, c) => cellParts(r[c] ?? '')))
  const widths = header.map((_, c) => Math.max(shownWidth(headParts[c] ?? []), ...bodyParts.map(r => shownWidth(r[c] ?? []))))
  const numeric = header.map((_, c) => rows.length > 0 && rows.every(r => NUMERIC.test(r[c] ?? '')))
  const boxes = widths.map((w, c) => (c === 0 ? Math.max(w + GAP, Math.ceil(inner / 3)) : c === cols - 1 ? w : w + GAP))
  const lay = (cells: readonly Part[][], color: string): Part[] =>
    cells.flatMap((parts, c) => {
      const w = parts.reduce((n, p) => n + widthOf(p.t), 0)
      const box = boxes[c] ?? 0
      const content = c === cols - 1 ? box : c === 0 ? box : box - GAP
      const fill = { t: ' '.repeat(Math.max(0, content - w)), color }
      const gap = c > 0 && c < cols - 1 ? [{ t: ' '.repeat(GAP), color }] : []

      return numeric[c] === true ? [fill, ...parts, ...gap] : [...parts, ...(c === cols - 1 ? [] : [fill]), ...gap]
    })
  const head = cardRow(lay(headParts, TOKEN.muted), TOKEN.codeHead, width)
  const body = bodyParts.map((r, i) => cardRow(lay(r, TOKEN.text), zebra(i), width))

  return [topEdge(TOKEN.codeHead, width), head, topEdge(TOKEN.code, width, TOKEN.codeHead), ...body, bottomEdge(zebra(Math.max(0, rows.length - 1)), width)]
}

/**
 * The note (7.7): a one-row card, `▲ NOTE` in `machine`, bold, then one sentence in `text`.
 * @param text the sentence
 * @param width the text column's cells
 * @returns the rows
 */
export function noteCard(text: string, width: number): Part[][] {
  return [
    topEdge(TOKEN.code, width),
    cardRow([{ t: `${GLYPH.note} NOTE`, color: TOKEN.machine, bold: true }, { t: '   ', color: TOKEN.dim }, ...inline(text, TOKEN.text)], TOKEN.code, width),
    bottomEdge(TOKEN.code, width)
  ]
}

/**
 * The plan card (7.9): `PLAN` in `machine`, bold, the step count, the engine's own approve keys at the right, then
 * the numbered steps. Cockpit invents no key: `keys` are the ones the engine's plan dialog offers.
 * @param steps the plan's steps
 * @param keys the engine's keys, as `[key, action]` pairs
 * @param width the text column's cells
 * @returns the rows
 */
export function planCard(steps: readonly string[], keys: readonly (readonly [string, string])[], width: number): Part[][] {
  const right = keys.flatMap(([k, a], i): Part[] => [
    ...(i > 0 ? [{ t: '    ', color: TOKEN.dim }] : []),
    { t: k, color: TOKEN.accent },
    { t: ` ${a}`, color: TOKEN.dim }
  ])
  const num = String(steps.length).length

  return [
    topEdge(TOKEN.code, width),
    cardRow(
      [
        { t: 'PLAN', color: TOKEN.machine, bold: true },
        { t: `   ${count(steps.length, 'step')}`, color: TOKEN.dim }
      ],
      TOKEN.code,
      width,
      undefined,
      right
    ),
    cardRow([], TOKEN.code, width),
    ...steps.map((s, i) =>
      cardRow([{ t: String(i + 1).padEnd(num), color: TOKEN.machine }, { t: '  ', color: TOKEN.dim }, ...inline(s, TOKEN.text)], TOKEN.code, width)
    ),
    bottomEdge(TOKEN.code, width)
  ]
}

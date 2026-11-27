// Table, note and plan cards on the left (spec 7.6, 7.7, 7.9). Pure.
import type { Part } from '../../shared/parts'
import { bottomEdge, cardRow, PAD, topEdge } from '../../shared/look/card'
import { count } from '../../shared/look/format'
import { GLYPH } from '../../shared/look/glyphs'
import { TINT, TOKEN } from '../../shared/look/palette'
import { NO_LABEL, SPINE, spineRow } from '../../shared/look/spine'
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

/** Parts cut to `cells`, the last kept character giving way to `…` when anything is cut; else as they are. */
function cutTo(parts: readonly Part[], cells: number): Part[] {
  if (shownWidth(parts) <= cells) return [...parts]

  const out: Part[] = []
  let used = 0

  for (const p of parts) {
    let t = ''

    for (const ch of Array.from(p.t)) {
      if (used + widthOf(t + ch) > cells - 1) break
      t += ch
    }
    out.push({ ...p, t })
    used += widthOf(t)
    if (t.length < p.t.length) break
  }
  const last = out.at(-1)

  return last === undefined ? [] : [...out.slice(0, -1), { ...last, t: `${last.t}${GLYPH.ellipsis}` }]
}

/**
 * A pipe table as a card (7.6): a `codeHead` header band in sentence case, bold, `muted`, the card's first row; zebra
 * rows. Each column is sized to its content, 3 cells apart: a number column right-aligned in its own width; the first
 * text column takes a third of the card or its content, whichever is wider; the last takes the rest, cut with `…`.
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
  const boxes = widths.map((w, c) => (c === 0 && numeric[c] !== true && cols > 1 ? Math.max(w, Math.ceil(inner / 3) - GAP) : w))
  // The last column takes what the others leave; when they leave it under a third of the card, the widest of them
  // give way a cell at a time (cut with `…`), so no row runs past the card.
  const floor = cols > 1 ? Math.min(widths[cols - 1] ?? 0, Math.ceil(inner / 3)) : inner
  // The cells the columns before the last of the first `k` take, gaps included.
  const spent = (k = cols) => boxes.slice(0, k - 1).reduce((n, b) => n + b + GAP, 0)

  while (inner - spent() < floor) {
    const widest = boxes.slice(0, -1).reduce((w, b, c) => (b > (boxes[w] ?? 0) ? c : w), 0)

    if ((boxes[widest] ?? 0) <= 3) break
    boxes[widest] = (boxes[widest] ?? 0) - 1
  }
  // Still too many: the columns past the last one that keeps 3 cells (or its whole content) are left out, and counted.
  let shown = cols

  while (shown > 1 && inner - spent(shown) < Math.max(1, Math.min(3, widths[shown - 1] ?? 0))) shown--
  const rest = Math.max(1, inner - spent(shown))
  const lay = (cells: readonly Part[][], color: string): Part[] =>
    cells.slice(0, shown).flatMap((parts, c) => {
      const box = c === shown - 1 ? rest : (boxes[c] ?? 0)
      const cut = cutTo(parts, box)
      const fill = { t: ' '.repeat(Math.max(0, box - shownWidth(cut))), color }
      const gap = c < shown - 1 ? [{ t: ' '.repeat(GAP), color }] : []

      return numeric[c] === true ? [fill, ...cut, ...gap] : [...cut, fill, ...gap]
    })
  const head = cardRow(lay(headParts, TOKEN.muted), TOKEN.codeHead, width)
  const body = bodyParts.map((r, i) => cardRow(lay(r, TOKEN.text), zebra(i), width))
  const hidden = cols - shown

  // One header band (7.6): no half-block edge above or under it; the card closes under its last row, then a dim row
  // counts the columns left out.
  return [
    head,
    ...body,
    bottomEdge(zebra(Math.max(0, rows.length - 1)), width),
    ...(hidden > 0 ? [spineRow(NO_LABEL, SPINE, [{ t: `${count(hidden, 'column')} hidden`, color: TOKEN.dim }])] : [])
  ]
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

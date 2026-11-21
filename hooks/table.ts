import { cellWidth, clipMiddle, cutWords, vw } from './shared/text'
import { sourceLabel } from './shared/url'
import { drawnWidth, parseInline, runWidth, toWords, wrapWords } from './prose'
import type { Run } from './prose'
import { cutLabel, parseCited, sup } from './research'
import type { Numbering } from './research'

// ─── Plain table shape (DESIGN.md §5.18, amended) ────────────────────────────
// No frame, no vertical rules, muted header over a ─ hairline, 3-space gaps,
// numbers right, ✓/✗/— centred. Fixed cells (numbers, states, dates, codes,
// paths, short labels) never wrap: paths clip in the middle, the rest at the
// end. Prose cells wrap inside their column, up to 4 lines, hanging under
// their first line; the rest of the row stays top-aligned.

export type Align = 'left' | 'right' | 'center'
export type Kind = 'fixed' | 'prose'
export type Cell = { runs: Run[]; empty: boolean }
/**
 * `links`: the sources the table's prose cells cite, by the table's own number (index + 1),
 * first-cited order. Their `cite` runs carry that local number until the reply renumbers
 * them through the turn (`numberTable`).
 */
export type Table = { header: string[]; rows: Cell[][]; align: Align[]; kind: Kind[]; nameFirst: boolean; links?: { url: string; title: string }[] }

export const GAP = 3
export const MAX_LINES = 4
const MIN_FIXED = 8
const MIN_PROSE = 12
// A prose column never gets narrower than its longest word, up to this many cells.
const MAX_WORD_FLOOR = 24
const SEP_CELL = /^\s*:?-+:?\s*$/
const NUMBER = /^[−+-]?[$€£¥]?\d[\d,]*(\.\d+)?\s*(%|[a-zA-Zµ]{1,3})?$/
const MARK = /^(✓|✗|—|-|–|yes|no)?$/i
const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$|^\d{1,2}:\d{2}(\s?[AP]M)?$/i
const PATH = /^[~.]?[\w.@~-]*[\\/][^\s]*$|^[\w.-]+\.[a-z0-9]{1,5}$/i

const plain = (c: Cell) =>
  c.runs
    .map(r => r.t)
    .join('')
    .trim()
const words = (s: string) => (s.length === 0 ? 0 : s.split(/\s+/).length)

export const isSeparator = (line: string) => line.includes('|') && splitRow(line).every(c => SEP_CELL.test(c))

export function splitRow(line: string): string[] {
  let s = line.trim()

  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)

  return s.split(/(?<!\\)\|/).map(c => c.trim())
}

const BARE_CELL = /^<?(https?:\/\/[^\s<>]+?)>?$/
const LINK_CELL = /^\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+)\)$/

/** A whole-cell link as one muted label run (the one URL label, §0.2); anything else → undefined. */
function urlCell(text: string): Run[] | undefined {
  const link = LINK_CELL.exec(text)

  // Only a link: its URL label (§0.2 URLs), not the link text.
  if (link !== null) return [{ t: sourceLabel(link[2] ?? ''), s: 'label' }]

  const bare = BARE_CELL.exec(text)

  return bare === null ? undefined : [{ t: sourceLabel(bare[1] ?? ''), s: 'label' }]
}

/** A one-run cell that reads as a path: clipped in the middle, never wrapped. */
export const isPathCell = (c: Cell) => c.runs.length === 1 && PATH.test(c.runs[0]?.t ?? '')

/**
 * Header, separator, rows; undefined (the engine draws the table, full width) only for:
 * - a separator with a different number of columns from the header;
 * - a row with more cells than the header (fewer is fine: the rest are empty);
 * - a header cell with any markdown beyond bold, italic and code (a link, HTML, `~~`);
 * - a body cell with markdown we don't lay out: inline HTML (`<br>`), `~~strike~~`, a
 *   backslash escape other than `\|`, `$$` math, an image, a reference link `[x][1]`, a link
 *   to anything but http(s) (`./a.md`, `mailto:`), a bare `www.` host, or stray `*` `_` `` ` ``.
 * Links (a whole-cell link, a link or bare URL inside prose) and escaped pipes all parse.
 */
export function parseTable(lines: readonly string[]): Table | undefined {
  const [head, sep, ...body] = lines

  if (head === undefined || sep === undefined || !isSeparator(sep)) {
    return undefined
  }

  const header = splitRow(head)
  const seps = splitRow(sep)

  if (header.length === 0 || seps.length !== header.length) {
    return undefined
  }

  const rows: Cell[][] = []
  // Links inside prose cells: numbered through the table here, through the turn when drawn.
  const local: Numbering = new Map()
  const links: { url: string; title: string }[] = []

  for (const line of body) {
    const raw = splitRow(line)

    if (raw.length > header.length) {
      return undefined
    }

    const row: Cell[] = []

    for (let i = 0; i < header.length; i++) {
      // An escaped pipe is a pipe in the text, not markdown we can't draw.
      const text = (raw[i] ?? '').replace(/\\\|/g, '|')

      if (text.length === 0) {
        row.push({ runs: [{ t: '—', s: 'plain' }], empty: true })
        continue
      }

      // A cell that is a link (`https://…`, `<https://…>`, `[text](https://…)`) draws its label, muted.
      // A link inside prose: its text plus a marker; `(post (https://…))` → `(post¹)`.
      const runs = urlCell(text) ?? parseInline(text) ?? citedCell(text, local, links)

      if (runs === undefined) {
        return undefined
      }

      row.push({ runs, empty: false })
    }

    rows.push(row)
  }

  const headerText: string[] = []

  for (const h of header) {
    const runs = parseInline(h.replace(/\\\|/g, '|'))

    if (runs === undefined) {
      return undefined
    }

    headerText.push(runs.map(r => r.t).join(''))
  }

  const columns = header.map((_, i) => rows.map(r => r[i]).filter((c): c is Cell => c !== undefined && !c.empty))

  const align = seps.map((s, i): Align => {
    const t = s.trim()
    const cells = columns[i] ?? []

    if (t.startsWith(':') && t.endsWith(':')) return 'center'
    if (t.endsWith(':')) return 'right'
    if (cells.length > 0 && cells.every(c => NUMBER.test(plain(c)))) return 'right'
    if (cells.length > 0 && cells.every(c => MARK.test(plain(c)))) return 'center'

    return 'left'
  })

  // Prose: a left-aligned column of sentences (any cell of 4+ words, or long and spaced),
  // not dates or paths. Everything else is fixed and never wraps.
  const kind = columns.map((cells, i): Kind => {
    if (align[i] !== 'left' || cells.length === 0) return 'fixed'
    if (cells.every(c => DATE.test(plain(c)) || isPathCell(c))) return 'fixed'

    const spaced = cells.filter(c => plain(c).includes(' '))

    return cells.some(c => words(plain(c)) >= 4) || spaced.some(c => vw(plain(c)) > 24) ? 'prose' : 'fixed'
  })

  return { header: headerText, rows, align, kind, nameFirst: align[0] === 'left', ...(links.length > 0 ? { links } : {}) }
}

/** A prose cell with links, as runs with `cite` markers (numbered in `local`); else undefined. */
function citedCell(text: string, local: Numbering, links: { url: string; title: string }[]): Run[] | undefined {
  const c = parseCited(text, local)

  if (c === undefined) return undefined
  for (const x of c.cites) if (links[x.n - 1] === undefined) links[x.n - 1] = { url: x.url, title: x.title }

  return c.runs
}

/**
 * The table with its markers renumbered through the reply: each local number becomes the
 * one `numbering` gives its URL (new URLs take the next number), and the cites in the order
 * the table first uses them. A table without links comes back as it was.
 */
export function numberTable(t: Table, numbering: Numbering): { table: Table; cites: { n: number; url: string; title: string }[] } {
  const links = t.links ?? []

  if (links.length === 0) return { table: t, cites: [] }

  const toGlobal = links.map(l => {
    const had = numbering.get(l.url)

    if (had !== undefined) return had

    const n = numbering.size + 1
    numbering.set(l.url, n)

    return n
  })
  const SUPS = new Map(links.map((_, i) => [sup(i + 1), sup(toGlobal[i] ?? i + 1)]))
  const rows = t.rows.map(r =>
    r.map(c => (c.runs.some(x => x.s === 'cite') ? { ...c, runs: c.runs.map(x => (x.s === 'cite' ? { ...x, t: SUPS.get(x.t) ?? x.t } : x)) } : c))
  )
  const cites = links.map((l, i) => ({ n: toGlobal[i] ?? i + 1, url: l.url, title: l.title }))

  return { table: { ...t, rows }, cites }
}

// Measured exactly as drawn (a chip tight before punctuation is one cell narrower).
// A short number never sits alone at a line's end in a prose cell: `2 regressions,`
// wraps as one unit (and counts as one word for the column's floor).
const SHORT_NUMBER = /^[−+-]?\d[\d,.]*%?$/

function cellWords(runs: Run[]): Run[][] {
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

const cellsWidth = (runs: Run[]) => drawnWidth(runs)

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

  for (const ch of s) {
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

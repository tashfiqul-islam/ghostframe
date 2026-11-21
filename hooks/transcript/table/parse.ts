import { vw } from '../../shared/text'
import { sourceLabel } from '../../shared/url'
import { parseInline } from '../prose'
import type { Run } from '../prose'
import { parseCited, sup } from '../research/cites'
import type { Numbering } from '../research/cites'

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

const SEP_CELL = /^\s*:?-+:?\s*$/
export const NUMBER: RegExp = /^[−+-]?[$€£¥]?\d[\d,]*(\.\d+)?\s*(%|[a-zA-Zµ]{1,3})?$/
export const MARK: RegExp = /^(✓|✗|—|-|–|yes|no)?$/i
const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$|^\d{1,2}:\d{2}(\s?[AP]M)?$/i
const PATH = /^[~.]?[\w.@~-]*[\\/][^\s]*$|^[\w.-]+\.[a-z0-9]{1,5}$/i

export const plain = (c: Cell): string =>
  c.runs
    .map(r => r.t)
    .join('')
    .trim()
const words = (s: string) => (s.length === 0 ? 0 : s.split(/\s+/).length)

export const isSeparator = (line: string): boolean => line.includes('|') && splitRow(line).every(c => SEP_CELL.test(c))

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
export const isPathCell = (c: Cell): boolean => c.runs.length === 1 && PATH.test(c.runs[0]?.t ?? '')

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

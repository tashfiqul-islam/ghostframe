// The answer on the left (spec 7.4 to 7.7): a text block's markdown as rows on the spine. The lead sentence bright,
// headings with their dim markers, bullets, numbered lists, task items, quotes, fenced code and diffs as code cards,
// pipe tables as table cards, a `Note:` paragraph as the note card, and the footnote lines. Pure.
import type { Part } from '../../shared/parts'
import { GLYPH } from '../../shared/look/glyphs'
import { TOKEN } from '../../shared/look/palette'
import { NO_LABEL, SPINE, spineOnly, spineRow } from '../../shared/look/spine'
import { graphemesOf, widthOf } from '../../shared/look/width'
import { remember } from '../../shared/held'
import { clipMiddle } from '../../shared/text'
import { codeCard, diffCard, isUnifiedDiff } from '../../shared/look/code'
import { inline } from './inline'
import { noteCard, tableCard } from './tables'

/**
 * How a block draws: the text column's width, whether its first sentence is the answer's lead, and the width a table,
 * code card or diff card may take (6.1), the text column's when not given.
 */
export type AnswerContext = { width: number; hasLead: boolean; blockWidth?: number }

/** A word wider than `room` cut into pieces that fit, by grapheme (as shared/look/wrap.ts does); its space stays last. */
function breakWord(word: Part, room: number): Part[] {
  if (widthOf(word.t.trimEnd()) <= room) return [word]

  const out: Part[] = []
  let t = ''

  for (const g of graphemesOf(word.t)) {
    if (t.length > 0 && g !== ' ' && widthOf(t + g) > room) {
      out.push({ ...word, t })
      t = ''
    }
    t += g
  }

  return t.length > 0 ? [...out, { ...word, t }] : out
}

/** Parts cut into rows of `width` cells by words, each part keeping its colour; a word wider than a row breaks. */
export function wrapParts(parts: readonly Part[], width: number): Part[][] {
  const words: Part[] = parts.flatMap(p => p.t.split(/(?<= )/).flatMap(t => breakWord({ ...p, t }, Math.max(1, width))))
  const rows: Part[][] = [[]]
  let used = 0

  for (const w of words) {
    const bare = w.t.trimEnd()

    if (used > 0 && used + widthOf(bare) > width) {
      const row = rows.at(-1) ?? []
      const last = row.at(-1)

      if (last !== undefined) row[row.length - 1] = { ...last, t: last.t.trimEnd() }
      rows.push([])
      used = 0
    }

    rows.at(-1)?.push(w)
    used += widthOf(w.t)
  }

  return rows.map(r => r.filter(p => p.t.length > 0))
}

/** A row of text-column parts on the spine. */
const onSpine = (parts: readonly Part[]): Part[] => spineRow(NO_LABEL, SPINE, parts)

/** A paragraph's rows: each source line is a row break, then words wrap at the width. The lead sentence is bright. */
function paragraph(text: string, width: number, hasLead: boolean, indent = 0): Part[][] {
  const lead = hasLead ? (/^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? '') : ''
  const parts = [...inline(lead, TOKEN.textBright), ...inline(text.slice(lead.length), TOKEN.text)]
  const lines = splitParts(parts)

  return lines.flatMap(line => wrapParts(line, width - indent).map(r => [...(indent > 0 ? [{ t: ' '.repeat(indent), color: TOKEN.dim }] : []), ...r]))
}

/** Parts split at their `\n`s into lines. */
function splitParts(parts: readonly Part[]): Part[][] {
  const lines: Part[][] = [[]]

  for (const p of parts) {
    const pieces = p.t.split('\n')

    pieces.forEach((t, i) => {
      if (i > 0) lines.push([])
      if (t.length > 0) lines.at(-1)?.push({ ...p, t: i > 0 ? t.trimStart() : t })
    })
  }

  return lines
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*(.*)$/
const HEADING_LINE = /^(#{1,6})\s+(.*)$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/
const TASK = /^\[([ xX])\]\s+/
const QUOTE = /^>\s?(.*)$/
// `Note:`, `**Note:**` or `**Note**:`; the colon is what makes it a note (`Note that …` is prose).
const NOTE = /^(?:\*\*)?Note(?::(?:\*\*)?|\*\*:)\s+(.*)$/i

/**
 * A text block's rows (7.4). Each element is separated as its source is: a blank line is one blank spine row.
 * @param text the block's markdown, whole (the engine never streams it, correction E)
 * @param ctx the text column's width and whether the block opens the answer
 * @returns the rows
 */
export function answerRows(text: string, ctx: AnswerContext): Part[][] {
  const key = `${ctx.width}|${ctx.blockWidth ?? ''}|${ctx.hasLead}|${text}`
  const had = laidOut.get(key)

  if (had !== undefined) return had
  const rows = layOut(text, ctx)

  remember(laidOut, key, rows, LAID_OUT_MAX)

  return rows
}

// Each answer's rows by width, laid out once: drawn again as the person scrolls, a row only looks them up. Pure, so
// the key is all it reads; as many as a long session's messages (transcript/citations.ts).
const LAID_OUT_MAX = 2_000
const laidOut = new Map<string, Part[][]>()

function layOut(text: string, ctx: AnswerContext): Part[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n')
  const out: Part[][] = []
  let hasLead = ctx.hasLead
  let i = 0
  const blank = () => {
    if (out.length > 0 && !isBlank(out.at(-1))) out.push(spineOnly())
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim().length === 0) {
      blank()
      i++
      continue
    }

    const fence = FENCE.exec(line)

    if (fence !== null) {
      const close = lines.findIndex((l, k) => k > i && l.trim().startsWith(fence[1] ?? '```'))
      const body = lines.slice(i + 1, close < 0 ? lines.length : close)
      const lang = fence[2] ?? ''
      const info = fence[3] ?? ''

      const wide = ctx.blockWidth ?? ctx.width

      out.push(...(lang === 'diff' || isUnifiedDiff(body) ? diffCard(body, info, wide) : codeCard(body, lang, info, wide)))
      i = close < 0 ? lines.length : close + 1
      continue
    }

    if (line.includes('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const end = lines.findIndex((l, k) => k > i && !l.includes('|'))
      const table = lines.slice(i, end < 0 ? lines.length : end)

      out.push(...tableCard(table, ctx.blockWidth ?? ctx.width))
      i = end < 0 ? lines.length : end
      continue
    }

    const heading = HEADING_LINE.exec(line)

    if (heading !== null) {
      out.push(onSpine([{ t: `${heading[1] ?? ''} `, color: TOKEN.dim }, ...inline(heading[2] ?? '', TOKEN.textBright).map(p => ({ ...p, bold: true }))]))
      hasLead = false
      i++
      continue
    }

    const note = NOTE.exec(line)

    if (note !== null) {
      const said = [note[1] ?? '']

      // Its lines up to a blank line or the next block (a fence keeps its code card).
      for (i++; i < lines.length && (lines[i] ?? '').trim().length > 0 && !startsBlock(lines[i] ?? '', lines[i + 1]); i++) said.push((lines[i] ?? '').trim())

      out.push(...noteCard(said.join(' '), ctx.width))
      continue
    }

    const bullet = BULLET.exec(line) ?? NUMBERED.exec(line)

    if (bullet !== null) {
      const isNumbered = NUMBERED.test(line)
      const depth = Math.floor((bullet[1] ?? '').length / 2)
      const item = (isNumbered ? bullet[3] : bullet[2]) ?? ''
      const mark: Part = isNumbered ? { t: bullet[2] ?? '', color: TOKEN.machine } : { t: GLYPH.bullet, color: TOKEN.machine }
      const task = TASK.exec(item)
      const body = task === null ? inline(item, TOKEN.text) : [taskMark(task[1] ?? ' '), ...inline(item.slice(task[0].length), TOKEN.text)]
      const indent = depth * 5
      const lead = widthOf(mark.t) + 2
      const rows = wrapParts(body, ctx.width - indent - lead)

      rows.forEach((r, k) =>
        out.push(
          onSpine([
            { t: ' '.repeat(indent), color: TOKEN.dim },
            k === 0 ? mark : { t: ' '.repeat(widthOf(mark.t)), color: TOKEN.dim },
            { t: '  ', color: TOKEN.dim },
            ...r
          ])
        )
      )
      hasLead = false
      i++
      continue
    }

    const quote = QUOTE.exec(line)

    if (quote !== null) {
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) {
        const said = QUOTE.exec(lines[i] ?? '')?.[1] ?? ''

        for (const r of wrapParts(inline(said, TOKEN.text), ctx.width - 2)) out.push(onSpine([{ t: `${GLYPH.quote} `, color: TOKEN.machine }, ...r]))
        i++
      }

      continue
    }

    // A paragraph: its lines up to the next blank line or block.
    const start = i

    while (i < lines.length && (lines[i] ?? '').trim().length > 0 && (i === start || !startsBlock(lines[i] ?? '', lines[i + 1]))) i++

    const para = lines.slice(start, i).join('\n')
    const parts = TASK.test(para) ? taskLine(para) : undefined

    out.push(...(parts === undefined ? paragraph(para, ctx.width, hasLead) : wrapParts(parts, ctx.width)).map(onSpine))
    hasLead = false
  }

  return out
}

/** A task item's box (7.4): `[x]` in ok, `[ ]` in dim. */
const taskMark = (mark: string): Part => (mark === ' ' ? { t: '[ ] ', color: TOKEN.dim } : { t: '[x] ', color: TOKEN.ok })

/** A line of task items, `[x] a · [ ] b`, each box in its colour. */
function taskLine(text: string): Part[] {
  return text.split(/(\[[ xX]\] )/).flatMap(piece => (TASK.test(piece) ? [taskMark(piece[1] ?? ' ')] : inline(piece, TOKEN.text)))
}

/** Whether a line starts a block of its own, ending the paragraph above it. */
function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING_LINE.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line) ||
    QUOTE.test(line) ||
    (line.includes('|') && /^\s*\|?\s*:?-{2,}/.test(next ?? ''))
  )
}

const isBlank = (row: readonly Part[] | undefined) =>
  row !== undefined &&
  row
    .map(p => p.t)
    .join('')
    .trimEnd() ===
    spineOnly()
      .map(p => p.t)
      .join('')

/** A cited source as a footnote line names it (7.4): its number, and its host and path. */
export type Footnote = { n: number; url: string }

// A footnote line Claude wrote, alone on its line: `[1]: https://…`, `[^1]: https://…`, `[1] https://…`, `[1]: url "Title"`,
// `[1] Title — url`; markdown around the URL dropped.
const FOOTNOTE_LINE = /^\s*\[\^?(\d+)\]:?\s+(?:\S.*?\s+[—–-]\s+)?[*_`<]*(https?:\/\/[^\s*_`>]+)[*_`>]*(?:\s+"[^"]*")?\s*$/

/**
 * The footnotes Claude wrote (7.4): its own `[n]` reference lines, taken out of the prose and drawn as footnote lines.
 * A bare URL or a link is the answer's text and numbers nothing.
 * @param text the answer's markdown
 * @returns the prose without the reference lines, and the footnotes in number order
 */
export function claudeFootnotes(text: string): { body: string; notes: Footnote[] } {
  const had = footnoted.get(text)

  if (had !== undefined) return had
  const split = splitFootnotes(text)

  remember(footnoted, text, split, LAID_OUT_MAX)

  return split
}

const footnoted = new Map<string, { body: string; notes: Footnote[] }>()

function splitFootnotes(text: string): { body: string; notes: Footnote[] } {
  const notes: Footnote[] = []
  const kept = text.split('\n').filter(line => {
    const m = FOOTNOTE_LINE.exec(line)

    if (m === null) return true
    notes.push({ n: Number(m[1]), url: m[2] ?? '' })

    return false
  })

  return notes.length === 0 ? { body: text, notes } : { body: kept.join('\n').trimEnd(), notes: notes.toSorted((a, b) => a.n - b.n) }
}

/** The cells a footnote takes before the next one on its row. */
const FOOTNOTE_CELLS = 31

/**
 * The footnote lines at the end of the answer (7.4): two per row, `[1] bun.sh/blog/bun-v1.4.2`, the number in
 * `machine` and the host and path in `link`.
 * @param notes the cited sources, in number order
 * @param width the text column's cells
 * @returns the rows
 */
export function footnoteRows(notes: readonly Footnote[], width: number): Part[][] {
  const label = (f: Footnote) =>
    f.url
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
  const full = (f: Footnote) => widthOf(`[${f.n}] ${label(f)}`)
  // A footnote in `cells`, its host and path cut in the middle when it does not fit: never dropped (B7).
  const entry = (f: Footnote, cells: number): Part[] => [
    { t: `[${f.n}]`, color: TOKEN.machine },
    { t: ` ${clipMiddle(label(f), Math.max(1, cells - widthOf(`[${f.n}] `)))}`, color: TOKEN.link }
  ]
  const rows: Part[][] = []

  for (let k = 0; k < notes.length; k += 2) {
    const [a, b] = notes.slice(k, k + 2)

    if (a === undefined) break
    if (b === undefined) {
      rows.push(onSpine(entry(a, width)))
      continue
    }

    // The second keeps its whole width up to half the row; the first takes the rest, 3 cells apart at the least.
    const second = Math.min(full(b), Math.max(Math.floor((width - 3) / 2), width - 3 - full(a)))
    const first = Math.min(full(a), width - 3 - second)
    const gap = Math.max(3, Math.min(FOOTNOTE_CELLS - first, width - first - second))

    rows.push(onSpine([...entry(a, first), { t: ' '.repeat(gap), color: TOKEN.dim }, ...entry(b, second)]))
  }

  return rows
}

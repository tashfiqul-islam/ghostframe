// The answer on the left (spec 7.4 to 7.7): a text block's markdown as rows on the spine. The lead sentence bright,
// headings with their dim markers, bullets, numbered lists, task items, quotes, fenced code and diffs as code cards,
// pipe tables as table cards, a `Note:` paragraph as the note card, and the footnote lines. Pure.
import type { Part } from '../../shared/parts'
import { GLYPH } from '../../shared/look/glyphs'
import { TOKEN } from '../../shared/look/palette'
import { NO_LABEL, SPINE, spineOnly, spineRow } from '../../shared/look/spine'
import { vw } from '../../shared/text'
import { codeCard, diffCard, isUnifiedDiff } from './code'
import { inline } from './inline'
import { noteCard, tableCard } from './tables'

/** How a block draws: the text column's width, and whether its first sentence is the answer's lead. */
export type AnswerContext = { width: number; hasLead: boolean }

/** Parts cut into rows of `width` cells by words, each part keeping its colour. */
export function wrapParts(parts: readonly Part[], width: number): Part[][] {
  const words: Part[] = parts.flatMap(p => p.t.split(/(?<= )/).map(t => ({ ...p, t })))
  const rows: Part[][] = [[]]
  let used = 0

  for (const w of words) {
    const bare = w.t.trimEnd()

    if (used > 0 && used + vw(bare) > width) {
      const row = rows.at(-1) ?? []
      const last = row.at(-1)

      if (last !== undefined) row[row.length - 1] = { ...last, t: last.t.trimEnd() }
      rows.push([])
      used = 0
    }

    rows.at(-1)?.push(w)
    used += vw(w.t)
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
const NOTE = /^(?:\*\*)?Note:?(?:\*\*)?:?\s+(.*)$/i

/**
 * A text block's rows (7.4). Each element is separated as its source is: a blank line is one blank spine row.
 * @param text the block's markdown, whole (the engine never streams it, correction E)
 * @param ctx the text column's width and whether the block opens the answer
 * @returns the rows
 */
export function answerRows(text: string, ctx: AnswerContext): Part[][] {
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

      out.push(...(lang === 'diff' || isUnifiedDiff(body) ? diffCard(body, info, ctx.width) : codeCard(body, lang, info, ctx.width)))
      i = close < 0 ? lines.length : close + 1
      continue
    }

    if (line.includes('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const end = lines.findIndex((l, k) => k > i && !l.includes('|'))
      const table = lines.slice(i, end < 0 ? lines.length : end)

      out.push(...tableCard(table, ctx.width))
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

      for (i++; i < lines.length && (lines[i] ?? '').trim().length > 0; i++) said.push((lines[i] ?? '').trim())

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
      const lead = vw(mark.t) + 2
      const rows = wrapParts(body, ctx.width - indent - lead)

      rows.forEach((r, k) =>
        out.push(
          onSpine([
            { t: ' '.repeat(indent), color: TOKEN.dim },
            k === 0 ? mark : { t: ' '.repeat(vw(mark.t)), color: TOKEN.dim },
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
  const rows: Part[][] = []

  for (let k = 0; k < notes.length; k += 2) {
    const pair = notes.slice(k, k + 2)
    const parts: Part[] = []

    pair.forEach((f, j) => {
      const t = `[${f.n}] ${label(f)}`

      if (j > 0) parts.push({ t: ' '.repeat(Math.max(3, FOOTNOTE_CELLS - vw(`[${pair[0]?.n ?? 0}] ${label(pair[0] ?? f)}`))), color: TOKEN.dim })
      parts.push({ t: `[${f.n}]`, color: TOKEN.machine }, { t: t.slice(`[${f.n}]`.length), color: TOKEN.link })
    })

    rows.push(onSpine(fitWidth(parts, width)))
  }

  return rows
}

/** Parts cut to `width` cells. */
function fitWidth(parts: readonly Part[], width: number): Part[] {
  const out: Part[] = []
  let used = 0

  for (const p of parts) {
    if (used + vw(p.t) <= width) {
      out.push(p)
      used += vw(p.t)
    }
  }

  return out
}

import { sourceLabel } from '../../shared/url'
import { parseInline } from '../prose'
import type { Run } from '../prose'

// ─── Research (DESIGN.md §5.13 under §0.1 r7) ────────────────────────────────
// Inline links in a paragraph become blue superscript markers; under the paragraph,
// one dim footnote line `┄┄┄┄ ¹ host/path   ² host/path`, each a real link. More than
// four sources → a [ SOURCES ] frame instead. Numbers run through the whole message,
// so an earlier paragraph never changes when a later one streams in.

export type Cite = { n: number; url: string; title: string }

/** Numbers handed out so far in one message, by URL. */
export type Numbering = Map<string, number>

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
// oxlint-disable-next-line typescript/no-misused-spread -- code points on purpose: width is measured per code point until grapheme segmentation lands
export const sup = (n: number): string => [...String(n)].map(d => SUP[Number(d)] ?? d).join('')

// `[label](https://…)`, one level of parentheses allowed inside the URL.
const LINK = /\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)/g
const MARK = /[\uE000-\uE0FF]/
// `owner/repo#123 (https://\u2026)` \u2192 `owner/repo#123\u00B9`
// The lookbehinds start a match only where a word or a space run begins, so a long word or
// run of spaces is scanned once, not once per character.
const REPO_REF = /(?<![\w.-])([\w.-]+\/[\w.-]+#\d+)\s*\((https?:\/\/[^\s()]+)\)/g
// `\u2026 word (https://\u2026)` \u2192 `\u2026 word\u00B9`
const PAREN_URL = /(?<!\s)\s*\((https?:\/\/[^\s()]+)\)/g
// `<https://\u2026>` and a bare `https://\u2026` \u2192 its host, then the marker
const AUTOLINK = /<(https?:\/\/[^\s<>]+)>/g
const BARE_URL = /https?:\/\/[^\s<>()[\]`]+/g

const numberOf = (numbering: Numbering, url: string) => {
  const had = numbering.get(url)

  if (had !== undefined) return had

  const n = numbering.size + 1
  numbering.set(url, n)

  return n
}

/**
 * A paragraph with inline links, as runs with `cite` markers and the paragraph's own
 * sources (first-cited order, each once). Anything else in it that we don't lay out
 * ourselves → undefined, and the engine draws the paragraph.
 */
export function parseCited(text: string, numbering: Numbering): { runs: Run[]; cites: Cite[] } | undefined {
  // An image (`![alt](url)`) is not a link: the engine draws it.
  if (/!\[/.test(text.replace(/(`+)[^`]+?\1/g, ''))) return undefined
  // A character already in the marker range (a Nerd Font glyph) would bind to a link.
  if (MARK.test(text)) return undefined

  const links: { title: string; url: string }[] = []
  const mark = (title: string, url: string) => {
    links.push({ title: title.replace(/[*_`]/g, '').trim(), url })

    return String.fromCharCode(0xe000 + links.length - 1)
  }
  // Outside code spans only: a URL in backticks stays code.
  const marked = text
    .split(/((`+)[^`]+?\2)/)
    // split → [text, code span, its backtick run, text, …]
    .map((piece, i) => {
      if (i % 3 === 2) return ''
      if (i % 3 === 1) return piece

      return piece
        .replace(LINK, (_, label: string, url: string) => `${label}${mark(label, url)}`)
        .replace(REPO_REF, (_, ref: string, url: string) => `${ref}${mark(ref, url)}`)
        .replace(PAREN_URL, (_, url: string) => mark(sourceLabel(url), url))
        .replace(AUTOLINK, (_, url: string) => `${sourceLabel(url)}${mark(sourceLabel(url), url)}`)
        .replace(BARE_URL, (raw: string) => {
          const url = raw.replace(/[.,;:!?'"]+$/, '')

          return `${sourceLabel(url)}${mark(sourceLabel(url), url)}${raw.slice(url.length)}`
        })
    })
    .join('')

  if (links.length === 0 || links.length > 0xff) return undefined

  const runs = parseInline(marked)

  if (runs === undefined || runs.some(r => r.s === 'code' && MARK.test(r.t))) return undefined

  const pieces: (Run | { link: { title: string; url: string } })[] = []

  for (const r of runs) {
    for (const piece of r.t.split(/([\uE000-\uE0FF])/)) {
      if (piece.length === 0) continue

      if (MARK.test(piece)) {
        const link = links[piece.charCodeAt(0) - 0xe000]

        if (link === undefined) return undefined
        pieces.push({ link })
      } else {
        pieces.push({ t: piece, s: r.s })
      }
    }
  }

  // Numbers only once the whole paragraph parsed: a paragraph left to the engine takes none.
  const out: Run[] = []
  const cites: Cite[] = []

  for (const p of pieces) {
    if (!('link' in p)) {
      out.push(p)
      continue
    }

    const n = numberOf(numbering, p.link.url)

    out.push({ t: sup(n), s: 'cite' })
    if (!cites.some(c => c.n === n)) cites.push({ n, url: p.link.url, title: p.link.title })
  }

  return { runs: out, cites }
}

/** True when the text is a paragraph `parseCited` can lay out. */
export const isCited = (text: string): boolean => parseCited(text, new Map()) !== undefined

/**
 * The text up to an inline link still being written (`see [post](https://bun.co`):
 * everything before its `[` (and a `(` right before it), so the paragraph draws as the
 * same kind of block before the link closes as after. Text without one comes back as is.
 */
export function cutOpenLink(s: string): string {
  const at = s.lastIndexOf('[')

  if (at < 0) return s

  const rest = s.slice(at)

  // Still open: `[text` (no `]` yet), `[text]` at the very end, or `[text](url` (no `)`).
  // Anything else (a whole link, `[ TITLE ]` in a figure, a bracket in prose) stays.
  if (!/^\[[^\]]*$|^\[[^\]]*\]$|^\[[^\]]*\]\([^)]*$/.test(rest)) return s

  return s
    .slice(0, at)
    .replace(/\s*\($/, '')
    .trimEnd()
}

export function sourcesCites(items: readonly { title: string; url: string }[], numbering: Numbering): Cite[] {
  const out: Cite[] = []

  for (const it of items) {
    const n = numberOf(numbering, it.url)

    if (!out.some(c => c.n === n)) out.push({ n, url: it.url, title: it.title })
  }

  return out
}

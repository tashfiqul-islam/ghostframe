import { G } from './shared/layout'
import type { Part } from './shared/parts'
import { clip, clipMiddle, pad, vw } from './shared/text'
import { C } from './shared/tokens'
import { sourceLabel } from './shared/url'
import { parseInline } from './prose'
import type { Run } from './prose'
import { frameLines } from './states'

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
export const sup = (n: number) => [...String(n)].map(d => SUP[Number(d)] ?? d).join('')

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
export const isCited = (text: string) => parseCited(text, new Map()) !== undefined

// A `Sources:` list: the label line, then one link per item (an optional ` — note` after).
const SOURCES_LABEL = /^\s{0,3}(?:#{1,6}\s+)?(?:\*\*|__)?sources?:?(?:\*\*|__)?:?\s*$/i
const SOURCE_ITEM = /^\s{0,3}(?:[-*+]|\d+[.)])\s+\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)\s*(?:[-–—:·]\s*.*)?$/

export const isSourcesLabel = (line: string) => SOURCES_LABEL.test(line)

/** A block's lines as a sources list (label optional when `labelled` says the line above was it). */
export function sourceItems(lines: readonly string[], labelled: boolean): { title: string; url: string }[] | undefined {
  const body = lines.length > 0 && isSourcesLabel(lines[0] ?? '') ? lines.slice(1) : labelled ? lines : undefined

  if (body === undefined || body.length === 0) return undefined

  const items: { title: string; url: string }[] = []

  for (const l of body) {
    const m = SOURCE_ITEM.exec(l)

    if (m === null) return undefined
    items.push({ title: (m[1] ?? '').replace(/[*_`]/g, '').trim(), url: m[2] ?? '' })
  }

  return items
}

/**
 * A Sources list still streaming (the reply's last block): its label, then whole items,
 * then at most one item still being written. Its whole items, the one being written left
 * out until it is whole; `[]` for the label alone. Anything else → undefined.
 * The list then draws the same way while it streams as once it's done, never as a
 * paragraph or a plain list on the way (§6: a drawn row never changes).
 */
export function pendingSourceItems(lines: readonly string[], labelled: boolean): { title: string; url: string }[] | undefined {
  const body = lines.length > 0 && isSourcesLabel(lines[0] ?? '') ? lines.slice(1) : labelled ? lines : undefined

  if (body === undefined) return undefined

  const last = body[body.length - 1]
  const whole = last !== undefined && SOURCE_ITEM.test(last) ? body : body.slice(0, -1)

  // The line being written must look like the start of another item.
  if (whole.length < body.length && !/^\s{0,3}(?:[-*+]|\d+[.)])(\s|$)/.test(last ?? '')) return undefined

  return whole.length === 0 ? [] : sourceItems(whole, true)
}

/** A line that may still become a Sources label as it streams (`S`, `Sour`, `**Sources`). */
export const isSourcesLabelPrefix = (line: string) => /^\s{0,3}(?:#{1,6}\s+)?(?:\*\*|__)?s(?:o(?:u(?:r(?:c(?:e(?:s)?)?)?)?)?)?:?(?:\*\*|__)?:?\s*$/i.test(line)

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

const SLUG_LABEL = /^(.+?) · (.+)$/

/**
 * The longest head of a `host · slug` label that fits `n` cells, no ellipsis: the host
 * whole, the slug cut at its last hyphen or underscore (a hard cut when it has none in
 * reach), no separator left at the end. Any other label → undefined.
 */
function cutSlug(label: string, n: number): string | undefined {
  const m = SLUG_LABEL.exec(label)

  if (m === null) return undefined

  const head = `${m[1]} · `
  const room = n - vw(head)

  if (room < 3) return undefined

  let slug = ''

  for (const ch of m[2] ?? '') {
    if (vw(slug + ch) > room) break
    slug += ch
  }

  const rest = (m[2] ?? '').slice(slug.length)

  if (rest.length > 0 && !/^[-_]/.test(rest)) {
    const at = Math.max(slug.lastIndexOf('-'), slug.lastIndexOf('_'))

    if (at > 0) slug = slug.slice(0, at)
  }

  slug = slug.replace(/[-_.]+$/, '')

  return slug.length > 0 ? head + slug : undefined
}

/** A URL label's head for a clipped run (tables): see `cutSlug`; other labels cut hard. */
export function cutLabel(label: string, n: number): string {
  const slug = cutSlug(label, n)

  if (slug !== undefined) return slug

  let out = ''

  for (const ch of label) {
    if (vw(out + ch) > n) break
    out += ch
  }

  return out
}

/**
 * A URL label at `n` cells (§0.2 URLs): `host · slug` keeps its host and clips the slug at
 * the end, at a word boundary, then `…`. `repo#123`, `owner/repo` and a bare host (or a host
 * too wide for any slug) clip in the middle, so the issue number or the host's end stays.
 */
export function clipLabel(label: string, n: number): string {
  if (vw(label) <= n) return label

  const slug = cutSlug(label, n - 1)

  return slug === undefined ? clipMiddle(label, n) : `${slug}…`
}

// Titles that name the kind of page, not the page: they get the URL's last part beside them.
const GENERIC_TITLE = /^(post|page|here|link|docs|release notes|article|blog|source)$/i

/**
 * A source's title as a list shows it: a generic title (`post`, `docs`, the bare host…) or
 * one used by another source in the same list → `<title> · <last part of its URL label>`
 * (`post · bun-v1.4.4`). A unique, specific title is unchanged.
 */
export function sourceTitle(c: Cite, all: readonly Cite[]): string {
  return titled(c, all.filter(x => titleKey(x.title) === titleKey(c.title)).length > 1)
}

/** Every source's list title, in order: `sourceTitle` for each, the titles counted once. */
export function sourceTitles(all: readonly Cite[]): string[] {
  const counts = all.reduce((m, x) => m.set(titleKey(x.title), (m.get(titleKey(x.title)) ?? 0) + 1), new Map<string, number>())

  return all.map(c => titled(c, (counts.get(titleKey(c.title)) ?? 0) > 1))
}

const titleKey = (title: string) => title.trim().toLowerCase()

/** `c`'s list title; `repeated`: another source in the list has the same title. */
function titled(c: Cite, repeated: boolean): string {
  const title = c.title.trim()
  const key = title.toLowerCase()
  const label = sourceLabel(c.url)
  const host = label.split(' · ')[0] ?? label
  const short = label.split(' · ').pop() ?? label
  const generic = GENERIC_TITLE.test(title) || key.replace(/^www\./, '') === host.toLowerCase()

  return (generic || repeated) && short.toLowerCase() !== key ? `${title} · ${short}` : title
}

const NOTE_LEAD = `${G.hEdge.repeat(4)} `
const NOTE_GAP = '   '
const NOTE_MIN = 12 // the narrowest entry worth its own room: `¹ ` and about ten cells of address

/**
 * The footnote lines for one block, each at most `width` cells:
 * `┄┄┄┄ ¹ host/path   ² host/path`. Every marker the block uses is listed, the first
 * block to use a source and any later one alike: entries share a line evenly while
 * each keeps `NOTE_MIN` cells, and the rest go to further lines under the first.
 * `byTitle`: name a source by its title (a Sources list) instead of its address.
 * `href` keeps the whole URL; the line itself draws only the short label.
 */
export function footnoteLines(cites: readonly Cite[], width: number, byTitle = false): Part[][] {
  const lead = vw(NOTE_LEAD)
  const perLine = Math.max(1, Math.floor((width - lead + vw(NOTE_GAP)) / (NOTE_MIN + vw(NOTE_GAP))))
  const lines: Part[][] = []
  const titles = byTitle ? sourceTitles(cites) : []

  for (let at = 0; at < cites.length; at += perLine) {
    const chunk = cites.slice(at, at + perLine)
    const share = Math.floor((width - lead - vw(NOTE_GAP) * (chunk.length - 1)) / chunk.length)
    const parts: Part[] = [{ t: at === 0 ? NOTE_LEAD : ' '.repeat(lead), color: C.hairline }]

    chunk.forEach((c, i) => {
      const title = titles[at + i] ?? c.title
      // `n` 0: a source with no marker (a Sources list item): a dim `·`, not a number.
      const mark = c.n > 0 ? `${sup(c.n)} ` : '· '
      // A URL's label clips in the middle (it ends on its most specific part); a title at a word.
      const text = byTitle ? clip(title, Math.max(1, share - vw(mark))) : clipLabel(sourceLabel(c.url), Math.max(1, share - vw(mark)))

      if (i > 0) parts.push({ t: NOTE_GAP, color: C.dim })
      // Link colour on the marker only; the label is muted (§0.2 URLs).
      parts.push({ t: mark, color: c.n > 0 ? C.link : C.dim }, { t: text, color: C.muted, href: c.url })
    })
    lines.push(parts)
  }

  return lines
}

/**
 * `[ SOURCES ]`: `n  title  address` for each cited source, by its marker's number, then
 * any source a Sources list named but no marker cites (`listed`), with a dim `·` for its
 * number: every number in the frame is a marker on screen. Meta `N cited` (`· M listed`).
 */
export function sourcesFrame(cites: readonly Cite[], width: number, listed: readonly { url: string; title: string }[] = []): Part[][] {
  const inner = width - 4
  const all: Cite[] = [...cites, ...listed.map(l => ({ n: 0, url: l.url, title: l.title }))]
  // Reduced, not spread: `Math.max(...xs)` overflows the stack on a long list.
  const noW = cites.reduce((w, c) => Math.max(w, String(c.n).length), 1)
  const titles = sourceTitles(all)
  const titleW = Math.min(
    titles.reduce((w, t) => Math.max(w, vw(t)), 8),
    Math.floor(inner * 0.4)
  )
  const urlW = Math.max(6, inner - noW - 2 - titleW - 2)
  const rows: Part[][] = all.map((c, i) => [
    c.n > 0 ? { t: `${pad(String(c.n), noW, 'right')}  `, color: C.link } : { t: `${pad('·', noW, 'right')}  `, color: C.dim },
    { t: `${pad(titles[i] ?? c.title, titleW)}  `, color: c.n > 0 ? C.textBright : C.muted },
    { t: clipLabel(sourceLabel(c.url), urlW), color: C.muted, href: c.url }
  ])
  const meta = [cites.length > 0 ? `${cites.length} cited` : '', listed.length > 0 ? `${listed.length} listed` : ''].filter(x => x.length > 0).join(G.sep)

  return frameLines(width, 'SOURCES', { t: meta, color: C.muted }, rows)
}

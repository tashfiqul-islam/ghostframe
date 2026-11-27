import { G } from './layout'
import { graphemesOf, widthOf } from './look/width'

// ─── Visible width (ANSI-free text): look/width.ts measures grapheme clusters, emoji at their real width ───

/** The cells one grapheme cluster takes (`graphemesOf` splits a string into them). */
export const cellWidth = (cluster: string): number => widthOf(cluster)

export const vw = (s: string): number => widthOf(s)

// What may never sit right before a `…`: spaces and punctuation (no `.…`, `,…`, ` …`).
const TRAIL = /[\s.,;:!?·…—–\-/]+$/u
// A cut that would lose more than this share of the room to reach a word boundary cuts
// inside the word instead (one long word, a hash, a host).
const WORD_KEEP = 0.6

/**
 * The longest head of `s` that fits `n` cells, ending on a word boundary when that keeps
 * most of the room, with trailing spaces and punctuation dropped. No ellipsis.
 */
export function cutWords(s: string, n: number): string {
  const chars = graphemesOf(s)
  let out = ''
  let w = 0
  let i = 0

  for (; i < chars.length; i++) {
    const cw = cellWidth(chars[i] ?? '')

    if (w + cw > n) break

    out += chars[i]
    w += cw
  }

  // Cut inside a word: back to the space before it, if that keeps enough of the room.
  if (i < chars.length && !/\s/.test(chars[i] ?? '')) {
    const space = out.search(/\s\S*$/)

    if (space > 0 && vw(out.slice(0, space)) >= Math.ceil(n * WORD_KEEP)) out = out.slice(0, space)
  }

  const trimmed = out.replace(TRAIL, '')

  return trimmed.length > 0 ? trimmed : out
}

/**
 * Clip to `n` cells, ending in `…` when cut: at a word boundary, never after punctuation
 * (§0.2). Never returns wider than `n`. Paths and URLs use `clipMiddle` / `clipPath`.
 */
export function clip(s: string, n: number): string {
  if (n <= 0) {
    return ''
  }

  if (vw(s) <= n) {
    return s
  }

  return cutWords(s, n - 1) + G.ellipsis
}

/** The old hard cut, kept for `clipMiddle`'s two halves (paths keep their exact characters). */
function hardClip(s: string, n: number): string {
  if (n <= 0) {
    return ''
  }

  if (vw(s) <= n) {
    return s
  }

  let out = ''
  let w = 0

  for (const ch of graphemesOf(s)) {
    const cw = cellWidth(ch)

    if (w + cw > n - 1) {
      break
    }

    out += ch
    w += cw
  }

  return out + G.ellipsis
}

/** Clip in the middle (paths): `src/…/ProductSearch.tsx`. */
export function clipMiddle(s: string, n: number): string {
  if (vw(s) <= n) {
    return s
  }

  if (n <= 2) {
    return hardClip(s, n)
  }

  const chars = graphemesOf(s)
  const keep = n - 1
  const tail = Math.ceil(keep / 2)
  let head = ''
  let hw = 0

  for (const ch of chars) {
    if (hw + cellWidth(ch) > keep - tail) {
      break
    }

    head += ch
    hw += cellWidth(ch)
  }

  let end = ''
  let ew = 0

  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i] ?? ''

    if (ew + cellWidth(ch) > keep - hw) {
      break
    }

    end = ch + end
    ew += cellWidth(ch)
  }

  return head + G.ellipsis + end
}

/** Clip then pad to exactly `n` cells. */
export function pad(s: string, n: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const c = clip(s, n)
  const gap = n - vw(c)

  if (gap <= 0) {
    return c
  }

  if (align === 'right') {
    return ' '.repeat(gap) + c
  }

  if (align === 'center') {
    const l = Math.floor(gap / 2)

    return ' '.repeat(l) + c + ' '.repeat(gap - l)
  }

  return c + ' '.repeat(gap)
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** A footnote mark, `¹²`: the answer's, the left's Sources frame and Cockpit's `[ SOURCES ]` all number with it. */
// oxlint-disable-next-line typescript/no-misused-spread -- code points on purpose: width is measured per code point until grapheme segmentation lands
export const sup = (n: number): string => [...String(n)].map(d => SUP[Number(d)] ?? d).join('')

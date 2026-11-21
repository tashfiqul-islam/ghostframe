import { G } from './layout'

// ─── Visible width (ANSI-free text; wide = 2, combining = 0) ────────────────
// oxlint-disable-next-line eslint/no-misleading-character-class -- the class lists zero-width code points one by one; each is tested alone, never as a sequence
const ZERO = /[\p{M}\u{200b}-\u{200f}\u{2060}\u{fe00}-\u{fe0f}]/u
const WIDE =
  /[\u{1100}-\u{115f}\u{2e80}-\u{303e}\u{3041}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{a000}-\u{a4cf}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe30}-\u{fe4f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]/u

export function cellWidth(ch: string): number {
  if (ZERO.test(ch)) {
    return 0
  }

  return WIDE.test(ch) ? 2 : 1
}

export function vw(s: string): number {
  let w = 0

  for (const ch of s) {
    w += cellWidth(ch)
  }

  return w
}

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
  // oxlint-disable-next-line typescript/no-misused-spread -- code points on purpose: width is measured per code point until grapheme segmentation lands
  const chars = [...s]
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

  for (const ch of s) {
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

  // oxlint-disable-next-line typescript/no-misused-spread -- code points on purpose: width is measured per code point until grapheme segmentation lands
  const chars = [...s]
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

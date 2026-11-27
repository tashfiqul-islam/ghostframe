// Cockpit's own measure of a string's terminal cells (spec sections 6 and 13.5): how many columns a
// string takes once drawn, so rows, rules and padding line up without trusting a terminal library.

// OSC first (it may end in ESC \), then CSI, then any other two-character escape.
// oxlint-disable-next-line eslint/no-control-regex -- ESC and BEL are the point: this strips terminal escapes
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/g

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Cf holds U+200B-U+200D, U+2060 and U+FEFF; M holds the variation selectors; Cc holds C0 and C1.
const ZERO_WIDTH = /^[\p{M}\p{Cf}\p{Cc}]+$/u
const FLAG = /^\p{Regional_Indicator}\p{Regional_Indicator}$/u
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}/u

const VS15 = '\uFE0E'
const VS16 = '\uFE0F'
const KEYCAP = '\u20E3'
const ZWJ = '\u200D'

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd]
]

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

function clusterCells(cluster: string): number {
  if (ZERO_WIDTH.test(cluster)) return 0
  // VS15 asks for text presentation, which terminals draw in one cell.
  if (cluster.includes(VS15)) return 1
  // VS16, a keycap, a flag or a ZWJ emoji sequence each draw as one two-cell emoji.
  if (cluster.includes(VS16) || cluster.includes(KEYCAP) || FLAG.test(cluster)) return 2
  if (cluster.includes(ZWJ) && PICTOGRAPHIC.test(cluster)) return 2
  // A default-emoji base, with or without a skin-tone modifier, is two cells.
  if (EMOJI_PRESENTATION.test(cluster)) return 2
  const first = cluster.codePointAt(0)
  if (first === undefined) throw new Error('cells: the grapheme segmenter returned an empty cluster')
  return WIDE.some(([lo, hi]) => first >= lo && first <= hi) ? 2 : 1
}

/**
 * Code points that, standing alone, take one cell and never join a neighbour into one cluster: printable ASCII, Latin-1
 * and Latin Extended-A/B without the soft hyphen, general punctuation without its zero-width, bidi and separator marks,
 * superscripts and subscripts, box drawing and block elements. tests/shared/look/width.test.ts checks every one.
 */
export const ONE_CELL_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0x24f],
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x2070, 0x209f],
  [0x2500, 0x259f]
]

const hex = (cp: number): string => `\\u${cp.toString(16).padStart(4, '0')}`

// A string made only of those: one cell and one cluster per UTF-16 unit, as every range is below U+10000. Most text is
// only this, and segmenting it costs about 30 times as much, which is every row of every redraw.
const ONE_CELL = new RegExp(`^[${ONE_CELL_RANGES.map(([lo, hi]) => `${hex(lo)}-${hex(hi)}`).join('')}]*$`, 'u')

/** The grapheme clusters of `s`: what a terminal draws as one character, so a cut never splits one. */
export function graphemesOf(s: string): string[] {
  if (ONE_CELL.test(s)) return s.split('')

  return Array.from(graphemes.segment(s), g => g.segment)
}

export function widthOf(s: string): number {
  return ONE_CELL.test(s) ? s.length : segmentedWidth(s)
}

/** `widthOf` without its fast path: the full measure, which the fast path must always agree with. */
export function segmentedWidth(s: string): number {
  let total = 0
  for (const { segment } of graphemes.segment(stripAnsi(s))) total += clusterCells(segment)
  return total
}

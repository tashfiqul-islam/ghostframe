// Cockpit v8's glyphs (spec section 4): one meaning each, and every glyph Cockpit draws is named here.

export const GLYPH = {
  turn: '◆',
  ok: '✓',
  fail: '×',
  needs: '!',
  blocked: '⊘',
  agent: '◇',
  live: '●',
  notice: '●',
  thought: '∴',
  you: '❯',
  added: '↳',
  queued: '⋯',
  toAgent: '›',
  bullet: '›',
  current: '▸',
  open: '○',
  shipped: '↗',
  slash: '/',
  note: '▲',
  next: '→',
  interrupted: '◼',
  folded: '┊',
  spine: '│',
  branch: '├',
  last: '└',
  bar: '━',
  barEnd: '╸',
  barStart: '╺',
  tick: '┬',
  rule: '─',
  edgeTop: '▄',
  edgeBottom: '▀',
  pillStart: '▐',
  pillEnd: '▌',
  change: '■',
  wrapped: '↩',
  quote: '▏',
  denied: '▍',
  uncited: '·',
  ellipsis: '…',
  minus: '−',
  sep: ' · '
} as const

/** The live line's spinner (section 4), one frame every 100 ms, on the left only. */
export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

/** The sparkline's levels, lowest first (8.2). */
export const SPARK = '▁▂▃▄▅▆▇█'

/** The braille trace's levels, lowest first (7.3, 7.12). */
export const TRACE = '⣀⣠⣤⣴⣶⣾⣿'

/** The superscript digits a cited source is numbered with (8.7). */
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/**
 * A cited source's number as superscript digits: 1 is `¹`, 12 is `¹²`.
 * @param n the number
 * @returns the digits
 */
export function superscript(n: number): string {
  return String(n)
    .split('')
    .map(d => SUP[Number(d)] ?? d)
    .join('')
}

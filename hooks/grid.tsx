import type { Elements } from 'claude-code'

// Colours live in ./tokens (one source); re-exported here, where the grid helpers are.
import { C } from './tokens'

export { C }

// ─── Glyphs (DESIGN.md §3) — all one cell in Geist Mono ─────────────────────
export const G = {
  cross: '+',
  hEdge: '┄',
  vEdge: '┆',
  spine: '│',
  branch: '├─',
  last: '└─',
  hang: '╰─',
  done: '●',
  running: '◐',
  interrupted: '◌',
  denied: '✕',
  ask: '◇', // waiting for your permission (amber)
  rail: '▎',
  ok: '✓',
  fail: '✗',
  ellipsis: '…',
  sep: ' · ' // one separator rhythm everywhere (§0.2): footer, tally, notices, status line
} as const

// ─── Grid (DESIGN.md §0.1 r3, r4) ────────────────────────────────────────────
export const GUTTER = 12 // `you` / `claude` column; content starts here
export const RULE_LEAD = 13 // ┄ cells between the rule's `+` and its time label
export const MAX_MEASURE = 96

/** One content width for prose, mini rules, frames, footnotes: min(96, viewport − 14). */
export function measure(columns: number | undefined): number | undefined {
  if (columns === undefined || !Number.isFinite(columns)) {
    return undefined
  }

  const m = Math.min(MAX_MEASURE, Math.floor(columns) - 14)

  return m >= 20 ? m : undefined
}

// ─── Narrow terminals (DESIGN.md §4 "Narrow", §5.18) ─────────────────────────
// Under 100 columns the gutter folds: `you` / `claude` become a caption line above
// the block, and content takes the full width less a 2-column inset.
export const NARROW_BELOW = 100
export const INSET = 2

/** Where content sits: its width, the columns to its left, and whether the gutter folded. */
export type Lay = { width: number; gutter: number; narrow: boolean }

export function layout(columns: number | undefined): Lay | undefined {
  if (columns === undefined || !Number.isFinite(columns)) {
    return undefined
  }

  if (columns < NARROW_BELOW) {
    const width = Math.floor(columns) - INSET

    return width >= 20 ? { width, gutter: INSET, narrow: true } : undefined
  }

  const width = measure(columns)

  return width === undefined ? undefined : { width, gutter: GUTTER, narrow: false }
}

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

// ─── Formats (DESIGN.md §6, r10) ─────────────────────────────────────────────
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return ''
  }

  if (ms < 10_000) {
    const s = ms / 1000

    return s < 1 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
  }

  const s = Math.round(ms / 1000)

  if (s < 60) {
    return `${s}s`
  }

  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return ''
  }

  const v = n < 1000 ? `${Math.round(n)}` : n < 1_000_000 ? `${trim1(n / 1000)}k` : `${trim1(n / 1_000_000)}M`

  return `${v} tokens`
}

const trim1 = (x: number) => x.toFixed(1).replace(/\.0$/, '')

/** 24-hour `HH:MM`, as the turn rule shows it. */
export function fmtClock(ms: number): string {
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Grid rule (r3, r13): `+┄┄┄┄┄┄┄┄┄┄┄┄┄ 02:10 ┄┄┄┄…┄┄┄┄ label ┄┄+` ──────────
// `+` at the two ends only. The filler is a one-row, overflow-hidden Box holding a
// long run of ┄ that hard-wraps at the Box's width, so it fills exactly the room
// left and never shows an ellipsis or a second row, whatever the container width.
export type Ui = Elements['terminal']

export type RuleLabel = { text: string; color: string }

/**
 * The cells a turn rule spans: the gutter plus the measure, so its right end (and the
 * footer's meta) lines up with every frame's. Narrow, or no measure: the full width.
 */
export const ruleWidth = (lay: Lay | undefined): number | undefined => (lay === undefined || lay.narrow ? undefined : lay.gutter + lay.width)

export function Rule(ui: Ui, left?: RuleLabel, right?: RuleLabel, width?: number) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" flexWrap="nowrap" width={width ?? '100%'} height={1}>
      <Box flexShrink={0}>
        <Text color={C.ruleStrong}>{G.cross}</Text>
      </Box>
      {left !== undefined && left.text.length > 0 && (
        <Box flexShrink={0}>
          <Text color={C.hairline}>{G.hEdge.repeat(RULE_LEAD)}</Text>
          <Text color={left.color}>{` ${left.text} `}</Text>
        </Box>
      )}
      <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
        <Text color={C.hairline} wrap="wrap">
          {G.hEdge.repeat(600)}
        </Text>
      </Box>
      {right !== undefined && right.text.length > 0 && (
        <Box flexShrink={0}>
          <Text color={right.color}>{` ${right.text} `}</Text>
          <Text color={C.hairline}>{G.hEdge.repeat(2)}</Text>
        </Box>
      )}
      <Box flexShrink={0}>
        <Text color={C.ruleStrong}>{G.cross}</Text>
      </Box>
    </Box>
  )
}

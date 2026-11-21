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

/**
 * The cells a turn rule spans: the gutter plus the measure, so its right end (and the
 * footer's meta) lines up with every frame's. Narrow, or no measure: the full width.
 */
export const ruleWidth = (lay: Lay | undefined): number | undefined => (lay === undefined || lay.narrow ? undefined : lay.gutter + lay.width)

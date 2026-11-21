import { G } from '../shared/layout'
import { fitParts } from '../shared/parts'
import type { Part } from '../shared/parts'
import { clip, vw } from '../shared/text'
import { C } from '../shared/tokens'

/**
 * A whole frame, `width` cells on every line:
 * `+┄┄ [ TITLE ] ┄┄┄…┄┄ meta +`, then `┆ row ┆` lines, then `+┄┄┄…┄┄┄+`.
 */
export function frameLines(width: number, title: string, meta: Part | undefined, rows: readonly Part[][]): Part[][] {
  return [frameTop(width, title, meta), ...rows.map(r => frameRow(width, r)), frameBottom(width)]
}

/** One body line: `┆ parts… ┆`, the parts clipped and padded to the inner width. */
export function frameRow(width: number, parts: readonly Part[]): Part[] {
  return [{ t: `${G.vEdge} `, color: C.hairline }, ...fitParts(parts, width - 4), { t: ` ${G.vEdge}`, color: C.hairline }]
}

/** `+┄┄┄…┄┄┄+`, or `+┄┄┄…┄┄ meta +` when a meta fits. */
export function frameBottom(width: number, meta?: Part): Part[] {
  const fill = width - 4 - vw(meta?.t ?? '')

  if (meta === undefined || meta.t.length === 0 || fill < 2) {
    return [
      { t: G.cross, color: C.ruleStrong },
      { t: G.hEdge.repeat(width - 2), color: C.hairline },
      { t: G.cross, color: C.ruleStrong }
    ]
  }

  return [
    { t: G.cross, color: C.ruleStrong },
    { t: `${G.hEdge.repeat(fill)} `, color: C.hairline },
    meta,
    { t: ' ', color: C.hairline },
    { t: G.cross, color: C.ruleStrong }
  ]
}

// ─── Frame labels: one style for every `[ TITLE ]` ───────────────────────────
// Accent title, normal weight, dim brackets. Every frame label is drawn from here
// (frameTop below, and the diff card's own top edge in register.tsx).
export const LABEL = { text: C.accent, bracket: C.dim } as const

/** `[ TITLE ]` as parts; `inner` (counts beside a diff card's path) goes before the `]`. */
export function frameLabel(title: string, inner: readonly Part[] = []): Part[] {
  return [{ t: '[ ', color: LABEL.bracket }, { t: title, color: LABEL.text }, ...inner, { t: ' ]', color: LABEL.bracket }]
}

/** `+┄┄ [ TITLE ] ┄┄┄…┄┄ meta +`, exactly `width` cells. */
export function frameTop(width: number, title: string, meta: Part | undefined): Part[] {
  // `+┄┄ [ ` (6) + title + ` ] ` (3) + fill + ` ` + meta + ` +` (3 with meta's space)
  const layout = (m: string) => {
    const fixed = 12 + vw(m)
    const t = clip(title, width - fixed - 2)

    return { m, t, fill: width - fixed - vw(t) }
  }
  // Too narrow for the meta beside a readable title → the title alone.
  const first = layout(meta?.t ?? '')
  const { m, t, fill } = first.fill >= 2 && vw(first.t) >= Math.min(4, vw(title)) ? first : layout('')

  return [
    { t: G.cross, color: C.ruleStrong },
    { t: `${G.hEdge.repeat(2)} `, color: C.hairline },
    ...frameLabel(t),
    { t: ` ${G.hEdge.repeat(fill)} `, color: C.hairline },
    { t: m, color: meta?.color ?? C.muted },
    { t: ' ', color: C.hairline },
    { t: G.cross, color: C.ruleStrong }
  ]
}

// The status line's layout: pure, from the facts of one moment to two rows of styled segments (or the one-line
// fallback). No I/O and no ANSI here: main.ts gathers the facts and ansi.ts encodes the rows.
// The layout follows docs/design/statusline-preview.ts cell for cell; behaviour follows docs/design/statusline.md.
import { GHOST_ROWS, STATUS, TOKEN } from '../hooks/shared/look/palette.ts'
import { cutTitle } from '../hooks/shared/look/paths.ts'
import { widthOf } from '../hooks/shared/look/width.ts'

/** One run of text in one style. */
export type Seg = { t: string; fg?: string; bg?: string; b?: boolean }

/** A rendered status line: two rows of segments, or one plain line below the narrow layout's minimum width. */
export type Rows = Seg[][]

/** A tile's reading: the percentage used, or null when it is not known yet. */
export type Reading = { pct: number | null; reset: string | null; pace: number | null }

/** A pull request that needs the person: its number and review state. */
export type Pr = { n: number; state: 'changes requested' | 'pending' }

/** Everything one render shows, already read from Claude Code's JSON, git and the caches. */
export type Facts = {
  model: string
  effort: string
  repo: string
  branch: string
  dirty: boolean
  added: number
  removed: number
  pr: Pr | null
  /** Time left until the prompt cache goes cold (`52m`), `cold`, or null when there is no cache to show. */
  cache: string | null
  /** The session's age (`28m`) once it is a minute old, else null. */
  elapsed: string | null
  ctx: Reading
  five: Reading
  week: Reading
}

/** How to draw: Nerd Font icons, and the optional slab behind the rows. */
export type Options = { icons: boolean; slab: boolean }

/** Below this width the narrow layout cannot fit; one plain line is drawn instead. */
export const MIN_W = 90
/** At and above this width the wide layout is drawn. */
export const WIDE_W = 140
/** The widest a tile grows before the gutters around the rules take the extra width. */
export const TILE_MAX = 54
/** The mark's fixed slot: 6 cells wide, 2 rows tall. */
export const MARK_W = 6

const ICON = { branch: '\uE725', pr: '\uF407', bolt: '\uF0E7' } as const // Nerd Font: dev git branch, oct pull request, fa bolt
const ICON_W = 2 // the icon and its space
const BAR = '▮'
const TG = 1 // the gap between tiles
const EFFORT: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

type Tone = 'calm' | 'warm' | 'hot'
const toneOf = (p: number): Tone => (p < 60 ? 'calm' : p < 85 ? 'warm' : 'hot')
const COLOR: Record<Tone, string> = { calm: TOKEN.machine, warm: TOKEN.warn, hot: TOKEN.err }
const TILE: Record<Tone, string> = { calm: STATUS.tileCalm, warm: STATUS.tileWarm, hot: STATUS.tileHot }
const EDGE: Record<Tone, string> = { calm: STATUS.edgeCalm, warm: TOKEN.warn, hot: TOKEN.err }
const EYE: Record<Tone, string> = { calm: STATUS.eyeCalm, warm: STATUS.eyeWarm, hot: STATUS.eyeHot }

/**
 * The number of cells a run of segments takes.
 * @param segs the segments
 * @returns their width in cells
 */
export const len = (segs: readonly Seg[]): number => segs.reduce((n, x) => n + cellsOf(x.t), 0)

// Printable ASCII and the design's own glyphs (\u2014 \u2212 \u21BB \u2190\u2026\u21FF, box drawing, blocks and shapes, the Nerd Font icons) are one
// cell each, so they are counted by length; other text (a CJK branch, an emoji) is measured by widthOf. The shortcut
// keeps a cold render off the grapheme segmenter, which is most of a render's time on a process's first frame.
const ONE_CELL = /^[\x20-\x7e\u2014\u2212\u2190-\u21ff\u2500-\u25ff\ue000-\uf8ff]*$/
const cellsOf = (t: string): number => (ONE_CELL.test(t) ? t.length : widthOf(t))
const sp = (n: number): Seg[] => (n > 0 ? [{ t: ' '.repeat(n) }] : [])
function fit(segs: Seg[], w: number): Seg[] {
  const n = len(segs)

  if (n > w) throw new Error(`overflow ${n}>${w}: ${segs.map(x => x.t).join('')}`)

  return [...segs, ...sp(w - n)]
}
const lr = (l: Seg[], r: Seg[], w: number): Seg[] => fit([...l, ...sp(Math.max(1, w - len(l) - len(r))), ...r], w)
const onbg = (segs: Seg[], bg: string): Seg[] => segs.map(x => (x.bg === undefined ? { ...x, bg } : x))

/**
 * The highest known reading of the three budgets; unknown readings count as calm (0).
 * @param f the facts
 * @returns the highest percentage, 0 when none is known
 */
export const worst = (f: Facts): number => Math.max(f.ctx.pct ?? 0, f.five.pct ?? 0, f.week.pct ?? 0)

/**
 * The mark: the obsidian ghost, 6 × 4 pixels on two rows of half blocks, its eyes by the highest budget (green under
 * 60%, amber to 84%, red from 85%). One function behind the fixed 6 × 2 slot, so a new mark swaps in here alone.
 * @param pressure the highest budget percentage
 * @returns the two rows, each exactly `MARK_W` cells
 */
export function mark(pressure: number): [Seg[], Seg[]] {
  const pixels = ['.####.', '#W##W#', '######', '#.##.#']
  const eye = EYE[toneOf(pressure)]
  const at = (r: number, c: number): string | null => {
    const k = pixels[r]?.[c]

    return k === '#' ? (GHOST_ROWS[r] ?? null) : k === 'W' ? eye : null
  }
  // Each text row is two pixel rows: the upper half block's foreground over its background.
  const halves = (a: number, b: number): Seg[] => {
    const row: Seg[] = []

    for (let c = 0; c < MARK_W; c++) {
      const top = at(a, c)
      const bot = at(b, c)

      if (top !== null && bot !== null && top === bot) row.push({ t: '█', fg: top })
      else if (top !== null && bot !== null) row.push({ t: '▀', fg: top, bg: bot })
      else if (top !== null) row.push({ t: '▀', fg: top })
      else if (bot !== null) row.push({ t: '▄', fg: bot })
      else row.push({ t: ' ' })
    }

    return row
  }

  return [halves(0, 1), halves(2, 3)]
}

/**
 * A segmented meter: one ▮ per cell, lit in the status colour up to the reading, a quieter unlit block at 25, 50 and
 * 75%, and one bright block where an even burn would be now (the pace).
 * @param p the percentage used, 0 to 100
 * @param w the meter's width in cells
 * @param pace the share of the window elapsed, 0 to 100, or null for no pace block
 * @param bg the tile's surface
 * @returns `w` segments of one cell each
 */
export function meter(p: number, w: number, pace: number | null, bg: string): Seg[] {
  const f = Math.round((p / 100) * w)
  const k = pace === null ? -1 : Math.min(w - 1, Math.floor((pace / 100) * w))
  const q = new Set([0.25, 0.5, 0.75].map(x => Math.round(w * x)))
  const out: Seg[] = []

  for (let i = 0; i < w; i++) {
    const fg = i === k ? TOKEN.textBright : i < f ? COLOR[toneOf(p)] : q.has(i) ? STATUS.meterQuarter : STATUS.meterOff

    out.push({ t: BAR, fg, bg })
  }

  return out
}

const icon = (o: Options, k: keyof typeof ICON, fg: string): Seg[] => (o.icons ? [{ t: `${ICON[k]} `, fg }] : [])

/**
 * Lines added or removed, shortened past a thousand (`9.3k`, `12k`).
 * @param n the count
 * @returns the short form
 */
export const kfmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

type Column = [Seg[], Seg[]]

// The three left columns, name on top and detail below: model and effort, repo and branch, changes (or a PR that needs
// the person) and the cache.
function left(f: Facts, wide: boolean, icons: boolean): [Column, Column, Column] {
  const o: Options = { icons, slab: false }
  const effortN = EFFORT[f.effort] ?? 0
  const model: Column = [
    [{ t: f.model, fg: TOKEN.textBright, b: true }],
    [
      ...Array.from({ length: 5 }, (_, i): Seg => ({ t: BAR, fg: i < effortN ? TOKEN.accent : STATUS.effortOff })),
      ...(wide && f.effort !== '' ? [{ t: ` ${f.effort}`, fg: STATUS.label }] : [])
    ]
  ]
  const repo: Column = [
    [{ t: f.repo, fg: TOKEN.textBright, b: true }],
    f.branch === '' ? [] : [...icon(o, 'branch', TOKEN.machineDim), { t: f.branch, fg: TOKEN.machine }, ...(f.dirty ? [{ t: ' ●', fg: TOKEN.accent }] : [])]
  ]

  if (f.pr !== null) {
    const color = f.pr.state === 'changes requested' ? TOKEN.err : TOKEN.warn

    return [
      model,
      repo,
      [
        [...icon(o, 'pr', color), { t: `PR #${f.pr.n}`, fg: TOKEN.textBright, b: true }],
        [{ t: wide ? f.pr.state : (f.pr.state.split(' ')[0] ?? ''), fg: color }]
      ]
    ]
  }

  const edits: Seg[] =
    f.added === 0 && f.removed === 0
      ? [{ t: 'no edits yet', fg: STATUS.faint }]
      : [
          { t: `+${kfmt(f.added)}`, fg: TOKEN.ok },
          { t: ` −${kfmt(f.removed)}`, fg: TOKEN.err }
        ]
  const detail: Seg[] =
    f.cache !== null
      ? wide
        ? [...icon(o, 'bolt', TOKEN.machineDim), { t: `cache ${f.cache}`, fg: STATUS.label }]
        : [{ t: 'cache', fg: STATUS.label }]
      : f.elapsed !== null
        ? [{ t: (wide ? 'session ' : '') + f.elapsed, fg: STATUS.label }]
        : []

  return [model, repo, [edits, detail]]
}

/**
 * The two rows at width `w` (90 and up), or the one-line fallback below 90.
 * @param f the facts to show
 * @param w the renderer's width W, in cells (already capped)
 * @param o icons and slab
 * @returns two rows of exactly `w` cells, or one plain row of at most `w` cells
 */
export function render(f: Facts, w: number, o: Options): Rows {
  if (w < MIN_W) return [[{ t: fallback(f, w) }]]

  const wide = w >= WIDE_W
  const [g1, g2] = mark(worst(f))
  // Each column is sized for its longest state, so nothing moves between states. Widths are measured with the icons
  // drawn, so turning icons off leaves every column where it is.
  const [model, repo, ch] = left(f, wide, o.icons)
  const [mW, rW, cW] = left(f, wide, true).map(([a, b]) => Math.max(len(a), len(b)))
  const prSlot = ICON_W + `PR #${f.pr?.n ?? 23}`.length
  const cols: [Seg[], Seg[], number][] = [
    [model[0], model[1], Math.max(wide ? 12 : 8, mW ?? 0)],
    [repo[0], repo[1], rW ?? 0],
    [ch[0], ch[1], Math.max(wide ? 17 : 8, prSlot, cW ?? 0)]
  ]

  // Gutters: after the mark, either side of each rule, and before the tiles. Past TILE_MAX the four gutters around
  // the rules grow (up to 2 cells each), so the left side breathes; the tiles share whatever is left.
  const g = wide ? { mark: 4, rule: 3, tiles: 3 } : { mark: 2, rule: 1, tiles: 2 }
  const margin = o.slab ? 2 : 0
  const colsW = margin + MARK_W + cols.reduce((n, [, , cw]) => n + cw, 0)
  const fixed = (): number => colsW + g.mark + (wide ? 2 * (2 * g.rule + 1) : 2 * 2 * g.rule) + g.tiles
  const tw = Math.floor((w - fixed() - 2 * TG) / 3)

  if (wide && tw > TILE_MAX) g.rule += Math.min(2, Math.floor((w - fixed() - 2 * TG - 3 * TILE_MAX) / 4))

  const l1: Seg[] = [...sp(margin), ...g1]
  const l2: Seg[] = [...sp(margin), ...g2]

  for (const [i, [a, b, cw]] of cols.entries()) {
    const sep: Seg[] = i === 0 ? sp(g.mark) : wide ? [...sp(g.rule), { t: '│', fg: STATUS.rule }, ...sp(g.rule)] : sp(2 * g.rule)

    l1.push(...sep, ...fit(a, cw))
    l2.push(...sep, ...fit(b, cw))
  }
  l1.push(...sp(g.tiles))
  l2.push(...sp(g.tiles))

  const avail = w - len(l1) - 2 * TG
  const base = Math.floor(avail / 3)
  const extra = avail % 3
  const tiles: [string, string, Reading][] = [
    ['context', 'ctx', f.ctx],
    ['5-hour', '5h', f.five],
    ['week', 'wk', f.week]
  ]

  for (const [i, [name, short, r]] of tiles.entries()) {
    const tileW = base + (i < extra ? 1 : 0)
    const known = r.pct !== null
    const p = r.pct ?? 0
    const reset = known ? r.reset : null
    const pace = known ? r.pace : null
    const tone = toneOf(p)
    const bg = TILE[tone]
    const inner = tileW - 5
    const val = known
      ? fit(
          [
            { t: String(p), fg: p < 60 ? TOKEN.textBright : COLOR[tone], b: true },
            { t: '%', fg: p < 60 ? STATUS.faint : COLOR[tone] }
          ],
          4
        )
      : fit([{ t: '—', fg: STATUS.faint }], 4)
    // The label and the corner note each have longer and shorter forms; take the longest pair that fits, so in-between
    // widths degrade step by step. Labels shorten before any note is dropped.
    const labels = (wide ? [name, short] : [short]).map(x => ` ${x.toUpperCase()}`)
    const resetSegs = (full: boolean): Seg[] => (reset !== null ? [{ t: full ? `↻ ${reset}` : `↻${reset.split(' ')[0] ?? ''}`, fg: STATUS.faint }] : [])
    const notes: Seg[][] = []

    if (p >= 85 && name === 'context') notes.push([{ t: 'compacts at 95%', fg: TOKEN.warn }], [{ t: 'at 95%', fg: TOKEN.warn }])
    if (p >= 85 && pace !== null && p > pace) {
      notes.push(
        [{ t: 'ahead of pace', fg: TOKEN.err }, { t: '  ', fg: STATUS.faint }, ...resetSegs(true)],
        [{ t: 'ahead', fg: TOKEN.err }, { t: ' ', fg: STATUS.faint }, ...resetSegs(false)]
      )
    }
    if (reset !== null && (wide || p >= 85)) notes.push(resetSegs(true), resetSegs(false))
    notes.push([])

    let lab: Seg[] = []
    let meta: Seg[] = []

    pick: for (const l of labels) {
      for (const m of notes) {
        if (len(val) + l.length + (m.length > 0 ? 1 + len(m) : 0) <= inner) {
          lab = [{ t: l, fg: p < 85 ? STATUS.label : TOKEN.err }]
          meta = m
          break pick
        }
      }
    }

    const sep = i > 0 ? sp(TG) : []
    const edge: Seg = { t: '▏', fg: EDGE[tone], bg }

    l1.push(...sep, edge, ...onbg([...sp(2), ...lr([...val, ...lab], meta, inner), ...sp(2)], bg))
    l2.push(...sep, edge, ...onbg(sp(2), bg), ...meter(p, inner, pace, bg), ...onbg(sp(2), bg))
  }

  if (len(l1) !== w || len(l2) !== w) throw new Error(`row width ${len(l1)}/${len(l2)} != ${w}`)

  return o.slab ? [onbg(l1, STATUS.slab), onbg(l2, STATUS.slab)] : [l1, l2]
}

const pctText = (r: Reading): string => (r.pct === null ? '—' : `${r.pct}%`)

/**
 * The one plain line drawn below the narrow layout's minimum, cut to `w`.
 * @param f the facts
 * @param w the width
 * @returns the line
 */
export function fallback(f: Facts, w: number): string {
  const line = `${f.model} · ${f.repo}${f.branch !== '' ? ` ${f.branch}` : ''}${f.dirty ? ' ●' : ''} · ctx ${pctText(f.ctx)} · 5h ${pctText(f.five)} · wk ${pctText(f.week)}`
  return cutTitle(line, w)
}

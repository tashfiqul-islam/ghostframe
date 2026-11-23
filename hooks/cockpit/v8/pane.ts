// The pane (spec 8.1 to 8.4, 8.12): the tabs, the head card, the timeline with its ruler and bars, the detail drawer,
// the key hints and the wordmark. Pure: cockpit/pane.tsx draws what these return.
import { dim, kindCell, sp, TONE } from '../../shared/look/bits'
import type { Tone } from '../../shared/look/bits'
import type { Part } from '../../shared/parts'
import type { PillState } from '../../shared/look/palette'
import { GLYPH } from '../../shared/look/glyphs'
import { PILL, TINT, TOKEN } from '../../shared/look/palette'
import { cutCommand, cutTitle } from '../../shared/look/paths'
import { sparkline } from '../../shared/look/trace'
import { widthOf } from '../../shared/look/width'

/** The cells a row's parts take. */
const partsWidth = (parts: readonly Part[]) => parts.reduce((n, p) => n + widthOf(p.t), 0)

/** Parts padded with spaces to `width` cells, or cut there. */
export function fit(parts: readonly Part[], width: number): Part[] {
  const out: Part[] = []
  let used = 0

  for (const p of parts) {
    if (used >= width) break

    const t = used + widthOf(p.t) <= width ? p.t : cutTitle(p.t, width - used)

    out.push({ ...p, t })
    used += widthOf(t)
  }

  return used < width ? [...out, sp(width - used)] : out
}

/** `left` with `right` held at the row's right end, exactly `width` cells. */
export function spread(left: readonly Part[], right: readonly Part[], width: number): Part[] {
  const room = width - partsWidth(right)

  return [...fit(left, room), ...right]
}

// ─── 8.1 Tabs ─────────────────────────────────────────────────────────────────

/** The five tabs, in order (8.1). */
export type Tab = 'timeline' | 'files' | 'sources' | 'todo' | 'agents'

/** The tabs' counts (8.1): `todo` undefined is `—`, no to-do list yet. */
export type TabCounts = { files: number; sources: number; todo: { done: number; total: number } | undefined; agents: number }

/**
 * The tab strip (8.1): the labels with their counts, the active one `textBright`, bold, over an accent `━`; the
 * others `dim` over a `hairline` `─`. Keys `1` to `5` switch them while the pane has the keyboard.
 * @param active the tab shown
 * @param counts the counts
 * @returns the two rows
 */
export function tabRows(active: Tab, counts: TabCounts): Part[][] {
  const labels: [Tab, string][] = [
    ['timeline', 'TIMELINE'],
    ['files', `FILES ${counts.files}`],
    ['sources', `SOURCES ${counts.sources}`],
    ['todo', `TODO ${counts.todo === undefined ? '—' : `${counts.todo.done}/${counts.todo.total}`}`],
    ['agents', `AGENTS ${counts.agents}`]
  ]
  const top: Part[] = [sp(2)]
  const under: Part[] = [sp(2)]

  labels.forEach(([tab, label], i) => {
    const isActive = tab === active

    if (i > 0) {
      top.push(sp(3))
      under.push(sp(3))
    }

    top.push(isActive ? { t: label, color: TOKEN.textBright, bold: true } : { t: label, color: TOKEN.dim })
    under.push(isActive ? { t: GLYPH.bar.repeat(widthOf(label)), color: TOKEN.accent } : { t: GLYPH.rule.repeat(widthOf(label)), color: TOKEN.hairline })
  })

  return [top, under]
}

// ─── Cards in the pane ───────────────────────────────────────────────────────

/** A pane card's edges (8.2): from the second cell to the last but one, half cells in the card's colour. */
const paneEdge = (glyph: string, color: string, width: number, inset = 1): Part[] => [sp(inset), { t: glyph.repeat(width - inset - 1), color }]

/** A row inside a pane card: the card's colour from the second cell, the content from the third. */
function inCard(parts: readonly Part[], width: number, bg: string = TOKEN.paneCard): Part[] {
  return [sp(1), ...fit([sp(1), ...parts], width - 2).map(p => ({ ...p, bg: p.bg ?? bg }))]
}

/** A card of rows in the pane, with its two edges. */
export function paneCard(rows: readonly (readonly Part[])[], width: number): Part[][] {
  return [paneEdge(GLYPH.edgeTop, TOKEN.paneCard, width), ...rows.map(r => inCard(r, width)), paneEdge(GLYPH.edgeBottom, TOKEN.paneCard, width)]
}

// ─── 8.2 Head card ───────────────────────────────────────────────────────────

const PILL_WORD: Record<PillState, [string, string, string]> = {
  done: [GLYPH.ok, 'DONE', TOKEN.ok],
  live: [GLYPH.live, 'LIVE', TOKEN.accent],
  failed: [GLYPH.fail, 'FAILED', TOKEN.err],
  needsYou: [GLYPH.needs, 'NEEDS YOU', TOKEN.warn],
  plan: [GLYPH.agent, 'PLAN', TOKEN.machine],
  agent: [GLYPH.agent, 'AGENT', TOKEN.agent],
  interrupted: [GLYPH.interrupted, 'INTERRUPTED', TOKEN.muted]
}

/** A state pill (8.2): the glyph and state word, bold, on the pill's background, with half-cell ends `▐` `▌`. */
export function pill(state: PillState): Part[] {
  const [g, word, color] = PILL_WORD[state]
  const bg = PILL[state]

  return [
    { t: GLYPH.pillStart, color: bg },
    { t: ` ${g} ${word} `, color, bold: true, bg },
    { t: GLYPH.pillEnd, color: bg }
  ]
}

/** One count on the head card's stats row (8.2): its number in `text`, its words `dim`. */
export type Stat = { n: number; word: string }

/** The head card's facts (8.2). */
export type Head = {
  state: PillState
  turnNo: number
  /** The time range at the right: `10:14:02 → 10:16:46`, `… → now`. */
  range: string
  summary: string
  /** The sparkline's levels, 0 to 7, the whole turn. */
  spark: readonly number[]
  failedBuckets?: ReadonlySet<number>
  stats: readonly Stat[]
  duration: string
}

/**
 * The head card (8.2): the pill, `TURN n` and the range; the summary; the sparkline; the stats, 4 cells apart, the
 * duration at the right (accent while live, warn while it waits on you).
 * @param h the head's facts
 * @param width the pane's columns
 * @returns the rows, edges included
 */
export function headCard(h: Head, width: number): Part[][] {
  const inner = width - 3
  const timeColor = h.state === 'live' ? TOKEN.accent : h.state === 'needsYou' ? TOKEN.warn : TOKEN.machineDim
  const stats = h.stats.flatMap((s, i): Part[] => [...(i > 0 ? [sp(4)] : []), { t: String(s.n), color: TOKEN.text }, dim(` ${s.word}`)])

  return paneCard(
    [
      spread(
        [...pill(h.state), sp(2), { t: 'TURN', color: TOKEN.muted }, { t: ` ${h.turnNo}`, color: TOKEN.textBright, bold: true }],
        [{ t: h.range, color: TOKEN.machine }],
        inner
      ),
      [{ t: h.summary, color: TOKEN.textBright }],
      sparkline(h.spark, h.failedBuckets),
      spread(stats, [{ t: h.duration, color: timeColor }], inner)
    ],
    width
  )
}

// ─── 8.3 The timeline ────────────────────────────────────────────────────────

/** Where the pane's columns fall at this width (6.2): the title's cells, the track's, the result's. */
export function columns(width: number): { title: number; track: number; result: number } {
  const result = width >= 72 ? 20 : Math.max(14, width - 52)
  return { title: 25, track: Math.max(12, width - 1 - 31 - result), result }
}

/** A bar on the track (8.3): from and to, in ms into the turn, and its colour. */
export type Bar = { from: number; to: number; color: string }

/**
 * A bar as track cells (8.3): `━`, with `╺` / `╸` where it starts or ends on a half cell. The now-line `┊` fills an
 * empty cell at the current time.
 * @param bar the bar, or none
 * @param spanMs the turn's length the track stands for
 * @param cells the track's cells
 * @param nowAt the now-line's cell, while the turn is live
 * @returns the track's parts
 */
export function track(bar: Bar | undefined, spanMs: number, cells: number, nowAt?: number): Part[] {
  const halves = cells * 2
  const h0 = bar === undefined || spanMs <= 0 ? -1 : Math.floor((bar.from / spanMs) * halves)
  const h1 = bar === undefined || spanMs <= 0 ? -1 : Math.max(h0 + 1, Math.ceil((bar.to / spanMs) * halves))
  const on = (h: number) => h >= h0 && h < h1
  const out: Part[] = []

  for (let c = 0; c < cells; c++) {
    const l = on(2 * c)
    const r = on(2 * c + 1)
    const t = l && r ? GLYPH.bar : r ? GLYPH.barStart : l ? GLYPH.barEnd : c === nowAt ? GLYPH.folded : ' '

    out.push({ t, color: l || r ? (bar?.color ?? TOKEN.barDone) : TOKEN.spine })
  }

  return out
}

/**
 * The ruler (8.3): its two end labels over the track, then `┬────┬────┬────┬───┬` exactly over it.
 * @param from the left label (`10:14`)
 * @param to the right label (`10:17`, `now`)
 * @param width the pane's columns
 * @returns the two rows
 */
export function rulerRows(from: string, to: string, width: number): Part[][] {
  const cells = columns(width).track
  const ticks = Array.from({ length: cells }, (_, i) => (i % 5 === 0 || i === cells - 1 ? GLYPH.tick : GLYPH.rule)).join('')

  return [
    [sp(31), { t: from, color: TOKEN.dim }, sp(cells - widthOf(from) - widthOf(to)), { t: to, color: TOKEN.dim }],
    [sp(31), { t: ticks, color: TOKEN.hairline }]
  ]
}

/** A group's outcome glyph on the timeline (8.3). */
export type GroupGlyph = 'ok' | 'failed' | 'agent' | 'shipped' | 'blocked' | 'denied' | 'waiting' | 'live' | 'folded'

const GROUP_GLYPH: Record<GroupGlyph, Part> = {
  ok: { t: GLYPH.ok, color: TOKEN.ok },
  failed: { t: GLYPH.fail, color: TOKEN.err },
  agent: { t: GLYPH.agent, color: TOKEN.agent },
  shipped: { t: GLYPH.shipped, color: TOKEN.accent },
  blocked: { t: GLYPH.blocked, color: TOKEN.warn },
  denied: { t: GLYPH.denied, color: TOKEN.err },
  waiting: { t: GLYPH.needs, color: TOKEN.warn },
  live: { t: GLYPH.live, color: TOKEN.accent },
  folded: { t: GLYPH.folded, color: TOKEN.spine }
}

/** A result's tone in the pane (5.7). */

/** A sub-step under an agent (8.3): the running or last step, `▸ shell bun test …  running`. */
export type SubStep = { glyph: 'current' | 'failed' | 'ok'; kind: string; subject: string; result: string; tone: Tone }

/** An agent under its launch group (8.3): `├ ◇ name` with its own bar, and its running or last sub-step. */
export type AgentBar = { name: string; isFailed: boolean; bar?: Bar | undefined; result: string; sub?: SubStep | undefined }

/** One timeline row (8.3): a group of steps under one of Claude's working sentences. */
export type Group = {
  id?: string
  glyph: GroupGlyph
  title: string
  bar?: Bar | undefined
  result: string
  tone: Tone
  /** The decisive line under a failed or blocked group. */
  detail?: string | undefined
  /** A failed group whose failure a later step fixed: it keeps its ×, and may fold. */
  isFixed?: boolean
  agents?: readonly AgentBar[]
  isSelected?: boolean
}

/**
 * The selected row (6.2): `▐` in accent at its first cell, and the whole row on the `selected` tint, one background
 * across it (a part's own background would break it into blocks); the text keeps its own colours.
 */
export function selected(row: readonly Part[]): Part[] {
  const rest = [sp(1), ...row.slice(1)]

  return [{ t: GLYPH.pillStart, color: TOKEN.accent, bg: TINT.selected }, ...rest.map(p => ({ ...p, bg: TINT.selected }))]
}

/**
 * The selected row as drawn under the focus ring. The engine inverts every cell of the focused Button (a `plain` one
 * has no other focus style), so the row is drawn with each part's colours swapped and the inversion shows 6.2's look:
 * the text in its own colours on the `selected` tint, `▐` in accent.
 * @param row the selected row (`selected`)
 * @returns the row to draw inside the focused Button
 */
export function underRing(row: readonly Part[]): Part[] {
  return row.map(p => ({ ...p, color: p.bg ?? TINT.selected, bg: p.color }))
}

/** A row on the pane's grid (6.2): select, glyph, title, the track, the result. */
function gridRow(glyph: Part, title: readonly Part[], trackParts: readonly Part[], result: Part, width: number): Part[] {
  const { result: resultCells } = columns(width)
  const r = { ...result, t: cutTitle(result.t, resultCells) }

  return [sp(2), glyph, sp(1), ...fit(title, 25), sp(2), ...trackParts, sp(resultCells - widthOf(r.t)), r, sp(width - 51 - resultCells)]
}

const SUB_GLYPH: Record<SubStep['glyph'], Part> = {
  current: { t: GLYPH.current, color: TOKEN.accent },
  failed: { t: GLYPH.fail, color: TOKEN.err },
  ok: { t: GLYPH.ok, color: TOKEN.ok }
}

/** A sub-step row under an agent, its tree guide first (`│ ` or `  ` under the last agent). */
function subRow(s: SubStep, guide: string, width: number): Part[] {
  const { result: resultCells } = columns(width)
  const room = width - 1 - 12 - resultCells
  const head: Part[] = [sp(2), { t: guide, color: TOKEN.spine }, SUB_GLYPH[s.glyph], sp(1), { t: kindCell(s.kind), color: TOKEN.muted }]
  const subject = { t: s.kind === 'fetch' ? s.subject : cutCommand(s.subject, room), color: TOKEN.text }

  return spread([...head, subject], [{ t: s.result, color: TONE[s.tone] }, sp(width - 51 - resultCells)], width)
}

/**
 * The timeline (8.3): one row per group, its glyph, title, bar and result; a failed group's `└` detail line; agents
 * as `├ ◇ name` bars under their launch group, each with its running or last sub-step. The now-line runs down every
 * empty track cell at the current time while the turn is live.
 * @param groups the groups, in start order
 * @param spanMs the turn's length so far
 * @param width the pane's columns
 * @param isLive whether the turn is live (the now-line shows)
 * @returns the rows
 */
export function timelineRows(groups: readonly Group[], spanMs: number, width: number, isLive: boolean): Part[][] {
  const { track: cells } = columns(width)
  const nowAt = isLive ? cells - 1 : undefined
  const rows: Part[][] = []

  for (const g of groups) {
    const titleColor = g.glyph === 'folded' ? TOKEN.dim : TOKEN.text
    const head = gridRow(
      GROUP_GLYPH[g.glyph],
      [{ t: cutTitle(g.title, 25), color: titleColor }],
      track(g.bar, spanMs, cells, nowAt),
      { t: g.result, color: TONE[g.tone] },
      width
    )

    rows.push(g.isSelected === true ? selected(head) : head)
    if (g.detail !== undefined) rows.push(fit([sp(2), { t: `${GLYPH.last} `, color: TOKEN.spine }, dim(g.detail)], width))

    const agents = g.agents ?? []

    agents.forEach((a, i) => {
      const isLast = i === agents.length - 1
      const guide = isLast ? `${GLYPH.last} ` : `${GLYPH.branch} `
      const glyph = a.isFailed ? GROUP_GLYPH.failed : GROUP_GLYPH.agent

      rows.push(
        gridRow(
          { t: guide.trimEnd(), color: TOKEN.spine },
          [glyph, sp(1), { t: cutTitle(a.name, 23), color: TOKEN.text }],
          track(a.bar, spanMs, cells),
          { t: a.result, color: TOKEN.machineDim },
          width
        )
      )
      if (a.sub !== undefined) rows.push(subRow(a.sub, isLast ? '  ' : `${GLYPH.spine} `, width))
    })
  }

  return rows
}

// ─── 8.4 The detail drawer ───────────────────────────────────────────────────

/** What a drawer shows (8.4): the kind and command with its exit, the decisive lines, the keys; or a plain sentence. */
export type Drawer = {
  kind?: string
  command?: string
  exit?: string
  lines?: readonly { glyph: 'failed' | 'ok'; name: string; said: string }[]
  /** Sentences a waiting row's drawer says instead (`Answer in the dialog on the left.`). */
  said?: readonly string[]
  keys?: readonly (readonly [string, string])[]
}

/** A drawer's edges and rows (8.4): on `paneCard`, from the fifth cell, content from the seventh. */
function drawerRow(parts: readonly Part[], width: number, right: readonly Part[] = []): Part[] {
  const inner = width - 6 - 2
  const body = right.length > 0 ? spread(parts, [...right, sp(4)], inner) : fit(parts, inner)

  return [sp(4), ...[sp(2), ...body].map(p => ({ ...p, bg: p.bg ?? TOKEN.paneCard }))]
}

/**
 * The detail drawer (8.4), opened in place under the selected row: its kind and command, the exit at the right, at
 * most 3 decisive lines, the keys; a waiting row's says what it waits for and where to answer.
 * @param d what it shows
 * @param width the pane's columns
 * @returns the rows, edges included
 */
export function drawerRows(d: Drawer, width: number): Part[][] {
  const rows: Part[][] = []

  if (d.kind !== undefined) {
    rows.push(
      drawerRow(
        [
          { t: d.kind.padEnd(8), color: TOKEN.muted },
          { t: d.command ?? '', color: TOKEN.text }
        ],
        width,
        d.exit === undefined ? [] : [{ t: d.exit, color: TOKEN.machineDim }]
      )
    )
  }

  const lines = (d.lines ?? []).slice(0, 3)

  if (lines.length > 0) {
    rows.push(drawerRow([], width))
    for (const l of lines) {
      rows.push(drawerRow([SUB_GLYPH[l.glyph], sp(1), { t: l.name, color: TOKEN.text }, sp(2), { t: l.said, color: TOKEN.text }], width))
    }
  }

  if ((d.said ?? []).length > 0) {
    if (rows.length > 0) rows.push(drawerRow([], width))
    for (const s of d.said ?? []) rows.push(drawerRow(keyed(s), width))
  }

  if ((d.keys ?? []).length > 0) {
    rows.push(drawerRow([], width))
    rows.push(drawerRow(keyParts(d.keys ?? [], 3), width))
  }

  return [
    [sp(4), { t: GLYPH.edgeTop.repeat(width - 6), color: TOKEN.paneCard }],
    ...rows,
    [sp(4), { t: GLYPH.edgeBottom.repeat(width - 6), color: TOKEN.paneCard }]
  ]
}

/** A sentence that starts with a slash command keeps the command in `machine` (`/model switch model now`). */
const keyed = (s: string): Part[] => {
  const m = /^(\/\S+)(.*)$/.exec(s)

  return m === null
    ? [{ t: s, color: TOKEN.text }]
    : [
        { t: m[1] ?? '', color: TOKEN.machine },
        { t: m[2] ?? '', color: TOKEN.dim }
      ]
}

// ─── 8.12 Key hints and the wordmark ─────────────────────────────────────────

/** Keys as hints (8.12): the key in accent, its action dim, `gap` cells apart. */
export function keyParts(keys: readonly (readonly [string, string])[], gap = 4): Part[] {
  return keys.flatMap(([k, a], i): Part[] => [...(i > 0 ? [sp(gap)] : []), { t: k, color: TOKEN.accent }, dim(` ${a}`)])
}

/**
 * The pane's last row (8.12): the keys that work in this view, only while the pane has the keyboard, and the
 * wordmark with the plugin's version at the right on every view.
 * @param keys the view's keys, none while the pane does not have the keyboard
 * @param version the plugin manifest's version, `dev` before a release
 * @param width the pane's columns
 * @returns the row
 */
export function hintRow(keys: readonly (readonly [string, string])[], version: string, width: number): Part[] {
  const mark: Part[] = [
    { t: 'ghostframe', color: TOKEN.wordmark },
    { t: ` v${version}`.replace(/^ vdev$/, ' dev'), color: TOKEN.wordmarkVersion },
    sp(width - 71)
  ]

  return spread([sp(2), ...keyParts(keys)], mark, width)
}

/**
 * The pane's rows fitted to its height: the content, blank rows, and the hint row last.
 * @param content the rows from the top
 * @param hint the hint row, undefined for a view with none
 * @param rows the pane's body rows
 * @returns exactly `rows` rows when the content fits
 */
export function framed(content: readonly (readonly Part[])[], hint: readonly Part[] | undefined, rows: number): Part[][] {
  const room = rows - (hint === undefined ? 0 : 1)
  const body = content.slice(0, Math.max(0, room)).map(r => [...r])

  while (body.length < room) body.push([])

  return hint === undefined ? body : [...body, [...hint]]
}

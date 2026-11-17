import { C, G, clip, vw } from './grid'
import { fitParts, frameBottom, frameRow, frameTop, partsWidth } from './states'
import type { Part } from './states'

// ─── mdxcn figures (DESIGN.md §5.7) ──────────────────────────────────────────
// The mdxcn skill writes its figures as a bare fence holding framed ASCII (from
// https://mdxcn.dev/llms.txt `## MDX`):
//
//   ```
//   +------------------ [ SHIPPED ] -------------------+
//   |                                                  |
//   | ●  Mar 12  CLI copies the files                  |
//   |                                                  |
//   +--------------------------------------------------+
//   ```
//
// We redraw it in our own frame at the shared measure: the title in the top rule, the
// figure's rows inset 1, glyphs toned by what they mean. A fence that isn't one of
// these stays a plain code block.

/** A figure fence's content: its title, its inner rows (padding rows dropped), whether the fence closed. */
export type FigureBlock = {
  kind: 'figure'
  title: string
  rows: string[]
  closed: boolean
  /** The source frame's content width (its top edge less `|` each side and the inset). */
  source: number
}

const OPEN = /^```\s*$/
const TOP = /^\+-+ \[ (.+?) \] -+\+$/
const BOTTOM = /^\+-+\+$/
const ROW = /^\|(.*)\|$/

/** A bare fence line, the only kind a figure opens with. */
export const isBareFence = (line: string) => OPEN.test(line)

/** Whether a fence's first line is an mdxcn figure's top edge. */
export const isFigureTop = (line: string | undefined) => line !== undefined && TOP.test(line.trimEnd())

/**
 * A fence's body as a figure, or undefined (malformed: the caller keeps the plain code
 * block). `closed`: the fence's closing line has arrived. `whole`: the body's last line
 * is complete (while streaming, a half-written line is left out until it ends).
 */
export function parseFigure(body: readonly string[], closed: boolean, whole: boolean): FigureBlock | undefined {
  const lines = (closed || whole ? body : body.slice(0, -1)).map(l => l.trimEnd())
  const title = TOP.exec(lines[0] ?? '')?.[1]?.trim()

  if (title === undefined || title.length === 0) return undefined

  const rows: string[] = []
  let ended = false

  for (const line of lines.slice(1)) {
    if (ended) {
      if (line.length > 0) return undefined // anything after the bottom edge

      continue
    }

    if (BOTTOM.test(line)) {
      ended = true
      continue
    }

    const m = ROW.exec(line)

    if (m === null) return undefined

    // One space of the frame's own inset goes; the figure's alignment stays.
    rows.push((m[1] ?? '').replace(/^ /, '').trimEnd())
  }

  if (closed && !ended) return undefined

  // The frame's own padding rows go: blank rows at the top always, at the bottom once
  // the fence closes (while it streams a blank row waits until a row follows it).
  const first = rows.findIndex(r => r.length > 0)
  const kept = first < 0 ? [] : rows.slice(first)
  let last = kept.length

  while (last > 0 && (kept[last - 1] ?? '').length === 0) last--

  return { kind: 'figure', title, rows: kept.slice(0, last), closed, source: Math.max(0, vw(lines[0] ?? '') - 3) }
}

// ─── Tone: colour is state (§0.1 r5) ─────────────────────────────────────────

const BOX = /[─-╿]/
const BARS = /[█▃▄▅▆▇]/

/** One figure row as coloured parts. */
export function toneRow(line: string): Part[] {
  // oxlint-disable-next-line typescript/no-misused-spread -- code points on purpose: width is measured per code point until grapheme segmentation lands
  const chars = [...line]
  const hasBlocks = /[█▃▄▅▆▇▒]/.test(line)
  const parts: Part[] = []
  let inBar = false

  const colorAt = (i: number): string => {
    const ch = chars[i] ?? ''
    const prev = chars[i - 1]
    const next = chars[i + 1]

    // A `[====----]` bar: brackets and track in the rule's tone, the fill as a rail.
    if (ch === '[' && /^\[[=-]+\]/.test(chars.slice(i).join(''))) {
      inBar = true
      return C.hairline
    }
    if (inBar) {
      if (ch === ']') {
        inBar = false
        return C.hairline
      }
      return ch === '=' ? C.text : C.hairline
    }

    if (BOX.test(ch) || ch === '|') return C.hairline
    // A diff row's sign: `+ app` added, `- sourcemaps` removed.
    if (i === 0 && next === ' ' && ch === '+') return C.ok
    if (i === 0 && next === ' ' && ch === '-' && /\w/.test(chars[2] ?? '')) return C.err
    if (ch === '+') return C.hairline
    if (ch === '-' && (prev === '-' || next === '-')) return C.hairline

    switch (ch) {
      case '●':
      case '✓':
        return C.ok
      case '✗':
      case '✕':
        return C.err
      case '○':
      case '→':
        return C.muted
      case '▾':
        return C.accent // the marker for now
      case '–':
      case '░':
        return C.dim
      case '▒':
        return C.warn // slow
      case '·':
        return hasBlocks ? C.err : C.dim // down, in an uptime strip
      default:
        return BARS.test(ch) ? C.text : C.text
    }
  }

  chars.forEach((ch, i) => {
    const color = colorAt(i)
    const last = parts[parts.length - 1]

    if (last !== undefined && last.color === color) last.t += ch
    else parts.push({ t: ch, color })
  })

  return parts
}

// ─── The frame ───────────────────────────────────────────────────────────────

export const WIDER_NOTE = 'wider than window · ctrl+o'

/**
 * The figure framed at `width`: the top rule with `[ TITLE ]`, each row inset 1 and
 * never wrapped (a row wider than the frame is cut at the right), and, once the fence
 * closes, the bottom rule (noting, dim, when any row was cut). Rows already drawn never
 * change as more arrive.
 */
export function figureLines(f: FigureBlock, width: number, narrow = false): Part[][] {
  const inner = width - 4
  const list = parseList(f.rows, f.closed)

  if (list !== undefined) {
    const { rows, notes, cut } = listLines(list, inner, narrow, f.closed)

    return [
      frameTop(width, f.title, f.closed ? { t: countOf(list), color: C.muted } : undefined),
      ...rows.map(r => frameRow(width, r)),
      ...(f.closed ? [frameBottom(width, cut ? { t: WIDER_NOTE, color: C.dim } : undefined), ...notes.map(n => fitParts(n, width))] : [])
    ]
  }

  const wider = f.rows.some(r => vw(r) > inner)

  return [
    frameTop(width, f.title, undefined),
    ...f.rows.map(r => frameRow(width, toneRow(vw(r) > inner ? clip(r, inner) : r))),
    ...(f.closed ? [frameBottom(width, wider ? { t: WIDER_NOTE, color: C.dim } : undefined)] : [])
  ]
}

// ─── Steps and timelines: one spine, tight rows, loops ──────────────────────
// A Steps fence (`1  title` / `   description`) or a timeline fence (`●  date  label`)
// is laid out again rather than copied: one continuous `│` in the rule colour from the
// first marker to the last (through description and spacer rows, never past the last
// marker); one-line items sit on consecutive rows; an item with a description gets one
// spacer row after it. The source's own `│` rows only tell us another item follows.
//
// Loops (Steps only), written as rows before step 1 (the mdxcn skill's Steps recipe):
//   repeat: 3-5 per tool call   → a ┐ │ ┘ bracket on the right of steps 3–5, label dim
//   back: 6->3 continue         → `↩ continue to 3`, dim, after step 6's title
// Narrow, or a bracket with no room, or a loop line written after the steps (it would
// change rows already drawn): a dim note under the figure instead.
//
// Streaming: an item draws once the row after it shows another item follows (a `│` or a
// marker), or the fence closes, so a drawn row never changes. A bracket's rows wait
// until its last step is whole. The count in the top rule comes when the fence closes.

type Item = { mark: string; gap: string; title: string; desc: string[]; next: boolean }
type Loop = { from: number; to: number; label: string; early: boolean }
type List = { kind: 'steps' | 'timeline'; items: Item[]; repeat?: Loop | undefined; back?: Loop | undefined }

const MARK_STEP = /^(\d{1,2})( {2,})(\S.*)$/
const MARK_TIME = /^([●○◐◌▾✓✗✕•·])( {2,})(\S.*)$/u
const STATELESS = new Set(['•', '·'])
const LINK = /^│\s*$/
const DESC = /^ {2,}\S/
const DIRECTIVE = /^(repeat|back):\s*(.*)$/i
const RANGE = /^(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(.*)$/
const JUMP = /^(\d{1,2})\s*(?:->|→)\s*(\d{1,2})\s*(.*)$/
const DONE = new Set(['●', '✓'])

/** A figure's rows as steps or a timeline, or undefined (any other figure). */
export function parseList(rows: readonly string[], closed: boolean): List | undefined {
  const items: Item[] = []
  let kind: List['kind'] | undefined
  let repeat: Loop | undefined
  let back: Loop | undefined

  for (const row of rows) {
    const d = DIRECTIVE.exec(row)

    if (d !== null) {
      const m = ((d[1] ?? '').toLowerCase() === 'repeat' ? RANGE : JUMP).exec((d[2] ?? '').trim())

      if (m === null) return undefined

      const loop = { from: Number(m[1]), to: Number(m[2]), label: (m[3] ?? '').trim(), early: items.length === 0 }

      if ((d[1] ?? '').toLowerCase() === 'repeat') {
        if (repeat !== undefined || loop.from > loop.to) return undefined
        repeat = loop
      } else {
        if (back !== undefined || loop.to >= loop.from) return undefined
        back = loop
      }
      continue
    }

    const step = MARK_STEP.exec(row)
    const time = step === null ? MARK_TIME.exec(row) : null
    const mark = step ?? time

    if (mark !== null) {
      const k = step !== null ? 'steps' : 'timeline'

      if (kind !== undefined && kind !== k) return undefined
      kind = k

      const prev = items[items.length - 1]

      if (prev !== undefined) prev.next = true
      items.push({ mark: mark[1] ?? '', gap: mark[2] ?? '', title: mark[3] ?? '', desc: [], next: false })
      continue
    }

    const cur = items[items.length - 1]

    if (row.length === 0) continue
    if (cur === undefined) return undefined
    if (LINK.test(row)) {
      cur.next = true
      continue
    }
    if (DESC.test(row)) {
      cur.desc.push(row.slice(1)) // its source indent kept; column 0 becomes the spine
      continue
    }

    return undefined
  }

  // Only loop lines so far, fence still open: Steps whose first step hasn't arrived
  // (drawing the loop lines as rows now would take them back later).
  if (kind === undefined) return !closed && (repeat !== undefined || back !== undefined) ? { kind: 'steps', items, repeat, back } : undefined
  // Loops belong to Steps, and point at steps that exist.
  if (kind === 'timeline' && (repeat !== undefined || back !== undefined)) return undefined
  if (closed) {
    const nums = new Set(items.map(i => Number(i.mark)))
    const ok = (l: Loop | undefined) => l === undefined || (nums.has(l.from) && nums.has(l.to))

    if (!ok(repeat) || !ok(back)) return undefined
  }

  return { kind, items, repeat, back }
}

/** The top rule's count: `7 steps`; `9 items`, or `8 of 9 done` once markers carry state. */
export function countOf(list: List): string {
  const n = list.items.length

  if (list.kind === 'steps') return `${n} ${n === 1 ? 'step' : 'steps'}`

  const marks = list.items.map(i => i.mark)

  // Plain bullets carry no state: a count. Any state marker (● ✓ done, ○ ◐ ▾ … not): done of all.
  if (marks.every(m => STATELESS.has(m))) return `${n} ${n === 1 ? 'item' : 'items'}`

  return `${marks.filter(m => DONE.has(m)).length} of ${n} done`
}

const BRACKET_MIN = 12 // the narrowest content column a bracket may leave

/** The list's rows at `inner` cells, the notes under the frame, and whether a row was cut. */
function listLines(list: List, inner: number, narrow: boolean, closed: boolean) {
  const { items, repeat, back } = list
  const index = (n: number) => items.findIndex(i => Number(i.mark) === n)
  // The bracket's right-most column: room for ` label` after it inside the frame.
  const maxCol = repeat === undefined ? 0 : inner - 2 - vw(repeat.label)
  const bracket = repeat !== undefined && repeat.early && !narrow && maxCol >= BRACKET_MIN ? repeat : undefined
  // Any description: every item gets a spacer row after it (one rhythm for the figure).
  const spaced = items.some(i => i.desc.length > 0)

  // What may draw now: whole items only; a bracket's rows only with its last step whole.
  let drawable = items.filter(i => closed || i.next).length

  if (bracket !== undefined && !closed) {
    const to = index(bracket.to)
    const from = index(bracket.from)

    if (to < 0 || !(items[to]?.next ?? false)) drawable = Math.min(drawable, from < 0 ? drawable : from)
  }

  type Row = { parts: Part[]; item: number; tail: boolean }
  const out: Row[] = []
  let cut = false

  items.slice(0, drawable).forEach((it, i) => {
    const last = closed && i === items.length - 1
    const spine: Part = { t: last ? ' ' : G.spine, color: C.rule }
    const jump = back !== undefined && back.early && Number(it.mark) === back.from
    const title: Part[] = [
      // Compact (all one line): the spine has its own column, one space left of the markers
      // (`│ ●`, wide and narrow alike), so it runs unbroken from the first item to the last.
      ...(spaced ? [] : [{ t: `${G.spine} `, color: C.rule }]),
      { t: it.mark, color: list.kind === 'steps' ? C.text : (toneRow(it.mark)[0]?.color ?? C.text) },
      { t: it.gap, color: C.text },
      ...toneRow(it.title),
      ...(jump ? [{ t: `  ↩ ${back.label.length > 0 ? back.label : 'back'} to ${back.to}`, color: C.dim }] : [])
    ]

    out.push({ parts: title, item: i, tail: false })
    for (const d of it.desc) {
      const lead = /^ */.exec(d)?.[0] ?? ''

      out.push({ parts: [spine, { t: lead, color: C.text }, ...toneRow(d.slice(lead.length))], item: i, tail: false })
    }
    if (spaced && !last) out.push({ parts: [spine], item: i, tail: true })
  })

  // The bracket: from step `from`'s title to step `to`'s last row (not its spacer).
  const span =
    bracket === undefined
      ? []
      : out
          .map((r, k) => ({ r, k }))
          .filter(({ r }) => {
            const n = Number(items[r.item]?.mark)

            return n >= bracket.from && n <= bracket.to && !(r.tail && n === bracket.to)
          })
          .map(({ k }) => k)
  const top = span[0] ?? -1
  const h = span.length
  // Two cells after the widest row it brackets (titles and descriptions), never past
  // the frame. Its rows draw only once its last step is whole, so this never moves.
  const widest = Math.max(0, ...span.map(k => partsWidth(out[k]?.parts ?? [])))
  const col = Math.min(widest + 2, maxCol)
  const mid = Math.floor((h - 1) / 2)
  const rows = out.map((r, k) => {
    const inSpan = bracket !== undefined && k >= top && k < top + h
    const wide = partsWidth(r.parts) > (inSpan ? col - 1 : inner)

    cut ||= wide
    if (!inSpan || bracket === undefined) return r.parts

    const at = k - top
    // ┐ │ ┤ label │ ┘, all in the spine's colour; one row is `]`, two are ┐ ┘ (label on ┐).
    const glyph = h === 1 ? ']' : at === 0 ? '┐' : at === h - 1 ? '┘' : at === mid ? '┤' : G.spine

    return [...fitParts(r.parts, col), { t: glyph, color: C.rule }, ...(at === mid ? [{ t: ` ${bracket.label}`, color: C.dim }] : [])]
  })

  const notes: Part[][] = []

  if (repeat !== undefined && bracket === undefined) {
    notes.push([{ t: `↺ ${repeat.from}–${repeat.to} repeat${repeat.label.length > 0 ? ` ${repeat.label}` : ''}`, color: C.dim }])
  }
  if (back !== undefined && !back.early) {
    notes.push([{ t: `↩ ${back.from} ${back.label.length > 0 ? back.label : 'back'} to ${back.to}`, color: C.dim }])
  }

  return { rows, notes, cut }
}

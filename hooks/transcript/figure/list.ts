import { G } from '../../shared/layout'
import { fitParts, partsWidth } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import { vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { toneRow } from './tone'

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
export function listLines(list: List, inner: number, narrow: boolean, closed: boolean) {
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

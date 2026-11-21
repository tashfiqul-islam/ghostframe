// Cockpit's `[ STEPS ]` rows (spec E.37, E.39, H.5): a step's row, the hidden rows' count, the section labels.
import type { LogStep, StepLog, StepMark } from '../../../types'
import type { Part } from '../../shared/parts'
import { cellWidth, vw } from '../../shared/text'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import { KIND_W } from './kinds'
import { isOpen } from './log'
import { plural } from './results'

const LEAD = 2 + KIND_W // spine, gutter, kind: the subject starts here
const CLOCK_W = 7 // `59m 59s`
const CLOCK_GAP = 2

/** A hard cut to `n` cells, ending in `…`; spec mocks cut mid-word (`bun te…`). */
export function cut(s: string, n: number): string {
  if (n <= 0) return ''
  if (vw(s) <= n) return s

  let out = ''
  let w = 0

  // A string iterates by code point, as grid.ts measures width.
  for (const ch of s) {
    const cw = cellWidth(ch)

    if (w + cw > n - 1) break

    out += ch
    w += cw
  }

  return `${out}…`
}

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
const right = (s: string, n: number) => spaces(n - vw(s)) + s

const MARK_COLOR: Record<StepMark | '▸', string> = { '': C.muted, '✕': C.err, '✓': C.ok, '±': C.textBright, '↗': C.textBright, '▸': C.textBright }

/** One step row, exactly `width` cells. */
function stepRow(s: LogStep, width: number): Part[] {
  const mark = s.isRunning ? '▸' : s.mark
  const showClock = width >= 40
  const showResult = width >= 56 || (width >= 40 && mark !== '')
  // A launch result (`6 done · 1 failed`, amendment 1) may pass the 16-cell result cap by a cell or two.
  const resultMax = (width >= 72 ? 16 : 14) + (s.kind === 'agent' ? 2 : 0)
  const result = showResult ? cut(s.isRunning ? 'running' : s.result, resultMax) : ''
  const tail = showClock ? CLOCK_GAP + CLOCK_W : 0
  const room = width - LEAD - tail - (result.length > 0 ? vw(result) + 1 : 0)
  const subject = cut(s.subject, room)
  const resultColor = s.isRunning ? C.muted : s.mark === '✕' ? C.err : s.mark === '✓' ? C.ok : s.mark === '' ? C.muted : C.text

  return [
    { t: mark === '' ? ' ' : mark, color: MARK_COLOR[mark] },
    { t: ' ', color: C.muted },
    { t: s.kind.padEnd(KIND_W).slice(0, KIND_W), color: C.muted },
    { t: subject + spaces(room - vw(subject)), color: s.isRunning ? C.textBright : C.text },
    ...(result.length > 0 ? [{ t: ` ${result}`, color: resultColor, ...(s.mark === '✕' ? { bold: true } : {}) }] : []),
    ...(showClock ? [{ t: spaces(CLOCK_GAP) + right(formatSpan(s.clock), CLOCK_W), color: s.isRunning ? C.muted : C.dim }] : [])
  ]
}

/** `… n earlier · 20 shell · 14 read · 5 edit +3`: the hidden rows, counted exactly. */
function earlierRow(hidden: readonly LogStep[], dropped: number, width: number): Part[] {
  const counts = new Map<string, number>()

  for (const s of hidden) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)

  const top = [...counts].toSorted((a, b) => b[1] - a[1]).slice(0, 3)
  const rest = hidden.length - top.reduce((n, [, c]) => n + c, 0) + dropped
  const words = [`… ${hidden.length + dropped} earlier`, ...top.map(([k, c]) => `${c} ${k}`)].join(' · ') + (rest > 0 ? ` +${rest}` : '')
  const t = `  ${cut(words, width - 2)}`

  return [{ t: t + spaces(width - vw(t)), color: C.dim }]
}

/**
 * A section's label rule, `┄ [ TITLE ] ┄…┄ meta`, exactly `width` cells: the title muted (or in `color`), the
 * meta parts at the right edge.
 */
export function sectionLabel(title: string, meta: readonly Part[], width: number, color: string = C.muted): Part[] {
  const used = vw(`┄ [ ${title} ] `) + 1 + meta.reduce((n, p) => n + vw(p.t), 0)

  return [
    { t: '┄ ', color: C.hairline },
    { t: '[ ', color: C.dim },
    { t: title, color },
    { t: ' ] ', color: C.dim },
    { t: '┄'.repeat(Math.max(1, width - used)), color: C.hairline },
    { t: ' ', color: C.muted },
    ...meta
  ]
}

/** `┄ [ STEPS ] ┄…┄ 12 steps · 2 failed`, exactly `width` cells. */
function labelRow(log: StepLog, width: number, title: string): Part[] {
  const total = log.steps.length + log.dropped
  const failed = log.steps.filter(s => s.mark === '✕').length
  const fail = failed > 0 ? [{ t: ` · ${failed} failed`, color: C.err }] : []

  return sectionLabel(title, [{ t: plural(total, 'step'), color: C.muted }, ...fail], width)
}

const OPEN_MAX = 3

/**
 * `[ STEPS ]` fitted to `rows` (E.37, alone in the pane): the label, then every step if they fit; else
 * `… n earlier`, the open failures (at most 3, else one `✕ n open` row), then the newest steps.
 * @param log the turn's log
 * @param width the pane's body columns
 * @param rows the pane's body rows
 * @param title the label: `STEPS`, or `STEPS · TURN n` for an earlier turn's steps
 * @returns one Part list per row, none when the turn has no steps
 */
export function stepRows(log: StepLog, width: number, rows: number, title = 'STEPS'): Part[][] {
  const steps = log.steps

  if (steps.length === 0 || rows < 1) return []

  const label = labelRow(log, width, title)
  const room = rows - 1

  if (steps.length <= room && log.dropped === 0) return [label, ...steps.map(s => stepRow(s, width))]
  if (room < 1) return [label]

  const open = steps.flatMap((_, i) => (isOpen(steps, i) ? [i] : []))
  let tail = Math.max(0, room - 1)
  let pinned: number[] = []

  // Pinned failures are the open ones above the window; the window grows as fewer are pinned.
  for (let pass = 0; pass < 4; pass++) {
    const first = steps.length - tail
    pinned = open.filter(i => i < first)
    const pinRows = pinned.length === 0 ? 0 : pinned.length <= OPEN_MAX ? pinned.length : 1
    tail = Math.max(0, room - 1 - pinRows)
  }

  const first = steps.length - tail
  const pinRows: Part[][] =
    pinned.length <= OPEN_MAX
      ? pinned.flatMap(i => {
          const s = steps[i]

          return s === undefined ? [] : [stepRow(s, width)]
        })
      : [[{ t: cut(`✕ ${pinned.length} open · s shows all`, width).padEnd(width), color: C.err }]]
  const shownPinned = new Set(pinned.length <= OPEN_MAX ? pinned : [])
  const hidden = steps.filter((_, i) => i < first && !shownPinned.has(i))

  return [label, earlierRow(hidden, log.dropped, width), ...pinRows, ...steps.slice(first).map(s => stepRow(s, width))]
}

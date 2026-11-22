// The pane's views besides the fitted layout (spec E.44): a step's detail (Enter on a step), a diff (Enter on an edit
// step or a FILES row), and the full step view (`s`). Pure: hooks/cockpit/pane.tsx draws them; each is as tall as it
// needs, and the engine scrolls it.
import type { LogStep, StepDetail, StepLog } from '../../../types'
import type { Part } from '../../shared/parts'
import { vw } from '../../shared/text'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import { plain } from '../line'
import type { Line } from '../line'
import { cut, sectionLabel, stepLine } from '../steps/rows'

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
const KIND_W = 9

/** A row of `text` from column `indent`, exactly `width` cells. */
const row = (text: string, width: number, color: string, indent = 2): Part[] => {
  const t = spaces(indent) + cut(text, width - indent)

  return [{ t: t + spaces(width - vw(t)), color }]
}

/** `text` broken into rows of `room` cells, by words where it can, hard where a word is longer. */
function wrap(text: string, room: number): string[] {
  const out: string[] = []
  let at = ''

  for (const word of text.split(/\s+/).filter(w => w.length > 0)) {
    let w = word

    while (vw(w) > room) {
      if (at.length > 0) {
        out.push(at)
        at = ''
      }

      out.push(w.slice(0, room))
      w = w.slice(room)
    }

    if (at.length === 0) at = w
    else if (vw(at) + 1 + vw(w) <= room) at += ` ${w}`
    else {
      out.push(at)
      at = w
    }
  }

  return at.length > 0 ? [...out, at] : out.length > 0 ? out : ['']
}

/**
 * A step's detail: the label (`STEP n · TURN t`, its result and clock), its full command, how long it ran and how it
 * ended, and an excerpt of its output (the first rows of a success, the last of a failure) with what was left out.
 * @param step the step's row in the log
 * @param detail what was kept of it; undefined when it is too old to be kept
 * @param stepNo its number in the turn, from 1
 * @param turnNo the turn's number
 * @param width the pane's body columns
 * @returns the rows
 */
export function detailRows(step: LogStep, detail: StepDetail | undefined, stepNo: number, turnNo: number, width: number): Line[] {
  const meta: Part[] = [
    { t: [step.isRunning ? 'running' : step.result, formatSpan(step.clock)].filter(t => t.length > 0).join(' · '), color: step.mark === '✕' ? C.err : C.muted }
  ]
  const label = plain(sectionLabel(`STEP ${stepNo} · TURN ${turnNo}`, meta, width, C.textBright))

  if (detail === undefined)
    return [label, plain(row(`${step.kind} ${step.subject}`, width, C.text)), plain(row('this step`s detail is no longer kept', width, C.dim))]

  const command = wrap(detail.command, width - 2 - KIND_W).map((t, i) =>
    plain([
      { t: `  ${(i === 0 ? step.kind : '').padEnd(KIND_W).slice(0, KIND_W)}`, color: C.muted },
      { t: t + spaces(width - 2 - KIND_W - vw(t)), color: C.textBright }
    ])
  )
  const ran = [
    detail.ms === null ? 'running' : formatSpan(detail.ms),
    detail.ms === null ? '' : detail.isFailed ? 'failed' : 'ok',
    detail.lines > 0 ? `${detail.lines} ${detail.lines === 1 ? 'line' : 'lines'} of output` : 'no output'
  ].filter(t => t.length > 0)
  const ranRow = plain([
    { t: `  ${'ran'.padEnd(KIND_W)}`, color: C.muted },
    { t: cut(ran.join(' · '), width - 2 - KIND_W).padEnd(width - 2 - KIND_W), color: detail.isFailed ? C.err : C.text }
  ])
  const excerpt = detail.excerpt.map(t => plain(row(t, width, C.text)))
  const left = detail.lines - detail.excerpt.length
  const more = left > 0 ? [plain(row(`… ${left} more ${left === 1 ? 'line' : 'lines'} · ctrl+o shows all`, width, C.dim))] : []

  return [label, ...command, ranRow, ...excerpt, ...more]
}

/** A patch's counts and hunks. */
function counts(patch: readonly string[]) {
  return {
    adds: patch.filter(l => l.startsWith('+')).length,
    dels: patch.filter(l => l.startsWith('-')).length,
    hunks: patch.filter(l => l.startsWith('@@')).length
  }
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * A diff: the label (`DIFF · path`, `+a −d · n hunks`), then each hunk's header (`hunk i of n · lines a to b`) and
 * its rows, `+` in ok, `−` in err, context in text. A row longer than the pane is cut.
 * @param path the file
 * @param patch its unified rows
 * @param width the pane's body columns
 * @param note what the patch leaves out, said under it
 * @returns the rows
 */
export function diffRows(path: string, patch: readonly string[], width: number, note?: string): Line[] {
  const { adds, dels, hunks } = counts(patch)
  const meta: Part[] = [
    { t: `+${adds}`, color: C.add },
    { t: ' ', color: C.muted },
    { t: `−${dels}`, color: C.del },
    { t: ` · ${hunks} ${hunks === 1 ? 'hunk' : 'hunks'}`, color: C.muted }
  ]
  const label = plain(sectionLabel(`DIFF · ${cut(path, Math.max(8, width - 32))}`, meta, width, C.textBright))

  if (patch.length === 0) return [label, plain(row('no diff kept for this file', width, C.dim))]

  let hunk = 0
  const rows = patch.map(l => {
    const m = HUNK.exec(l)

    if (m !== null) {
      hunk += 1
      const from = Number(m[1])
      const span = Number(m[2] ?? 1)

      return plain(row(`hunk ${hunk} of ${hunks} · lines ${from} to ${Math.max(from, from + span - 1)}`, width, C.muted))
    }

    const color = l.startsWith('+') ? C.add : l.startsWith('-') ? C.del : C.text

    return plain(row(l.startsWith('-') ? `−${l.slice(1)}` : l, width, color))
  })

  return [label, ...rows, ...(note === undefined ? [] : [plain(row(note, width, C.dim))])]
}

/**
 * The full step view (`s`): every step of the turn, unfolded, each openable. The engine scrolls it.
 * @param log the turn's log
 * @param width the pane's body columns
 * @returns the rows
 */
export function allRows(log: StepLog, width: number): Line[] {
  const failed = log.steps.filter(s => s.mark === '✕').length
  const meta: Part[] = [
    { t: `${log.steps.length + log.dropped} steps`, color: C.muted },
    ...(failed > 0 ? [{ t: ` · ${failed} failed`, color: C.err }] : []),
    ...(log.dropped > 0 ? [{ t: ` · ${log.dropped} oldest not kept`, color: C.dim }] : [])
  ]

  return [plain(sectionLabel(`STEPS · TURN ${log.turnNo} · ALL`, meta, width)), ...log.steps.map(s => stepLine(s, width))]
}

// The unfolded view (spec E.4, F.8; correction D): ctrl+o is the full record as text. A sentence Claude said while
// working is a `│` row in muted with the turn clock, wrapped; each step is a row under it, inset to column 4: its kind
// (8 cells), its subject, its result word right-aligned at F−10 and its own duration on the time edge; an edit's diff
// and a command's output follow in a frame. `/steps n all` prints these same rows for one turn. Pure, except the
// view's flag: no site says "this is the ctrl+o view", so the sites that do say it (`ToolUse`, `ToolGroup`,
// `TurnDuration`, probe 6) set it, and a change redraws the text blocks, which carry no such prop.
import type { EngineInterface } from 'claude-code'

import type { LogStep } from '../../types'
import type { Part } from '../shared/parts'
import { cellWidth, vw } from '../shared/text'
import { formatSpan } from '../shared/time'
import { C } from '../shared/tokens'
import { cut, sectionLabel } from './steps/rows'

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
const BAR: Part = { t: '│', color: C.ruleStrong }
const KIND_W = 8
const LEAD = 4 // `│` and three cells: the step rows' kind starts at column 4
const TIME_W = 10 // the step's own duration, right-aligned in the last ten cells
const CLOCK_W = 7

let isUnfolded = false

/** Whether the transcript is the ctrl+o view now. */
export const unfolded = (): boolean => isUnfolded

/**
 * Notes what a site says of the view (`isExpanded`); a change redraws every site, so the text blocks follow.
 * @param $ the engine interface
 * @param value the site's `isExpanded`, undefined where it says nothing
 */
export function noteUnfolded($: EngineInterface, value: boolean | undefined): void {
  if (value === undefined || value === isUnfolded) return

  isUnfolded = value
  $.ui.invalidate('ui.render')
}

/** `text` broken into rows of at most `room` cells, at spaces where it can, hard where a word is longer. */
export function wrapText(text: string, room: number): string[] {
  const out: string[] = []

  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    let at = ''

    for (const word of para.split(/\s+/).filter(w => w.length > 0)) {
      let w = word

      while (vw(w) > room) {
        if (at.length > 0) out.push(at)
        at = ''
        let head = ''

        for (const ch of w) {
          if (vw(head) + cellWidth(ch) > room) break
          head += ch
        }

        out.push(head)
        w = w.slice(head.length)
      }

      if (at.length === 0) at = w
      else if (vw(at) + 1 + vw(w) <= room) at += ` ${w}`
      else {
        out.push(at)
        at = w
      }
    }

    if (at.length > 0) out.push(at)
  }

  return out.length > 0 ? out : ['']
}

/**
 * A sentence Claude said while working: `│ ` and the text in muted, wrapped (never cut), the turn clock on the first
 * row's time edge.
 * @param text the sentence
 * @param clock the turn clock (ms) when it was said, if known
 * @param width the transcript's frame
 * @returns the rows
 */
export function sentenceRows(text: string, clock: number | undefined, width: number): Part[][] {
  const time = clock === undefined || width < 60 ? '' : formatSpan(clock)
  const room = width - 2 - (time.length > 0 ? CLOCK_W + 2 : 0)

  return wrapText(text, Math.max(10, room)).map((line, i) => {
    const row: Part[] = [BAR, { t: ` ${line}`, color: C.muted }]

    return i === 0 && time.length > 0 ? [...row, { t: spaces(width - 2 - vw(line) - vw(time)) + time, color: C.dim }] : row
  })
}

/**
 * A step's own duration, as the unfolded view writes it: tenths below ten seconds (`0.3s`, `4.1s`), else the span.
 * @param ms how long it ran
 * @returns the text
 */
export const ownTime = (ms: number): string => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : formatSpan(ms))

/**
 * A step's row (E.4): `│`, three cells, the kind (8 cells), a cell, the subject; the result word right-aligned at F−10
 * (never `ok`; coloured only when it is not the expected result), the step's own duration on the time edge. Below 72
 * columns the result word drops, below 60 the duration.
 * @param step the step
 * @param ms its own duration, if known
 * @param width the transcript's frame
 * @returns the row's parts
 */
export function stepRow(step: LogStep, ms: number | null | undefined, width: number): Part[] {
  const time = width < 60 || ms === null || ms === undefined ? '' : ownTime(ms)
  const word = width < 72 || step.result === 'ok' ? '' : step.isRunning ? 'running' : step.result
  const resultEnd = width - TIME_W
  const subjectAt = LEAD + KIND_W + 1
  const room = (word.length > 0 ? resultEnd - vw(word) - 1 : time.length > 0 ? resultEnd - 1 : width) - subjectAt
  const subject = cut(step.subject, room)
  const color = step.mark === '✕' ? C.err : step.mark === '✓' ? C.ok : C.muted
  const row: Part[] = [
    BAR,
    { t: spaces(LEAD - 1), color: C.muted },
    { t: `${step.kind.padEnd(KIND_W).slice(0, KIND_W)} `, color: C.muted },
    { t: subject, color: C.text }
  ]
  let x = subjectAt + vw(subject)

  if (word.length > 0) {
    row.push({ t: spaces(resultEnd - x - vw(word)) + word, color, ...(step.mark === '✕' ? { bold: true } : {}) })
    x = resultEnd
  }

  if (time.length > 0) row.push({ t: spaces(width - x - vw(time)) + time, color: C.dim })

  return row
}

/** A frame's rows: `┄ [ title ] ┄…┄ meta`, its lines from column 2, a closing `┄` rule. */
function frame(title: string, meta: string, lines: readonly Part[][], width: number): Part[][] {
  return [sectionLabel(title, [{ t: meta, color: C.muted }], width), ...lines, [{ t: '┄'.repeat(width), color: C.hairline }]]
}

const HUNK = /^@@ /

/**
 * An edit's diff in a frame (F.8): every hunk in full, `+` and `-` in column 2, a blank row between hunks. A row
 * longer than the frame is cut (wrapping long diff lines is not built).
 * @param path the file
 * @param patch its unified rows
 * @param width the transcript's frame
 * @returns the rows
 */
export function diffFrame(path: string, patch: readonly string[], width: number): Part[][] {
  const adds = patch.filter(l => l.startsWith('+')).length
  const dels = patch.filter(l => l.startsWith('-')).length
  const hunks = patch.filter(l => HUNK.test(l)).length
  const lines = patch.flatMap((l, i): Part[][] => {
    if (HUNK.test(l)) return i === 0 ? [] : [[{ t: '', color: C.text }]]

    const color = l.startsWith('+') ? C.add : l.startsWith('-') ? C.del : C.text

    return [[{ t: cut(`  ${l.startsWith('+') || l.startsWith('-') ? l : ` ${l.replace(/^ /, '')}`}`, width), color }]]
  })
  const meta = `${cut(path, Math.max(8, width - 40))} · +${adds} −${dels}${hunks > 1 ? ` · ${hunks} hunks` : ''}`

  return frame('diff', meta, lines, width)
}

/**
 * A command's output in a frame: every line it printed, from column 2.
 * @param text the output
 * @param width the transcript's frame
 * @param note what was left out, said under it (the store kept an excerpt only)
 * @returns the rows, none for no output
 */
export function outputFrame(text: string, width: number, note?: string): Part[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')

  if (text.trim().length === 0) return []

  const rows = [...lines.map(l => [{ t: cut(`  ${l}`, width), color: C.text }]), ...(note === undefined ? [] : [[{ t: `  ${note}`, color: C.dim }]])]

  return frame('output', `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`, rows, width)
}

/** The text of a row of parts, as a selection or a copy reads it. */
export const rowText = (row: readonly Part[]): string =>
  row
    .map(p => p.t)
    .join('')
    .trimEnd()

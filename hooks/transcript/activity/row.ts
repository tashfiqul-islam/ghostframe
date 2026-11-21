import { G } from '../../shared/layout'
import type { Part } from '../../shared/parts'
import { clip, pad, vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { clipPath } from '../../shared/url'
import { clipLabel } from '../research/labels'
import { LEAD, TIME_W, VERB_W } from './steps'
import type { Step } from './steps'

// ─── Row layout: exact strings, so nothing can wrap ──────────────────────────

/** Lay a step out in `width` cells: target clipped to whatever the result and time leave. */
/** The time column, `   1m 12s`; '' when there is no time. */
export const timeCellOf = (time: string) => (time.length === 0 ? '' : `   ${pad(time, Math.max(TIME_W, vw(time)), 'right')}`)

/**
 * The least room a target keeps before its row gives something up (§4 narrow): the
 * time goes first, and only then does the target clip further.
 */
export const MIN_TARGET = 16

export function layoutStep(step: Step, time: string, width: number) {
  const result = step.result.map(r => r.text).join(' ')
  const roomWith = (t: string) => width - LEAD - vw(result) - vw(timeCellOf(t)) - 2
  const shown = time.length > 0 && roomWith(time) < MIN_TARGET ? '' : time
  const timeCell = timeCellOf(shown)
  const room = Math.max(4, roomWith(shown))
  const target = step.isLabel === true ? clipLabel(step.target, room) : step.isPath ? clipPath(step.target, room) : clip(step.target, room)
  const gap = Math.max(2, width - LEAD - vw(target) - vw(result) - vw(timeCell))

  return {
    verb: pad(step.verb, VERB_W),
    target,
    gap: ' '.repeat(gap),
    timeCell,
    detail: step.detail !== undefined ? clip(step.detail, Math.max(4, width - LEAD)) : undefined
  }
}

/** The same row as Parts (plus its `╰─` detail line), for rows drawn inside a frame. */
export function stepParts(step: Step, time: string, width: number): Part[][] {
  const l = layoutStep(step, time, width)
  const row: Part[] = [
    { t: `${step.dot.text} `, color: step.dot.color },
    { t: l.verb, color: C.muted },
    { t: l.target, color: step.targetColor ?? C.textBright },
    { t: l.gap, color: C.text },
    ...step.result.flatMap((r, i) => [...(i > 0 ? [{ t: ' ', color: C.text }] : []), { t: r.text, color: r.color }]),
    { t: l.timeCell, color: C.muted }
  ]

  return l.detail === undefined
    ? [row]
    : [
        row,
        [
          { t: G.hang, color: C.dim },
          { t: `${' '.repeat(VERB_W)}${l.detail}`, color: C.dim }
        ]
      ]
}

/** Shell output, folded per §5.4: ≤ 3 lines shown whole, else first 2, a fold, the last. */
export function foldOutput(stdout: string): { lines: string[]; more: number; last?: string } | undefined {
  const all = stdout.replace(/\r\n?/g, '\n').trimEnd().split('\n')

  if (all.length === 0 || (all.length === 1 && (all[0] ?? '').trim().length === 0)) return undefined
  if (all.length <= 3) return { lines: all, more: 0 }

  return { lines: all.slice(0, 2), more: all.length - 3, last: all[all.length - 1] ?? '' }
}

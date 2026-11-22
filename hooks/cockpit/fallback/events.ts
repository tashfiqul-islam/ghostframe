// Fallback's event rows (spec E.5, E.13): with no pane to show it, every failure draws at once, as the step settles:
// `✕ failed · test · bun test width · 2 of 14` on the turn clock, and up to three of the error's decisive lines under
// it. A failed fetch or search draws none (amendment 6): it is a source problem, not the turn's. Pure: draw.tsx
// draws what these return.
import type { LogStep } from '../../../types'
import type { Part } from '../../shared/parts'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import { edgeRow } from '../quiet'
import { isTurnFailure } from '../steps/log'
import { cut } from '../steps/rows'

/** What a failure row says, kept from its first draw: a row is never amended, even once a later step fixes it. */
export type Failure = { kind: string; subject: string; result: string; clock: number; lines: string[] }

const DETAIL_MAX = 3
// The lines of an error that say what went wrong or where: an assertion, an error word, a `file:line`.
const DECISIVE = /error|fail|expect|received|assert|exception|panic|not found|no such|cannot|can't|denied|refused|\S+\.\w+:\d+/i

/**
 * The decisive lines of a failure's output: the lines that name the error or its place, in order, at most three;
 * else its last line. A line that only repeats the result, or the exit code, is left out.
 * @param excerpt the last rows of the output
 * @param said what the row already says (its subject and result)
 * @returns at most three lines
 */
export function decisive(excerpt: readonly string[], said: readonly string[]): string[] {
  // The tool's own wrapper tags (`<tool_use_error>`) are not part of the error.
  const lines = excerpt.map(l => l.replace(/<\/?[a-z_-]+>/gi, '').trim()).filter(l => l.length > 0 && !/^(error:\s*)?exit code\b/i.test(l) && !said.includes(l))
  const named = lines.filter(l => DECISIVE.test(l))

  return (named.length > 0 ? named : lines.slice(-1)).slice(0, DETAIL_MAX)
}

/**
 * A settled step's failure row, if it failed in a way the turn answers for (not a fetch or a search).
 * @param step the settled step
 * @param excerpt the last rows of its output (its kept detail)
 * @returns the failure, or undefined
 */
export function failureOf(step: LogStep, excerpt: readonly string[]): Failure | undefined {
  if (step.isRunning || !isTurnFailure(step)) return undefined

  return { kind: step.kind, subject: step.subject, result: step.result, clock: step.clock, lines: decisive(excerpt, [step.subject, step.result]) }
}

/**
 * The rows of a failure: `✕ failed · kind · subject · result` with the clock on the time edge (a result that only
 * repeats the subject is said once), then its detail rows at column 4, muted.
 * @param f the failure
 * @param width the transcript's frame
 * @returns the rows, top to bottom
 */
export function failureRows(f: Failure, width: number): Part[][] {
  const result = f.result.length === 0 || f.result === f.subject ? '' : ` · ${f.result}`

  return [
    edgeRow(
      [
        { t: '✕ ', color: C.err },
        { t: 'failed', color: C.err, bold: true },
        { t: ` · ${f.kind} · ${f.subject}${result}`, color: C.text }
      ],
      formatSpan(f.clock),
      width
    ),
    ...f.lines.map(l => [{ t: `    ${cut(l, width - 4)}`, color: C.muted }])
  ]
}

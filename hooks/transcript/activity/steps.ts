import { COMMIT_HEAD, DENIED, GIT_COMMIT, describe } from '../../shared/calls/describe'
import { obj, s } from '../../shared/calls/fields'
import { firstErrorLine, resultOf } from '../../shared/calls/results'
import type { Tone } from '../../shared/calls/results'
import { parseTests, stripNoise } from '../../shared/calls/tests'
import { G } from '../../shared/layout'
import { C } from '../../shared/tokens'

// ─── Activity timeline (DESIGN.md §5.4 under §0.1 r1, r2, r14) ───────────────
// One row per step: `● verb    target ……… result   time`, frameless. State is
// the dot; detail hangs off `╰─` in dim. Anything we can't read → undefined,
// and the caller hands the row back to the engine.

export const DOT_W = 2 // `● `
export const VERB_W = 8
export const TIME_W = 6 // `1m 12s`; a longer time widens its own cell, never clips
export const LEAD: number = DOT_W + VERB_W // target column, from the content edge

export type Step = {
  dot: Tone
  verb: string
  target: string
  isPath: boolean
  targetColor?: string // a fetched URL's label: muted
  isLabel?: boolean // the target is a URL label: clipped by clipLabel, not as a path
  result: Tone[] // parts, e.g. [+18, −4]
  detail?: string
}

/** `isAsking`: a person-facing permission ask is open for this call (from `tool.check`). */
export type CallFlags = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean; isAsking?: boolean }

/** TaskUpdate's result reads its own input: the status it set. */
function taskStatus(input: unknown): Tone[] | undefined {
  switch (obj(input)?.['status']) {
    case 'completed':
      return [{ text: 'done', color: C.ok }]
    case 'in_progress':
      return [{ text: 'in progress', color: C.accent }]
    case 'pending':
      return [{ text: 'open', color: C.muted }]
    case 'deleted':
      return [{ text: 'deleted', color: C.muted }]
    default:
      return undefined
  }
}

/** A plan's first heading, or its first line, as the step's target. */
function planTitle(output: unknown): string | undefined {
  const plan = s(obj(output)?.['plan'])
  const line = plan
    ?.split('\n')
    .map(l =>
      l
        .replace(/^#{1,6}\s+/, '')
        .replace(/\*\*|__|`/g, '')
        .trim()
    )
    .find(l => l.length > 0)

  return line
}

/** A shell's output as text (stdout and stderr, or the error text). */
const shellOut = (output: unknown) => {
  if (typeof output === 'string') return output

  const o = obj(output)

  return o === undefined ? '' : [o['stdout'], o['stderr']].filter((x): x is string => typeof x === 'string').join('\n')
}

/** `56 pass` (ok) or `3 fail` (err) when a test run printed a summary; else undefined. */
export function testResult(output: unknown): Tone[] | undefined {
  const c = parseTests(shellOut(output))

  if (c === undefined) return undefined

  return c.failed > 0 ? [{ text: `${c.failed} fail`, color: C.err }] : [{ text: `${c.passed} pass`, color: C.ok }]
}

/**
 * What a shipping command did, for its row: `committed a1b2c3d` for a commit, `PR #148` for
 * a pull request. The turn's last one also draws the [ SHIPPED ] card; earlier ones
 * are this row alone. Nothing read → undefined (`ok`).
 */
export function shipResult(command: string, output: unknown): Tone[] | undefined {
  const text = stripNoise(shellOut(output))
  const pr = /\bgh\s+pr\s+create\b/.test(command) ? /https:\/\/\S+\/pull\/(\d+)/.exec(text)?.[1] : undefined

  if (pr !== undefined) return [{ text: `PR #${pr}`, color: C.ok }]

  const sha = GIT_COMMIT.test(command) ? COMMIT_HEAD.exec(text)?.[1] : undefined

  return sha === undefined
    ? undefined
    : [
        { text: 'committed', color: C.ok },
        { text: sha.slice(0, 7), color: C.muted }
      ]
}

/** The whole step, or undefined to leave the row to the engine. */
export function stepOf(
  tool: string,
  input: unknown,
  output: unknown,
  f: CallFlags,
  cwd?: string,
  d: ReturnType<typeof describe> = describe(tool, input, cwd)
): Step | undefined {
  if (d === undefined) return undefined

  // Waiting on the person's permission answer: not running yet, nothing back yet.
  if (f.isAsking === true && !f.isRunning && !f.isErrored && !f.isInterrupted && output === undefined) {
    return { ...d, dot: { text: G.ask, color: C.warn }, result: [{ text: 'needs you', color: C.warn }], detail: 'waiting for you' }
  }

  if (f.isRunning) {
    return { ...d, dot: { text: G.running, color: C.accent }, result: [{ text: 'running', color: C.accent }] }
  }

  if (f.isInterrupted) {
    return { ...d, dot: { text: G.interrupted, color: C.muted }, result: [{ text: 'interrupted', color: C.warn }] }
  }

  if (f.isErrored) {
    const text = typeof output === 'string' ? output : ''

    if (DENIED.test(text)) {
      return { ...d, dot: { text: G.denied, color: C.err }, result: [{ text: 'denied', color: C.err }] }
    }

    const shell = tool === 'Bash' || tool === 'PowerShell'
    const code = /exit code[:\s]+(\d+)/i.exec(text)?.[1]
    const detail = firstErrorLine(text)
    const summary = shell && d.verb === 'test' ? testResult(text) : undefined

    return {
      ...d,
      dot: { text: G.done, color: C.err },
      result: summary ?? [{ text: shell && code !== undefined ? `exit ${code}` : 'failed', color: C.err }],
      ...(detail.length > 0 ? { detail } : {})
    }
  }

  const target = tool === 'ExitPlanMode' ? (planTitle(output) ?? d.target) : d.target
  const shell = tool === 'Bash' || tool === 'PowerShell'
  const summary = shell ? (d.verb === 'test' ? testResult(output) : shipResult(s(obj(input)?.['command']) ?? '', output)) : undefined
  const result = summary ?? (tool === 'TaskUpdate' ? taskStatus(input) : resultOf(tool, output)) ?? [{ text: 'ok', color: C.ok }]

  return { ...d, target, dot: { text: G.done, color: C.ok }, result }
}

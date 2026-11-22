// The capsule (spec E.3): fallback's whole account of a stretch of work, in one row. It is what the pane's
// `[ STEPS ]` becomes when there is no pane: `│ worked · 20 steps · 6 shell · 5 read · 2 test +7 · 1 failure → fixed`
// and the turn clock at which the stretch ended. Pure: hooks/cockpit/fallback/draw.tsx draws what these return.
import type { LogStep } from '../../../types'
import type { Part } from '../../shared/parts'
import { vw } from '../../shared/text'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import { isOpen, isTurnFailure } from '../steps/log'
import { plural } from '../steps/results'

/** What one stretch of work did, counted when its capsule is first drawn and kept: a capsule is never updated. */
export type Capsule = {
  steps: number
  kinds: [string, number][]
  agents: number
  agentsFailed: number
  failures: number
  open: number
  clock: number
}

const CLOCK_W = 7

/**
 * Counts a stretch: its steps, its kinds by count (most first, ties in order of first use), the agents its launches
 * started (amendment 1: a launch is one step; its agents are counted here, not as a kind), the failures and how many
 * are still open, and the turn clock of its last step.
 * @param all the typed turn's steps so far, for whether a failure was fixed later in the turn
 * @param from the stretch's first step, as an index into `all`
 * @param to one past its last step
 * @returns the capsule, or undefined for a stretch of no steps
 */
export function capsuleOf(all: readonly LogStep[], from: number, to: number): Capsule | undefined {
  const stretch = all.slice(Math.max(0, from), Math.max(0, to))

  if (stretch.length === 0) return undefined

  const kinds = new Map<string, number>()

  for (const s of stretch) if (s.kind !== 'agent') kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1)

  const launches = stretch.filter(s => s.kind === 'agent')
  const failed = stretch.flatMap((s, i) => (isTurnFailure(s) ? [Math.max(0, from) + i] : []))

  return {
    steps: stretch.length,
    kinds: [...kinds].toSorted((a, b) => b[1] - a[1]),
    agents: launches.reduce((n, s) => n + (s.calls?.length ?? 1), 0),
    agentsFailed: launches.reduce((n, s) => n + (s.failed ?? 0), 0),
    failures: failed.length,
    open: failed.filter(i => isOpen(all, i)).length,
    clock: Math.max(...stretch.map(s => s.clock))
  }
}

/** The exception story (E.3): the last field and the only coloured one; absent with no exception. */
function story(c: Capsule): Part[] {
  const fixed = c.failures - c.open
  const failures: Part[] =
    c.failures === 0
      ? []
      : c.open === 0
        ? [{ t: `${plural(c.failures, 'failure')} → fixed`, color: C.muted }]
        : [{ t: [plural(c.open, 'failure'), ...(fixed > 0 ? [`${fixed} fixed`] : [])].join(' · '), color: C.err }]
  const agents: Part[] = c.agentsFailed === 0 ? [] : [{ t: `${c.agentsFailed} agent${c.agentsFailed === 1 ? '' : 's'} failed`, color: C.err }]

  return [...failures, ...agents]
}

/** The kinds shown: at most `n`, and `+k` for the steps of the rest (agent launches are counted apart). */
function kindsText(c: Capsule, n: number): string {
  if (n === 0) return ''

  const shown = c.kinds.slice(0, n)
  const rest = c.kinds.slice(n).reduce((sum, [, k]) => sum + k, 0)
  const listed = shown.map(([kind, k]) => `${k} ${kind}`).join(' · ')

  return rest === 0 ? listed : `${listed} +${rest}`
}

/**
 * The capsule's row, exactly `width` cells: `│`, then in muted `worked`, the step count, the kinds, the agents, and
 * the exception story; the clock on the time edge. Narrow, the kinds give way first, from the right: three kinds
 * from 72 columns, two below, then one, then none; below 60 columns the clock goes too. The step count and the
 * story are never cut.
 * @param c the capsule
 * @param width the transcript's frame
 * @returns the row's parts
 */
export function capsuleRow(c: Capsule, width: number): Part[] {
  const sep: Part = { t: ' · ', color: C.muted }
  const clock = width < 60 ? '' : formatSpan(c.clock)
  const room = clock.length === 0 ? width : width - CLOCK_W - 1
  const tail = story(c)
  const build = (n: number): Part[] => {
    const kinds = kindsText(c, n)
    const fields: Part[][] = [
      [
        { t: `│ `, color: C.ruleStrong },
        { t: `worked · ${plural(c.steps, 'step')}`, color: C.muted }
      ],
      ...(kinds.length > 0 ? [[{ t: kinds, color: C.muted }]] : []),
      ...(c.agents > 0 ? [[{ t: plural(c.agents, 'agent'), color: C.muted }]] : []),
      ...tail.map(p => [p])
    ]

    return fields.flatMap((f, i) => (i === 0 ? f : [sep, ...f]))
  }
  const widest = width >= 72 ? 3 : 2
  const fits = [widest, ...[2, 1, 0].filter(n => n < widest)].map(build).find(parts => parts.reduce((w, p) => w + vw(p.t), 0) <= room) ?? build(0)
  const used = fits.reduce((w, p) => w + vw(p.t), 0)

  return clock.length === 0 ? fits : [...fits, { t: ' '.repeat(Math.max(1, width - used - vw(clock))) + clock, color: C.dim }]
}

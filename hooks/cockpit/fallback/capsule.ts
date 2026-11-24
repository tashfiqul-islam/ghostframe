// The capsule (spec E.3; v8 7.13): fallback's count of a stretch of work, drawn as the worked node. Pure:
// hooks/cockpit/v8/receipt.ts reads it into the node's counts and hooks/cockpit/fallback/draw.tsx draws it.
import type { LogStep } from '../../../types'
import { isOpen, isShownFailure, isTurnFailure } from '../steps/log'

/** What one stretch of work did, counted when its capsule is first drawn and kept: a capsule is never updated. */
export type Capsule = {
  steps: number
  kinds: [string, number][]
  agents: number
  agentsFailed: number
  failures: number
  open: number
  /** The failure keys that first failed in the stretch and drew no row (past the turn's first three, 13.1). */
  unshown: number
  clock: number
}

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

  // A stretch of refused steps only did no work: each drew its own ⊘ or ▍ row, so no worked node stands for it.
  if (stretch.every(s => s.state !== undefined)) return undefined

  const kinds = new Map<string, number>()

  for (const s of stretch) if (s.kind !== 'agent') kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1)

  const launches = stretch.filter(s => s.kind === 'agent')
  const failed = stretch.flatMap((s, i) => (isTurnFailure(s) ? [Math.max(0, from) + i] : []))
  // A key's first failure, by when it settled: a repeat of a key, here or before, is not a new one.
  const isFirst = (i: number) => {
    const s = all[i]

    return s !== undefined && !all.some((t, k) => k !== i && isTurnFailure(t) && t.key === s.key && (t.clock < s.clock || (t.clock === s.clock && k < i)))
  }

  return {
    steps: stretch.length,
    kinds: [...kinds].toSorted((a, b) => b[1] - a[1]),
    agents: launches.reduce((n, s) => n + (s.calls?.length ?? 1), 0),
    agentsFailed: launches.reduce((n, s) => n + (s.failed ?? 0), 0),
    failures: failed.length,
    open: failed.filter(i => isOpen(all, i)).length,
    unshown: failed.filter(i => isFirst(i) && !isShownFailure(all, i)).length,
    clock: Math.max(...stretch.map(s => s.clock))
  }
}

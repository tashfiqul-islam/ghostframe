import { fmtDuration } from '../../shared/time'

// ─── The activity rule ───────────────────────────────────────────────────────
export type StepLike = { id: string; turn: string | null; at: number; ms: number | null; tool?: string; ok?: boolean }

/** First start to last end of some steps; a loop, not `Math.max(...)`, so no step count overflows the stack. */
export const wallOf = (steps: readonly StepLike[]): number =>
  steps.reduce((m, x) => Math.max(m, x.at + (x.ms ?? 0)), -Infinity) - steps.reduce((m, x) => Math.min(m, x.at), Infinity)

/** The rule's `N steps · wall time` when `id` opens its turn's activity; else undefined. */
export function activityHead(list: readonly StepLike[], id: string | undefined): string | undefined {
  const me = list.find(x => x.id === id)

  if (me === undefined || me.turn === null) return undefined

  const mine = list.filter(x => x.turn === me.turn)

  if (mine[0]?.id !== id) return undefined

  const n = mine.length
  const count = `${n} ${n === 1 ? 'step' : 'steps'}`

  // Wall time only once every step has finished: a live count never shows a stale total.
  if (mine.some(x => x.ms === null)) return count

  return `${count} · ${fmtDuration(wallOf(mine))}`
}

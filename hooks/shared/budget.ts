// The engine skips a hook whose own work passes its 10 s budget (`HookBudget.ms`: its own code only, never a `next(e)`
// or `$` call in flight). A ghostframe hook that passes 1 s writes one debug line naming itself and its time, so a slow
// hook shows in the debug log long before the engine has to skip it.
import type { EngineInterface } from 'claude-code'

const OWN_MAX_MS = 1_000

/** A hook's budget as `next.budget` reads it: the whole of it, and what is left. */
type Budget = { readonly ms: number; readonly remainingMs: number }

/**
 * The debug line for a hook whose own work passed 1 s.
 * @param hook the hook's name (its event, and a render's site)
 * @param budget its budget as it ends
 * @returns the line, or undefined under 1 s or where nothing meters the hook
 */
export function ownTimeLine(hook: string, budget: Budget): string | undefined {
  const own = budget.ms - budget.remainingMs

  return budget.ms > 0 && Number.isFinite(budget.remainingMs) && own > OWN_MAX_MS
    ? `hook ${hook} ran ${Math.round(own)} ms of its own work, over the ${OWN_MAX_MS} ms guard`
    : undefined
}

/**
 * At a hook's end: past 1 s of its own work, one line in the debug log.
 * @param $ the engine interface
 * @param hook the hook's name
 * @param budget `next.budget` as the hook ends
 */
export function noteOwnTime($: EngineInterface, hook: string, budget: Budget): void {
  const line = ownTimeLine(hook, budget)

  if (line !== undefined) $.ui.log(line, { to: 'debug' })
}

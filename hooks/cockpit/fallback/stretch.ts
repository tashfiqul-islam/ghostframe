// The one fallback decision that cannot come from the turn's own data (spec E.3 case 3): which engine turn a footer
// closes. The engine's `TurnDuration` names no turn (phase 5 probe), so a footer claims, at its first draw, the turn
// that had just ended, docked or not, and keeps it: a footer drawn again after a resize finds its turn. Everything
// else a fallback row draws is worked out from data each time (plan.ts; amendment 10).
// shortcut: kept in the module, so a reload forgets it; a footer drawn again after one closes no turn, and its turn's
// receipt is not drawn there. Move it to $.state if that shows.
import { remember } from '../../shared/held'

const ROWS_MAX = 2_000

const claims = new Map<string, string | null>()

/**
 * The engine turn a footer closes, claimed at its first draw (E.3 case 3).
 * @param row the footer's request
 * @param turn the turn to claim when none is yet
 * @returns the claimed turn
 */
export function claimFooter(row: string, turn: string | null): string | null {
  const had = claims.get(row)

  if (had !== undefined) return had

  remember(claims, row, turn, ROWS_MAX)

  return turn
}

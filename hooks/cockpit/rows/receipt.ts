// The engine's records as the left's counts (7.12, 7.13): a kept receipt and a stretch's capsule, read into the
// facts the receipt and the worked node draw. Pure: this is where the step log's data meets the renderers.
import type { Receipt } from '../../../types'
import type { Capsule } from '../fallback/capsule'
import type { TurnCounts } from './left'

/** The trace a receipt kept before phase 12 draws: it had none, so a flat one stands in. */
const FLAT = [0, 2, 0]

/** A receipt as the receipt row's counts. */
export function receiptCounts(r: Receipt): TurnCounts {
  // `waiting` is a receipt kept in history before phase 12 made one receipt per typed turn; none is written now.
  const state = r.state === 'failed' ? 'failed' : r.state === 'waiting' ? 'waiting' : 'done'

  return {
    state,
    durationMs: r.durationMs,
    steps: r.steps,
    fixed: r.fixed,
    open: r.failures - r.fixed,
    blocked: r.blocked ?? 0,
    files: r.files,
    sources: r.sources ?? 0,
    cited: r.cited ?? 0,
    // A turn still waiting on its agents names them once, as running (7.12).
    agents: r.state === 'waiting' ? 0 : (r.launched ?? 0),
    kinds: r.kinds ?? {},
    shipped: r.shipped ?? r.commit,
    levels: r.levels ?? FLAT,
    ...(r.state === 'waiting' ? { waiting: r.agents } : {})
  }
}

/** A stretch's capsule as the worked node's counts (7.13): its steps, agents and fixes, its kinds, its time. */
export function workedCounts(c: Capsule, levels: readonly number[] = FLAT): TurnCounts {
  return {
    state: 'done',
    durationMs: c.clock,
    steps: c.steps,
    fixed: c.failures - c.open,
    open: c.open,
    blocked: 0,
    files: 0,
    sources: 0,
    cited: 0,
    agents: c.agents,
    kinds: Object.fromEntries(c.kinds),
    shipped: '',
    levels
  }
}

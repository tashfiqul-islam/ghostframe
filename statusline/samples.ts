// The design board's two sample states, as facts, for the specs: the same data docs/design/statusline-preview.ts
// draws, so the renderer can be compared with it cell for cell.
import type { Facts } from './render.ts'

/** The normal state: calm budgets, edits, a warm cache. */
export const NORMAL: Facts = {
  model: 'Opus 5.5',
  effort: 'medium',
  repo: 'ghostframe',
  branch: 'main',
  dirty: true,
  added: 9300,
  removed: 524,
  pr: null,
  cache: '4m',
  elapsed: '28m',
  ctx: { pct: 41, reset: null, pace: null },
  five: { pct: 34, reset: '2h 14m', pace: 55 },
  week: { pct: 8, reset: 'Mon', pace: 22 }
}

/** Under pressure: context and the 5-hour window red and ahead of pace, the week amber, a PR with changes requested. */
export const PRESSURE: Facts = {
  ...NORMAL,
  pr: { n: 23, state: 'changes requested' },
  cache: null,
  ctx: { pct: 88, reset: null, pace: null },
  five: { pct: 91, reset: '38m', pace: 87 },
  week: { pct: 76, reset: 'Mon', pace: 64 }
}

/** Before any data: no readings, no edits, no cache, a session under a minute old. */
export const EMPTY: Facts = {
  ...NORMAL,
  added: 0,
  removed: 0,
  cache: null,
  elapsed: null,
  ctx: { pct: null, reset: null, pace: null },
  five: { pct: null, reset: null, pace: null },
  week: { pct: null, reset: null, pace: null }
}

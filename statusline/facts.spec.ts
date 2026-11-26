// Reading Claude Code's status line JSON: the cache slot, the PR rules, the session timer, unknown values and
// missing fields.
import { describe, expect, test } from 'bun:test'

import { cacheLeft, factsOf, limit, limitsOf, overlay, prOf } from './facts.ts'

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0)
const sec = (ms: number): number => Math.floor(ms / 1000)

describe('the prompt cache slot', () => {
  test('warm: the time left until it goes cold, from expires_at (epoch seconds)', () => {
    expect(cacheLeft({ warm: true, expires_at: sec(NOW + 52 * 60e3) }, NOW)).toBe('52m')
  })
  test('cold when warm is false, whatever expires_at says', () => {
    expect(cacheLeft({ warm: false, expires_at: sec(NOW + 52 * 60e3) }, NOW)).toBe('cold')
  })
  test('cold when expires_at has passed', () => {
    expect(cacheLeft({ warm: true, expires_at: sec(NOW - 60e3) }, NOW)).toBe('cold')
  })
  test('nothing when prompt_cache is missing, or has no expiry', () => {
    expect(cacheLeft(undefined, NOW)).toBeNull()
    expect(cacheLeft({ warm: true, expires_at: null }, NOW)).toBeNull()
  })
  test('the last miss is not the cache age (the live script read last_miss_at)', () => {
    expect(cacheLeft({ warm: true, expires_at: null, last_miss_at: sec(NOW - 4 * 60e3) }, NOW)).toBeNull()
  })
})

describe('the PR column', () => {
  test('changes_requested replaces the changes column (red)', () => {
    expect(prOf({ number: 23, review_state: 'changes_requested' })).toEqual({ n: 23, state: 'changes requested' })
  })
  test('pending replaces it (amber)', () => {
    expect(prOf({ number: 23, review_state: 'pending' })).toEqual({ n: 23, state: 'pending' })
  })
  test('draft, approved, unknown and missing states leave it alone', () => {
    for (const review_state of ['draft', 'approved', 'merged_somehow', undefined]) expect(prOf({ number: 23, review_state })).toBeNull()
    expect(prOf(undefined)).toBeNull()
    expect(prOf({ review_state: 'pending' })).toBeNull()
  })
})

describe('facts from the JSON', () => {
  test('an empty object: unknown readings, no edits, no timer, nothing thrown', () => {
    const f = factsOf({}, null, {}, NOW)

    expect([f.ctx.pct, f.five.pct, f.week.pct]).toEqual([null, null, null])
    expect([f.added, f.removed, f.cache, f.elapsed, f.pr]).toEqual([0, 0, null, null, null])
    expect(f.model).toBe('Claude')
  })

  test('nonsense of every type is read as missing', () => {
    const f = factsOf({ model: 7, cost: 'x', context_window: { used_percentage: 'high' }, effort: { level: 'turbo' }, pr: [] }, null, {}, NOW)

    expect(f.ctx.pct).toBeNull()
    expect(f.effort).toBe('')
    expect(f.model).toBe('Claude')
  })

  test('the session timer starts at one minute', () => {
    expect(factsOf({ cost: { total_duration_ms: 59_999 } }, null, {}, NOW).elapsed).toBeNull()
    expect(factsOf({ cost: { total_duration_ms: 60_000 } }, null, {}, NOW).elapsed).toBe('1m')
    expect(factsOf({ cost: { total_duration_ms: 28 * 60e3 } }, null, {}, NOW).elapsed).toBe('28m')
  })

  test('model, effort, repo and branch: the worktree branch wins over git, long names are cut', () => {
    const f = factsOf(
      {
        model: { display_name: 'Claude Opus 5.5' },
        effort: { level: 'xhigh' },
        workspace: { current_dir: 'D:\\Projects\\ghostframe\\hooks', project_dir: 'D:\\Projects\\ghostframe' },
        worktree: { branch: 'worktree-a-very-long-branch-name' }
      },
      { branch: 'main', dirty: true },
      {},
      NOW
    )

    expect([f.model, f.effort, f.repo, f.dirty]).toEqual(['Opus 5.5', 'xhigh', 'ghostframe', true])
    expect(f.branch).toBe('worktree-a-very-lon…')
    expect(factsOf({ workspace: { current_dir: '/home/me/src/app', repo: { name: 'app-repo' } } }, null, {}, NOW).repo).toBe('app-repo')
  })

  test('context is a whole percentage held to 0–100', () => {
    expect(factsOf({ context_window: { used_percentage: 41.6 } }, null, {}, NOW).ctx.pct).toBe(42)
    expect(factsOf({ context_window: { used_percentage: 140 } }, null, {}, NOW).ctx.pct).toBe(100)
  })
})

describe('rate limits', () => {
  test('reset within a day is a duration, past a day a weekday; pace is the share of the window elapsed', () => {
    const five = limit({ used_percentage: 34, resets_at: sec(NOW + (2 * 60 + 14) * 60e3) }, 5 * 3600e3, NOW)

    expect(five.pct).toBe(34)
    expect(five.reset).toBe('2h 14m')
    expect(Math.round(five.pace ?? -1)).toBe(55)
    expect(limit({ used_percentage: 8, resets_at: sec(NOW + 3 * 24 * 3600e3) }, 7 * 24 * 3600e3, NOW).reset).toBe(
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(NOW + 3 * 24 * 3600e3).getDay()] ?? ''
    )
  })

  test('no pace and no reset without a reset time', () => {
    expect(limit({ used_percentage: 34 }, 5 * 3600e3, NOW)).toEqual({ pct: 34, reset: null, pace: null })
  })

  test('live limits win; else the cache, without windows whose reset has passed', () => {
    const live = { five_hour: { used_percentage: 5, resets_at: sec(NOW + 60e3) } }
    const cached = { five_hour: { used_percentage: 50, resets_at: sec(NOW + 60e3) }, seven_day: { used_percentage: 20, resets_at: sec(NOW - 1) } }

    expect(limitsOf(live, cached, NOW).five_hour?.used_percentage).toBe(5)
    expect(limitsOf(undefined, cached, NOW)).toEqual({ five_hour: cached.five_hour, seven_day: null })
    expect(limitsOf(undefined, null, NOW)).toEqual({})
  })
})

describe('the live checks fixture', () => {
  test('objects merge key by key; anything else replaces', () => {
    expect(overlay({ a: { b: 1, c: 2 }, d: 3 }, { a: { c: 9 }, e: [1] })).toEqual({ a: { b: 1, c: 9 }, d: 3, e: [1] })
    expect(overlay({ a: 1 }, null)).toBeNull()
  })
})

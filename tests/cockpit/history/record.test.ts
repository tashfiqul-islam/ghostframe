import { expect, test } from 'claude-code/testing'

import { STORE_MAX, planBudget, trimmed } from '../../../hooks/cockpit/history/record'
import type { Kept } from '../../../hooks/cockpit/history/record'
import type { TurnRecord } from '../../../types'
import { aTurn } from '../../support/history'

const kept = (key: string, savedAt: number, turns: TurnRecord[]): Kept => ({ key, savedAt, turns })
const sizeOf = (k: Kept) => k.key.length + JSON.stringify({ savedAt: k.savedAt, turns: k.turns }).length + 8

test('a 30-turn session fits the store with room to spare, its summaries a small part of it', () => {
  const turns = Array.from({ length: 30 }, (_, i) => aTurn(i + 1, i * 100_000))
  const whole = sizeOf(kept('history:s', 0, turns))
  const summaries = sizeOf(kept('history:s', 0, turns.map(trimmed)))

  // About 1.5 MB in all for these 30 turns (20 steps each, with excerpts, patches and diffs), about 0.3 MB of it
  // summaries: both far under the 4 MiB store.
  expect(whole).toBeLessThan(STORE_MAX / 2)
  expect(summaries).toBeLessThan(whole / 2)
  expect(planBudget(kept('history:s', 0, turns), []).own.turns.every(t => !t.isTrimmed)).toBe(true)
})

test('over the budget: the oldest turns lose their bulky parts first, oldest first; summaries stay', () => {
  const turns = Array.from({ length: 30 }, (_, i) => aTurn(i + 1, i * 100_000))
  const whole = sizeOf(kept('history:s', 0, turns))
  const plan = planBudget(kept('history:s', 0, turns), [], Math.floor(whole * 0.6))
  const marks = plan.own.turns.map(t => t.isTrimmed)

  expect(plan.own.turns).toHaveLength(30)
  // Trimmed from the oldest: a run of trimmed turns, then untrimmed ones.
  expect(marks.indexOf(false)).toBeGreaterThan(0)
  expect(marks.slice(marks.indexOf(false)).every(m => !m)).toBe(true)
  expect(plan.own.turns[0]).toMatchObject({ isTrimmed: true, diffs: [] })
  expect(plan.own.turns[0]?.details.every(d => d.excerpt.length === 0 && d.patch.length === 0)).toBe(true)
  // The summary rows of a trimmed turn are all there.
  expect(plan.own.turns[0]?.steps).toHaveLength(20)
  expect(plan.own.turns[0]?.files).toHaveLength(3)
  expect(sizeOf(plan.own)).toBeLessThanOrEqual(Math.floor(whole * 0.6))
})

test('the store is shared: an older session`s bulky parts go before this one`s, then the oldest sessions whole', () => {
  const old = kept('history:old', 1, [aTurn(1, 0), aTurn(2, 1)])
  const mine = kept('history:mine', 9, [aTurn(1, 1_000_000), aTurn(2, 1_100_000)])
  const room = sizeOf(mine) + sizeOf(old) - 1_000
  const plan = planBudget(mine, [old], room)

  expect(plan.deleted).toEqual([])
  expect(plan.others[0]?.turns[0]?.isTrimmed).toBe(true)
  expect(plan.own.turns.every(t => !t.isTrimmed)).toBe(true)

  // With no bulky part left anywhere, the oldest other session goes, never this session's summaries.
  const bare = kept('history:old', 1, old.turns.map(trimmed))
  const tight = planBudget(kept('history:mine', 9, mine.turns.map(trimmed)), [bare], sizeOf(kept('history:mine', 9, mine.turns.map(trimmed))) + 10)
  expect(tight.deleted).toEqual(['history:old'])
  expect(tight.own.turns).toHaveLength(2)
})

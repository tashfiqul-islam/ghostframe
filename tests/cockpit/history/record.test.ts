import { expect, test } from 'claude-code/testing'

import { STORE_MAX, planBudget, recordOf, trimmed } from '../../../hooks/cockpit/history/record'
import { newLog } from '../../../hooks/cockpit/steps/log'
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

test('a session`s prompt stamps count with its history and go with it: both keys, together', () => {
  const mine = kept('history:mine', 9, [trimmed(aTurn(1, 1_000_000))])
  const old: Kept = { ...kept('history:old', 1, [trimmed(aTurn(1, 0))]), extra: 10_000, also: ['prompts:old'] }
  // Room for both histories, not for the old session's stamps too.
  const plan = planBudget(mine, [old], sizeOf(mine) + sizeOf(old) + 5_000)

  expect(plan.deleted).toEqual(['history:old', 'prompts:old'])
  expect(plan.own.turns).toHaveLength(1)
})

test('stamps with no history (a session Cockpit never kept) are a session of their own, the oldest evicted first', () => {
  const mine = kept('history:mine', 9, [trimmed(aTurn(1, 1_000_000))])
  const older: Kept = { ...kept('prompts:older', 1, []), extra: 4_000 }
  const newer: Kept = { ...kept('prompts:newer', 5, []), extra: 4_000 }
  const plan = planBudget(mine, [newer, older], sizeOf(mine) + 6_000)

  expect(plan.deleted).toEqual(['prompts:older'])
})

test('a turn keeps its agents` own steps (subjects cut at 200) and their details, which trim with the turn`s (B1, B5)', () => {
  const base = aTurn(1, 0)
  const step = { id: 'ag1', kind: 'shell', subject: 'x'.repeat(300), key: 'k', result: 'ok', mark: '' as const, isRunning: false, clock: 1_000 }
  const agent = {
    id: 'a1',
    call: 'c1',
    parent: null,
    name: 'Edit note',
    isBackground: true,
    state: 'done' as const,
    kind: 'done',
    subject: '',
    steps: 1,
    startedAt: 0,
    endedAt: 2_000,
    subjectAt: 0,
    pending: null,
    log: [step]
  }
  const detail = { id: 'ag1', tool: 'Bash', command: 'x', startAt: 0, ms: 5, isFailed: false, lines: 1, excerpt: ['out'], patch: [] }
  const log = { ...newLog('t1', 0), turnNo: 1, steps: base.steps }
  const record = recordOf({
    log,
    work: { todo: [], isRevised: false, files: [], sources: [], cited: [] },
    roster: [agent],
    receipts: [],
    details: [detail],
    diffs: []
  })

  expect(record.roster[0]?.log?.[0]?.subject).toHaveLength(200)
  expect(record.details.map(d => d.id)).toEqual(['ag1'])
  expect(trimmed(record).details[0]?.excerpt).toEqual([])
  expect(trimmed(record).roster[0]?.log).toHaveLength(1)
})

test('a trimmed turn keeps each agent`s newest 20 steps and counts the rest', () => {
  const step = (i: number) => ({ id: `s${i}`, kind: 'read', subject: `f${i}`, key: 'k', result: '', mark: '' as const, isRunning: false, clock: i })
  const agent = {
    ...aTurn(1, 0).roster[0],
    id: 'a1',
    call: '',
    parent: null,
    name: 'x',
    isBackground: true,
    state: 'done' as const,
    kind: 'done',
    subject: '',
    steps: 30,
    startedAt: 0,
    endedAt: 1,
    subjectAt: 0,
    pending: null,
    log: Array.from({ length: 30 }, (_, i) => step(i)),
    logDropped: 2
  }
  const cut = trimmed({ ...aTurn(1, 0), roster: [agent] }).roster[0]
  expect(cut?.log?.map(s => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => `s${i + 10}`))
  expect(cut?.logDropped).toBe(12)
})

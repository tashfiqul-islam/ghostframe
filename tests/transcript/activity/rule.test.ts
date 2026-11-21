import { expect, test } from 'claude-code/testing'

import { activityHead } from '../../../hooks/transcript/activity/rule'

test('the activity rule sits on the first step of its turn', async () => {
  const list = [
    { id: 'a', turn: 't1', at: 1000, ms: 100 },
    { id: 'b', turn: 't2', at: 5000, ms: 200 },
    { id: 'c', turn: 't2', at: 5300, ms: 41_000 - 300 }
  ]
  expect(activityHead(list, 'b')).toBe('2 steps · 41s')
  expect(activityHead(list, 'c')).toBe(undefined)
  expect(activityHead([...list.slice(0, 2), { id: 'c', turn: 't2', at: 5300, ms: null }], 'b')).toBe('2 steps')
})

test('a turn with a million steps: the activity rule does not throw', () => {
  const steps = Array.from({ length: 1_000_000 }, (_, i) => ({ id: String(i), turn: 't', at: i, ms: 1 }))
  expect(activityHead(steps, '0')).toBe('1000000 steps · 16m 40s')
})

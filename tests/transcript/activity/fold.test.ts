import { expect, test } from 'claude-code/testing'

import { foldOf, foldRow, foldSummary } from '../../../hooks/transcript/activity/fold'
import { partsWidth } from '../../../hooks/shared/parts'

const never = () => false
const stamp = (n: number, opts: { running?: number[]; tools?: string[]; failed?: number[]; turn?: string } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    turn: opts.turn ?? 't',
    at: i * 1000,
    ms: opts.running?.includes(i + 1) === true ? null : 500,
    tool: opts.tools?.[i] ?? 'Read',
    ok: opts.failed?.includes(i + 1) !== true
  }))

test('a turn folds only past eight finished steps, keeping the latest five as rows', async () => {
  expect(foldOf(stamp(8), 's1', never)).toBe(undefined)

  const nine = stamp(9)
  expect(foldOf(nine, 's1', never)).toEqual({ isAnchor: true, count: 4, summary: '4 reads', failed: 0, wall: 3500 })
  expect(foldOf(nine, 's4', never)?.isAnchor).toBe(false)
  expect(foldOf(nine, 's5', never)).toBe(undefined) // one of the latest five

  // A running step stops the fold there; nothing below it moves.
  expect(foldOf(stamp(12, { running: [3] }), 's1', never)?.count).toBe(2)
  // A browser frame is never cut: the fold stops at the first browser call.
  const tools = ['Read', 'Edit', 'mcp__playwright__browser_navigate', ...Array(9).fill('Read')]
  expect(foldOf(stamp(12, { tools }), 's1', t => (t ?? '').includes('playwright'))?.count).toBe(2)
  // Another turn's steps never count.
  expect(foldOf([...stamp(9), ...stamp(3, { turn: 'u' }).map(x => ({ ...x, id: `u${x.id}` }))], 's1', never)?.count).toBe(4)
})

test('the fold row: count, summary in words, ✓ or failures, time — exactly the measure', async () => {
  expect(foldSummary(['Read', 'Read', 'Edit', 'Bash', 'Bash', 'Bash', 'Grep'])).toBe('3 commands, 2 reads, 1 edit')

  const f = foldOf(stamp(11, { tools: ['Read', 'Edit', 'Bash', 'Bash', 'Read', 'Read'], failed: [3] }), 's1', never)
  if (f === undefined) throw new Error('no fold')
  const row = foldRow(f, 96)
  expect(row.map(p => p.t).join('')).toMatch(/^◦ 6 earlier steps · 3 reads, 2 commands, 1 edit +1 fail {3} +6s$/)
  for (const w of [96, 60, 30]) expect(partsWidth(foldRow(f, w))).toBe(w)
})

test('fold row: a long time is never clipped; unknown tools read `N other`', async () => {
  expect(foldSummary(['Mystery', 'Mystery', 'Read'])).toBe('2 other, 1 read')
  const row = foldRow({ isAnchor: true, count: 9, summary: '9 reads', failed: 0, wall: 72_000 }, 96)
  expect(row.map(p => p.t).join('')).toMatch(/ 1m 12s$/)
  expect(partsWidth(row)).toBe(96)
  const hour = foldRow({ isAnchor: true, count: 9, summary: '9 reads', failed: 0, wall: 3_900_000 }, 60)
  expect(hour.map(p => p.t).join('')).toMatch(/1h 05m$/)
})

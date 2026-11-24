import { expect, test } from 'claude-code/testing'

import { changeCount, clockTime, count, dayWord, duration, rulerTime, timeRange } from '../../../hooks/shared/look/format'

const at = (h: number, m: number, s: number, day = 23) => new Date(2026, 10, day, h, m, s).getTime()

test('durations (5.2): <1s, whole seconds, minutes with two-digit seconds, hours with two-digit minutes; no decimals', () => {
  expect([0, 400, 999, 1_000, 6_400, 41_000, 59_999].map(duration)).toEqual(['<1s', '<1s', '<1s', '1s', '6s', '41s', '59s'])
  expect([60_000, 66_000, 164_000, 3_599_000].map(duration)).toEqual(['1m 00s', '1m 06s', '2m 44s', '59m 59s'])
  expect([3_600_000, 3_720_000, 36_000_000].map(duration)).toEqual(['1h 00m', '1h 02m', '10h 00m'])
  expect([-1, Number.NaN].map(duration)).toEqual(['', ''])
  for (const ms of [0, 1_500, 63_250, 3_723_000]) expect(duration(ms)).not.toContain('.')
})

test('clock times (5.1): HH:MM:SS, 24-hour; the ruler drops seconds from two minutes up', () => {
  expect(clockTime(at(9, 2, 10))).toBe('09:02:10')
  expect(clockTime(at(16, 31, 2))).toBe('16:31:02')
  expect(rulerTime(at(10, 14, 2), 164_000)).toBe('10:14')
  expect(rulerTime(at(16, 20, 40), 18_000)).toBe('16:20:40')
})

test('the day (5.1): its name only when the calendar day differs from the previous prompt`s', () => {
  expect(dayWord(at(9, 2, 10, 24), at(18, 20, 44, 23))).toBe('Tue')
  expect(dayWord(at(18, 20, 44), at(9, 0, 0))).toBe('')
  expect(dayWord(at(9, 0, 0), undefined)).toBe('')
  expect(timeRange(at(9, 2, 10, 24), at(9, 3, 16, 24), 'Tue')).toBe('Tue 09:02:10 → 09:03:16')
  expect(timeRange(at(10, 14, 2), undefined)).toBe('10:14:02 → now')
})

test('counts (5.3): plain integers joined to their noun, U+2212 for minus', () => {
  expect([count(1, 'step'), count(23, 'step'), count(0, 'step'), count(14, ['entry', 'entries'])]).toEqual(['1 step', '23 steps', '0 steps', '14 entries'])
  expect([changeCount(12, 1), changeCount(12, 0), changeCount(0, 1), changeCount(0, 0)]).toEqual(['+12 −1', '+12', '−1', ''])
})

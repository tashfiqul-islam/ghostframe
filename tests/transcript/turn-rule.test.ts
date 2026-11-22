import { expect, test } from 'claude-code/testing'

import { C } from '../../hooks/shared/tokens'
import { turnClock, turnRuleParts } from '../../hooks/transcript/turn-rule'

const joined = (parts: readonly { t: string }[]) => parts.map(p => p.t).join('')

test('the turn rule (E.1): `─`, `[ TURN n ]` from column 2, solid fill, the clock ending on the last cell', () => {
  const row = joined(turnRuleParts(7, undefined, '10:26', 80))

  expect(row).toBe(`─ [ TURN 7 ] ${'─'.repeat(61)} 10:26`)
  expect(row.length).toBe(80)
})

test('label states name what came before the turn', () => {
  expect(joined(turnRuleParts(15, 'resume', '09:02', 60))).toMatch(/^─ \[ TURN 15 · RESUMED \] ─+ 09:02$/)
  expect(joined(turnRuleParts(31, 'compact', '23:59', 60))).toMatch(/^─ \[ TURN 31 · AFTER COMPACT \] ─+ 23:59$/)
  expect(joined(turnRuleParts(13, 'rewind', '23:21', 60))).toMatch(/^─ \[ TURN 13 · AFTER REWIND \] ─+ 23:21$/)
})

test('colours follow E.1`s paint: rule, dim brackets, bright TURN n, muted state and clock', () => {
  const parts = turnRuleParts(3, 'resume', '10:26', 60)
  const colorOf = (t: string) => parts.find(p => p.t === t)?.color

  expect(colorOf('─ ')).toBe(C.rule)
  expect(colorOf('[ ')).toBe(C.dim)
  expect(colorOf('TURN 3')).toBe(C.textBright)
  expect(colorOf(' · RESUMED')).toBe(C.muted)
  expect(colorOf(' ]')).toBe(C.dim)
  expect(colorOf('10:26')).toBe(C.muted)
})

test('narrow: below 40 cells the clock goes, the fill keeps the row exact', () => {
  expect(joined(turnRuleParts(7, undefined, '10:26', 40))).toMatch(/ 10:26$/)
  expect(joined(turnRuleParts(7, undefined, '10:26', 39))).toBe(`─ [ TURN 7 ] ${'─'.repeat(26)}`)
})

test('narrow: a clock that leaves no fill goes at any width; the label never does', () => {
  expect(joined(turnRuleParts(31, 'compact', 'Thu 19 Nov · 09:02', 48))).toBe(`─ [ TURN 31 · AFTER COMPACT ] ${'─'.repeat(18)}`)
  expect(joined(turnRuleParts(31, 'compact', '23:59', 20))).toBe('─ [ TURN 31 · AFTER COMPACT ]')
})

test('the clock: 24-hour time, with the day when it differs from the previous turn`s', () => {
  const at = new Date(2026, 10, 19, 9, 2).getTime()

  expect(turnClock(at, undefined)).toBe('09:02')
  expect(turnClock(at, new Date(2026, 10, 19, 0, 1).getTime())).toBe('09:02')
  expect(turnClock(at, new Date(2026, 10, 18, 23, 58).getTime())).toBe('Thu 19 Nov · 09:02')
  expect(turnClock(new Date(2026, 0, 4, 14, 30).getTime(), new Date(2025, 11, 31, 8, 0).getTime())).toBe('Sun 4 Jan · 14:30')
})

test('a prompt Cockpit never numbered (typed while it was off) keeps the label, without a number', () => {
  expect(joined(turnRuleParts(undefined, undefined, '10:26', 40))).toBe(`─ [ TURN ] ${'─'.repeat(23)} 10:26`)
})

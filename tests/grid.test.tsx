import { expect, test } from 'claude-code/testing'

import { measure } from '../hooks/shared/layout'
import { clip, clipMiddle, pad, vw } from '../hooks/shared/text'
import { fmtDuration, fmtTokens } from '../hooks/shared/time'

test('visible width counts wide and zero-width cells', async () => {
  expect(vw('abc')).toBe(3)
  expect(vw('┄┆+●')).toBe(4)
  expect(vw('日本')).toBe(4)
  expect(vw('é')).toBe(1)
})

test('clip and pad never exceed the width asked', async () => {
  for (const s of ['short', 'a much longer line of prose here', '日本語のテキスト', '']) {
    for (const n of [1, 5, 8, 12]) {
      expect(vw(clip(s, n)) <= n).toBe(true)
      expect(vw(pad(s, n))).toBe(n)
      expect(vw(pad(s, n, 'right'))).toBe(n)
      expect(vw(clipMiddle(s, n)) <= n).toBe(true)
    }
  }

  expect(clip('worktree', 5)).toBe('work…')
  expect(clipMiddle('src/toast/ProductSearch.tsx', 16)).toBe('src/toa…arch.tsx')
})

test('formats follow the spec', async () => {
  expect(fmtDuration(400)).toBe('0.4s')
  expect(fmtDuration(3000)).toBe('3s')
  expect(fmtDuration(26_000)).toBe('26s')
  expect(fmtDuration(270_000)).toBe('4m 30s')
  expect(fmtDuration(3_900_000)).toBe('1h 05m')
  expect(fmtTokens(412)).toBe('412 tokens')
  expect(fmtTokens(48_200)).toBe('48.2k tokens')
  expect(fmtTokens(1_200_000)).toBe('1.2M tokens')
})

test('one measure: min(96, viewport − 14)', async () => {
  expect(measure(120)).toBe(96)
  expect(measure(100)).toBe(86)
  expect(measure(undefined)).toBe(undefined)
})

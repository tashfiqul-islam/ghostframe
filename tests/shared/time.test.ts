import { expect, test } from 'claude-code/testing'

import { fmtDuration, fmtTokens } from '../../hooks/shared/time'

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

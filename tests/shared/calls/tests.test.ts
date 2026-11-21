import { expect, test } from 'claude-code/testing'

import { parseTests } from '../../../hooks/shared/calls/tests'
import { runnerOf } from '../../../hooks/shared/calls/describe'
import { LINEAR_MS, ms } from '../../support/linear'

test('linear: a long pytest-like summary line', () => {
  expect(ms(() => parseTests(`== ${'1 passed in 1s '.repeat(2500)}`))).toBeLessThan(LINEAR_MS)
  expect(parseTests('===== 3 failed, 142 passed, 2 skipped in 3.21s =====')).toEqual({ passed: 142, failed: 3, skipped: 2 })
})

test('test summaries: Mocha and dotnet count', () => {
  expect(parseTests('  5 passing (12ms)\n  2 failing\n  1 pending')).toEqual({ passed: 5, failed: 2, skipped: 1 })
  expect(parseTests('Passed!  - Failed:     0, Passed:    12, Skipped:     1, Total:    13, Duration: 1 s')).toEqual({ passed: 12, failed: 0, skipped: 1 })
})

test('test summaries from each runner', async () => {
  expect(parseTests(' Test Files  1 failed | 8 passed (9)\n      Tests  3 failed | 142 passed | 2 skipped (147)')).toEqual({
    passed: 142,
    failed: 3,
    skipped: 2
  })
  expect(parseTests('Tests:       1 failed, 2 skipped, 9 passed, 12 total')).toEqual({ passed: 9, failed: 1, skipped: 2 })
  expect(parseTests('===== 3 failed, 142 passed, 2 skipped in 3.21s =====')).toEqual({ passed: 142, failed: 3, skipped: 2 })
  expect(parseTests('(pass) a [1ms]\n\n 56 pass\n 0 fail\nRan 56 tests across 11 files. [1.50s]')).toEqual({ passed: 56, failed: 0, skipped: 0 })
  expect(parseTests('  145 passed (38.2s)\n  2 skipped')).toEqual({ passed: 145, failed: 0, skipped: 2 })
  expect(parseTests('test result: ok. 10 passed; 0 failed; 1 ignored;\ntest result: ok. 5 passed; 0 failed; 0 ignored;')).toEqual({
    passed: 15,
    failed: 0,
    skipped: 1
  })
  expect(parseTests('random output')).toBe(undefined)
  expect(runnerOf('bunx vitest run')).toBe('vitest')
  expect(runnerOf('claude plugin test .')).toBe('claude plugin test')
  expect(runnerOf('ls')).toBe(undefined)
})

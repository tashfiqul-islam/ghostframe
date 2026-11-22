import { expect, test } from 'claude-code/testing'

import { DIFF_LINES_MAX, lineDiff } from '../../../hooks/cockpit/history/linediff'

test('a line diff: an edit and an append in one file are one combined patch, with context', () => {
  expect(lineDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\nfour\n')).toEqual(['@@ -1,3 +1,4 @@', ' one', '-two', '+TWO', ' three', '+four'])
})

test('a new file is all `+`; a removed one all `−`; equal texts give no hunk', () => {
  expect(lineDiff('', 'a\nb\n')).toEqual(['@@ -0,0 +1,2 @@', '+a', '+b'])
  expect(lineDiff('a\nb\n', '')).toEqual(['@@ -1,2 +0,0 @@', '-a', '-b'])
  expect(lineDiff('same\n', 'same\n')).toEqual([])
})

test('changes far apart are separate hunks, each with three rows of context', () => {
  const before = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
  const after = before.replace('line 2\n', 'line two\n').replace('line 28\n', 'line twenty-eight\n')
  const diff = lineDiff(before, after) ?? []
  expect(diff.filter(r => r.startsWith('@@'))).toEqual(['@@ -1,5 +1,5 @@', '@@ -25,6 +25,6 @@'])
  expect(diff).toContain('-line 28')
  expect(diff).toContain('+line twenty-eight')
})

test('past the line cap the diff is not computed: the caller says why', () => {
  expect(lineDiff('a\n'.repeat(DIFF_LINES_MAX + 1), 'b\n')).toBeUndefined()
})

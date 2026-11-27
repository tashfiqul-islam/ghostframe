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
  const diff = lineDiff(before, after)
  if (!Array.isArray(diff)) throw new Error(`no diff: ${JSON.stringify(diff)}`)
  expect(diff.filter(r => r.startsWith('@@'))).toEqual(['@@ -1,5 +1,5 @@', '@@ -25,6 +25,6 @@'])
  expect(diff).toContain('-line 28')
  expect(diff).toContain('+line twenty-eight')
})

test('past the line cap the diff is not computed: the caller says why', () => {
  expect(lineDiff('a\n'.repeat(DIFF_LINES_MAX + 1), 'b\n')).toEqual({ over: 'lines' })
})

// The test host has no `process` to read memory from: the budget's path taken, and its time, stand for it (that path
// keeps at most DIFF_CHANGES_MAX copies of one 80 KB array: 40 MB at the line cap).
test('a rewrite of every line, at the line cap, is over the change budget: given up in under 200 ms', () => {
  const before = Array.from({ length: DIFF_LINES_MAX }, (_, i) => `old ${i}`).join('\n')
  const after = Array.from({ length: DIFF_LINES_MAX }, (_, i) => `new ${i}`).join('\n')
  const start = performance.now()
  const diff = lineDiff(before, after)
  const ms = performance.now() - start

  expect(ms).toBeLessThan(200)
  expect(diff).toEqual({ over: 'changes' })
})

test('lines only added or only removed are no walk, so no budget: a new 600-line file, 600 lines appended, a file emptied', () => {
  const many = Array.from({ length: 600 }, (_, i) => `line ${i}`)
  const created = lineDiff('', `${many.join('\n')}\n`)
  const appended = lineDiff('a\nb\n', `a\nb\n${many.join('\n')}\n`)
  const emptied = lineDiff(`${many.join('\n')}\n`, '')

  expect(created).toEqual(['@@ -0,0 +1,600 @@', ...many.map(l => `+${l}`)])
  expect(appended).toEqual(['@@ -1,2 +1,602 @@', ' a', ' b', ...many.map(l => `+${l}`)])
  expect(emptied).toEqual(['@@ -1,600 +0,0 @@', ...many.map(l => `-${l}`)])
})

test('600 lines inserted between kept lines: the kept head and tail are context, the insert is all `+`', () => {
  const many = Array.from({ length: 600 }, (_, i) => `new ${i}`)
  const kept = Array.from({ length: 10 }, (_, i) => `kept ${i}`)
  const diff = lineDiff(kept.join('\n'), [...kept.slice(0, 5), ...many, ...kept.slice(5)].join('\n'))

  expect(diff).toEqual(['@@ -3,6 +3,606 @@', ' kept 2', ' kept 3', ' kept 4', ...many.map(l => `+${l}`), ' kept 5', ' kept 6', ' kept 7'])
})

test('a change inside the budget is still diffed in full', () => {
  const before = Array.from({ length: DIFF_LINES_MAX }, (_, i) => `line ${i}`).join('\n')
  const after = before.replace('line 10\n', 'line ten\n')

  expect(lineDiff(before, after)).toEqual(['@@ -8,7 +8,7 @@', ' line 7', ' line 8', ' line 9', '-line 10', '+line ten', ' line 11', ' line 12', ' line 13'])
})

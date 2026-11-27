import { expect, test } from 'claude-code/testing'

import { filesFromDiff } from '../../../hooks/cockpit/sections/files'
import type { Counted } from '../../../hooks/cockpit/sections/files'

// A work tree's file lists before and after a call, 40,000 entries each (a big untracked folder): the comparison is
// keyed by path, never a search of one list for each entry of the other.
const listOf = (n: number, added: (i: number) => number): Counted[] =>
  Array.from({ length: n }, (_, i) => ({ path: `cache/d${Math.floor(i / 200)}/f${i % 200}.txt`, added: added(i), removed: 0, isUntracked: true }))

test('comparing file lists of 40,000 entries before and after a call takes under 100 ms', () => {
  const before = listOf(40_000, () => 5)
  // The call appended to three files and added 40,000 new ones.
  const after = [...listOf(40_000, i => (i < 3 ? 6 : 5)), ...listOf(40_000, () => 1).map(f => ({ ...f, path: `new/${f.path}` }))]
  // A first call on a short list compiles the code, as the session's earlier calls have: the time is the work's own.
  filesFromDiff([], before.slice(0, 1_000), after.slice(0, 1_000), '/repo', '/repo')
  const t = performance.now()
  const files = filesFromDiff([], before, after, '/repo', '/repo')
  const ms = performance.now() - t

  expect(ms).toBeLessThan(100)
  expect(files.length).toBe(40_003)
  expect(files.slice(0, 3).map(f => [f.path, f.adds])).toEqual([
    ['cache/d0/f0.txt', 1],
    ['cache/d0/f1.txt', 1],
    ['cache/d0/f2.txt', 1]
  ])
  expect(files[3]?.tag).toBe('new')
})

test('the list keeps each file once, where it was first touched, its counts added up', () => {
  const before: Counted[] = [{ path: 'a.ts', added: 1, removed: 0, isUntracked: false }]
  const after: Counted[] = [
    { path: 'a.ts', added: 3, removed: 1, isUntracked: false },
    { path: 'b.ts', added: 2, removed: 0, isUntracked: true }
  ]
  const files = filesFromDiff([{ path: 'b.ts', tag: '', adds: 1, dels: 0 }], before, after, '/repo', '/repo')

  expect(files).toEqual([
    { path: 'b.ts', tag: '', adds: 3, dels: 0 },
    { path: 'a.ts', tag: '', adds: 2, dels: 1 }
  ])
})

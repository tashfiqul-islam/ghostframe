import { expect, test } from 'claude-code/testing'

import { clip, clipMiddle, pad, vw } from '../../hooks/shared/text'

test('visible width counts wide and zero-width cells', async () => {
  expect(vw('abc')).toBe(3)
  expect(vw('┄┆+●')).toBe(4)
  expect(vw('日本')).toBe(4)
  expect(vw('é')).toBe(1)
})

// Terminals draw each of these in two cells (Unicode East Asian Width W, emoji presentation, one ZWJ family).
test('visible width counts emoji and grapheme clusters as the terminal draws them', () => {
  expect(vw('🚀')).toBe(2)
  expect(vw('✅')).toBe(2)
  expect(vw('❌')).toBe(2)
  expect(vw('⚠️')).toBe(2)
  expect(vw('👨‍👩‍👧')).toBe(2)
  expect(vw('中')).toBe(2)
  expect(vw('| ✅ | ok |')).toBe(11)
})

test('clip and pad never exceed the width asked with emoji and clusters', () => {
  for (const s of ['✅ tests pass ✅ lint ✅ types', '🚀🚀🚀🚀🚀🚀', '👨‍👩‍👧 family ⚠️ warning', 'é✅中']) {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      expect(vw(clip(s, n))).toBeLessThanOrEqual(n)
      expect(vw(pad(s, n))).toBe(n)
      expect(vw(clipMiddle(s, n))).toBeLessThanOrEqual(n)
    }
  }
  // A cut never splits a cluster: the family stays whole or goes.
  expect(clip('👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧', 5)).toBe('👨‍👩‍👧👨‍👩‍👧…')
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

test('clipping: prose at a word boundary, never punctuation before …; paths keep middle-clipping', async () => {
  expect(clip('The queue dedupes by key, then flushes', 20)).toBe('The queue dedupes…')
  expect(clip('Fixed the race. Then the toast', 17)).toBe('Fixed the race…')
  expect(clip('one, two, three, four', 10)).toBe('one, two…')
  for (const s of ['Wait, then retry. Then wait again, then go', 'a.b.c.d.e.f.g.h', 'x, y, z, w, v, u']) {
    for (let n = 3; n < vw(s); n++) {
      const c = clip(s, n)
      expect(vw(c)).toBeLessThanOrEqual(n)
      expect(c).not.toMatch(/[\s.,;:!?]…$/)
    }
  }
  // One long word: cut inside it rather than lose the room.
  expect(clip('supercalifragilistic', 10)).toBe('supercali…')
  // Paths still clip in the middle, characters exact.
  expect(clipMiddle('src/components/ProductSearch.tsx', 20)).toBe('src/compo…Search.tsx')
})

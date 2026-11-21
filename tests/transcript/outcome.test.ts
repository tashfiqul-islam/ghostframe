import { expect, test } from 'claude-code/testing'

import { testsFrame } from '../../hooks/transcript/outcome'
import { W } from '../support/view'

test('tests card: zero counts left out; all passing is `75 passed` on a full green rail; `was` only when counts moved', async () => {
  const run = { id: 'x', runner: 'bun test', passed: 75, failed: 0, skipped: 0 }
  const lines = testsFrame(W, run, undefined, 1000)
  const text = lines.map(l => l.map(p => p.t).join(''))
  expect(text[1]).toMatch(/^┆ 75 passed +┆$/)
  expect(text.join('\n')).not.toMatch(/0 failed|0 skipped/)
  expect(lines[2]?.filter(p => p.t.includes('━')).every(p => p.color === '#96d292')).toBe(true)
  expect(lines[2]?.some(p => p.t.includes('─'))).toBe(false)

  const failing = testsFrame(W, { ...run, passed: 69, failed: 6 }, undefined, 1000).map(l => l.map(p => p.t).join(''))
  expect(failing[1]).toMatch(/^┆ 69 passed    6 failed +┆$/)

  expect(
    testsFrame(W, run, { ...run, id: 'w' }, 1000)
      .map(l => l.map(p => p.t).join(''))
      .join('\n')
  ).not.toMatch(/was /)
  expect(
    testsFrame(W, run, { ...run, id: 'w', passed: 74, failed: 1 }, 1000)
      .map(l => l.map(p => p.t).join(''))
      .join('\n')
  ).toMatch(/was 74 passed · 1 failing/)
})

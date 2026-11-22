import { expect, test } from 'claude-code/testing'

import { commandOf, patchOf } from '../../../hooks/cockpit/keys/details'
import { allRows, detailRows, diffRows } from '../../../hooks/cockpit/keys/views'
import type { Line } from '../../../hooks/cockpit/line'
import { newLog, newTurn, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import { vw } from '../../../hooks/shared/text'
import type { LogStep, StepDetail } from '../../../types'

const W = 72
const text = (lines: readonly Line[]) => lines.map(l => l.parts.map(p => p.t).join(''))
const STEP: LogStep = {
  id: 't1',
  kind: 'test',
  subject: 'bun test tests/width.test.tsx',
  key: 'k',
  result: '2 of 14 fail',
  mark: '✕',
  isRunning: false,
  clock: 41_000
}
const DETAIL: StepDetail = {
  id: 't1',
  tool: 'Bash',
  command: 'bun test tests/width.test.tsx --bail',
  startAt: 0,
  ms: 19_200,
  isFailed: true,
  lines: 96,
  excerpt: ['(fail) width > counts a skin-tone modifier [0.38ms]', ' 12 pass', ' 2 fail'],
  patch: []
}

test('a step`s detail: its label, the full command, how it ran, the output excerpt and what was left out', () => {
  const rows = text(detailRows(STEP, DETAIL, 6, 7, W))
  expect(rows[0]).toMatch(/^┄ \[ STEP 6 · TURN 7 \] ┄+ 2 of 14 fail · 41s$/)
  expect(rows[1]).toMatch(/^ {2}test {5}bun test tests\/width\.test\.tsx --bail +$/)
  expect(rows[2]).toMatch(/^ {2}ran {6}19s · failed · 96 lines of output +$/)
  expect(rows.slice(3, 6).map(r => r.trim())).toEqual(DETAIL.excerpt.map(r => r.trim()))
  expect(rows[6]?.trim()).toBe('… 93 more lines · ctrl+o shows all')
  for (const r of rows) expect(vw(r)).toBe(W)

  // A long command wraps under its kind; a detail no longer kept says so.
  const long = text(detailRows(STEP, { ...DETAIL, command: `bun test ${'tests/a-very-long-path/width.test.tsx '.repeat(4)}` }, 6, 7, 40))
  expect(long.filter(r => r.startsWith('  test') || r.startsWith('           ')).length).toBeGreaterThan(2)
  expect(text(detailRows(STEP, undefined, 6, 7, W))[2]).toMatch(/no longer kept/)
})

test('a diff: its label with the counts, each hunk`s header, `+` and `−` rows', () => {
  const patch = [
    '@@ -40,4 +40,5 @@',
    ' import { cellWidth } from "./grid";',
    '-import { LRU } from "./lru";',
    '+import { claim } from "./ledger";',
    '+import { held } from "./held";',
    '@@ -118,2 +119,2 @@',
    '-x',
    '+y'
  ]
  const lines = diffRows('hooks/register.tsx', patch, W)
  const rows = text(lines)
  expect(rows[0]).toMatch(/^┄ \[ DIFF · hooks\/register\.tsx \] ┄+ \+3 −2 · 2 hunks$/)
  expect(rows[1]?.trim()).toBe('hunk 1 of 2 · lines 40 to 44')
  expect(rows[3]?.trim()).toBe('−import { LRU } from "./lru";')
  expect(rows[6]?.trim()).toBe('hunk 2 of 2 · lines 119 to 120')
  expect(lines[4]?.parts[0]?.color).not.toBe(lines[3]?.parts[0]?.color)
  expect(text(diffRows('a.ts', [], W))[1]).toMatch(/no diff kept/)
})

test('the full step view: every step of the turn, each openable, under `STEPS · TURN n · ALL`', () => {
  let log = newTurn(newLog(null, null), 't1', 0)

  for (let i = 0; i < 30; i++) {
    log = startStep(log, { id: `r${i}`, tool: 'Read', input: { file_path: `f${i}.ts` }, at: i * 1_000 })
    log = settleStep(log, { id: `r${i}`, tool: 'Read', input: { file_path: `f${i}.ts` }, outcome: { result: { file: { numLines: 3 } } }, at: i * 1_000 + 500 })
  }

  const lines = allRows(log, W)
  expect(lines).toHaveLength(31)
  expect(text(lines)[0]).toMatch(/^┄ \[ STEPS · TURN 1 · ALL \] ┄+ 30 steps$/)
  expect(lines.slice(1).map(l => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => `step:r${i}`))
})

test('a call`s full command and an edit`s patch, as the detail keeps them', () => {
  expect(commandOf('Bash', { command: 'bun test --bail' })).toBe('bun test --bail')
  expect(commandOf('Grep', { pattern: 'TODO', path: 'hooks' })).toBe('TODO in hooks')
  expect(commandOf('WebFetch', { url: 'https://bun.sh', prompt: 'x' })).toBe('https://bun.sh')
  expect(patchOf('Edit', {}, { structuredPatch: [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 2, lines: ['-a', '+b', '+c'] }] })).toEqual([
    '@@ -3,1 +3,2 @@',
    '-a',
    '+b',
    '+c'
  ])
  expect(patchOf('Write', { content: 'x\ny\n' }, { type: 'create', structuredPatch: [] })).toEqual(['@@ -0,0 +1,3 @@', '+x', '+y'])
})

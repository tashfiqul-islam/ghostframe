import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'
import { drawnWidth } from '../../../hooks/transcript/prose'
import { GAP, layoutTable, streamLayout } from '../../../hooks/transcript/table/layout'
import { MAX_LINES, cellLines, padding } from '../../../hooks/transcript/table/cells'
import { parseTable } from '../../../hooks/transcript/table/parse'
import type { Cell, Table } from '../../../hooks/transcript/table/parse'
import { tableText } from '../../support/table'

const STATUS = [
  '| Item | Status |',
  '|---|---|',
  '| Open rule `+┄┄ 02:10 ┄┄+`, `+` only at the ends | done with a fallback. Time comes from the clock at `prompt.submit`, matched by text; a prompt with a paste or from a resumed session gets the rule with no time |',
  '| Gutter: `you` grey, `claude` peach | done |',
  '| Close rule | |'
]

const NUMBERS = ['| Name | Files | Size |', '|---|---|---|', '| ts | 1,204 | 42 ms |', '| js | 7 | 186 kB |']

const table = (lines: string[]): Table => {
  const t = parseTable(lines)
  if (t === undefined) throw new Error('did not parse')
  return t
}

/** Every drawn line of a row: each column's line (or blank) padded to its width, gaps between. */
const rowWidths = (t: Table, widths: number[], cells: Cell[]) => {
  const per = widths.map((w, i) => cellLines(cells[i] ?? { runs: [], empty: true }, w, t.kind[i] ?? 'fixed'))
  const height = Math.max(...per.map(p => p.length))

  return Array.from(
    { length: height },
    (_, li) =>
      widths.reduce((sum, w, i) => {
        const runs = per[i]?.[li] ?? []
        const [l, r] = padding(runs, w, t.align[i] ?? 'left')
        // Measured as drawn: the same function the drawing uses (a chip tight before punctuation).
        return sum + l + drawnWidth(runs) + r
      }, 0) +
      GAP * (widths.length - 1)
  )
}

const text = (runs: { t: string }[]) => runs.map(r => r.t).join('')

test('a reply table becomes a plain table block', async () => {
  const blocks = splitBlocks(['Here is the status:', ...STATUS, '', 'After.'].join('\n'))
  expect(blocks.map(b => b.kind)).toEqual(['para', 'table', 'para'])
})

test('numbers right, empty cells are a dim dash, first column is the name', async () => {
  const t = table(NUMBERS)
  expect(t.align).toEqual(['left', 'right', 'right'])
  expect(t.nameFirst).toBe(true)
  expect(table(STATUS).rows[2]?.[1]).toEqual({ runs: [{ t: '—', s: 'plain' }], empty: true })
})

test('every row is exactly the table width, at any measure', async () => {
  for (const lines of [STATUS, NUMBERS]) {
    const t = table(lines)

    for (const room of [96, 60, 30, 12]) {
      const { widths } = layoutTable(t, room)
      const total = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1)
      expect(total <= room).toBe(true)

      for (const cells of t.rows) for (const w of rowWidths(t, widths, cells)) expect(w).toBe(total)
    }
  }
})

test('a prose cell wraps under its first line, top-aligned, never cut mid-word', async () => {
  const t = table(STATUS)
  expect(t.kind).toEqual(['prose', 'prose'])

  const { widths } = layoutTable(t, 60)
  const status = t.rows[0]?.[1]
  if (status === undefined) throw new Error('no cell')

  const lines = cellLines(status, widths[1] ?? 0, 'prose')
  expect(lines.length).toBeGreaterThan(1)
  expect(lines.length <= MAX_LINES).toBe(true)

  // Lines join back into the original words in order: wrapped, not truncated mid-word.
  const words = text(status.runs).split(/\s+/)
  const drawn = lines
    .map(l => text(l).trim())
    .join(' ')
    .replace(/…$/, '')
    .split(/\s+/)
  expect(drawn.slice(0, -1)).toEqual(words.slice(0, drawn.length - 1))

  // The short `done` cell in the same column keeps one line.
  expect(cellLines(t.rows[1]?.[1] ?? status, widths[1] ?? 0, 'prose').length).toBe(1)
})

test('more than 4 lines ends in …; fixed cells and paths never wrap', async () => {
  const long: Cell = { runs: [{ t: 'word '.repeat(60).trim(), s: 'plain' }], empty: false }
  const lines = cellLines(long, 20, 'prose')
  expect(lines.length).toBe(MAX_LINES)
  expect(text(lines[MAX_LINES - 1] ?? []).endsWith('…')).toBe(true)

  const path: Cell = { runs: [{ t: 'src/components/search/ProductSearch.tsx', s: 'plain' }], empty: false }
  expect(cellLines(path, 24, 'fixed').map(text)).toEqual(['src/compone…ctSearch.tsx'])
})

test('fixed columns are sized first; prose shares the rest', async () => {
  const t = table(['| File | Lines | Note |', '|---|---|---|', '| a.ts | 1,204 | a longer description that will have to wrap here |'])
  expect(t.kind).toEqual(['fixed', 'fixed', 'prose'])

  const { widths } = layoutTable(t, 40)
  expect(widths.slice(0, 2)).toEqual([4, 5])
  expect(widths[2]).toBe(40 - 4 - 5 - GAP * 2)
})

test('clips first, then hides right-most columns', async () => {
  const t = table(NUMBERS)
  expect(layoutTable(t, 96).hidden).toBe(0)
  expect(layoutTable(t, 21).hidden).toBe(0)
  expect(layoutTable(t, 20).hidden).toBe(1)
  expect(layoutTable(t, 9).hidden).toBe(2)
})

test('tables we cannot parse go to the engine at full width', async () => {
  // A link inside other text now parses; every remaining condition: tests/transcript/table/parse.test.ts.
  const linked = ['| a | b |', '|---|---|', '| see [docs](https://x.dev) here | 1 |']
  expect(splitBlocks(linked.join('\n'))[0]?.kind).toBe('table')

  const ragged = ['| a | b |', '|---|---|', '| 1 | 2 | 3 |']
  expect(splitBlocks(ragged.join('\n'))[0]?.kind).toBe('wide')
})

test('a pipe table inside a code fence stays code', async () => {
  const fenced = ['```', '| a | b |', '|---|---|', '```'].join('\n')
  expect(splitBlocks(fenced).map(b => b.kind)).toEqual(['markdown'])
})

test('alignment is per cell: numbers right, text left, even inside a numeric column', () => {
  const md = ['| Check | Before |', '|---|---:|', '| flush time | 123456789 ms |', '| toasts | 2 |', '| docs | see notes |'].join('\n')
  const lines = tableText(md, 90)
  const row = (name: string) => lines.find(l => l.includes(name)) ?? ''
  // The widest cell fills the column: its start and end are the column's edges.
  const left = row('flush time').indexOf('123456789 ms')
  const right = left + '123456789 ms'.length

  expect(left).toBeGreaterThan(0)
  expect(row('toasts').indexOf('2') + 1).toBe(right) // a number: right edge
  expect(row('docs').indexOf('see notes')).toBe(left) // text: left edge
  expect(row('Before').indexOf('Before') + 'Before'.length).toBe(right) // the header keeps the column's
})
const BUN = `| Version | Released | Fixes | Highlights | Post |
|---|---|---|---|---|
| v1.4.4 | Oct 22, 2026 | 271 issues, 544 👍 | — (the blog index gives counts only) | bun.com/blog/bun-v1.4.4 |
| v1.4.2 | Sep 5, 2026 | 2 regressions, plus crashes and hangs | Elysia and AsyncLocalStorage regressions, a \`@discordjs/ws\` hang, CMYK JPEG decoding in \`Bun.Image\`, a JIT crash and a GC crash on musl | bun.com/blog/bun-v1.4.2 |`

test('a prose column is never narrower than its longest word (≤ 24); the fixed columns give first', async () => {
  const b = splitBlocks(BUN)[0]
  if (b?.kind !== 'table') throw new Error('no table')
  const t = b.table

  for (const room of [96, 88, 86, 76, 68]) {
    const { widths, hidden } = layoutTable(t, room)
    if (hidden > 0) continue
    expect(widths[3]).toBeGreaterThanOrEqual(17) // `AsyncLocalStorage`
    expect(widths[2]).toBeGreaterThanOrEqual(12) // `regressions,`
    // No word in a prose cell is cut: every drawn line ends in a whole word.
    for (const row of t.rows) {
      for (const ci of [2, 3]) {
        const cell = row[ci]
        if (cell === undefined) continue
        const text = cellLines(cell, widths[ci] ?? 1, 'prose')
          .map(l => l.map(r => r.t).join(''))
          .join(' ')
        expect(text).not.toMatch(/AsyncLocalStora…/)
      }
    }
  }

  // A word past 24 cells doesn't hold the column wider than 24.
  const long = splitBlocks(`| a | b |\n|---|---|\n| x | ${'w'.repeat(40)} and more words here to wrap |`)[0]
  if (long?.kind !== 'table') throw new Error('no table')
  expect(layoutTable(long.table, 30).widths[1]).toBeLessThanOrEqual(26)
})

test('streamLayout: freezes on the first complete row, holds while live, re-flows when done unless off screen', async () => {
  const head = '| Id | Status |\n|---|---|\n'
  const table = (text: string) => {
    const b = splitBlocks(text, true)[0]
    if (b?.kind !== 'table') throw new Error('not a table')
    return b
  }

  // Header plus a half-written first row: nothing complete yet, nothing frozen.
  const early = table(`${head}| r01 | **Done, wi`)
  expect(early.partial).toBe(true)
  expect(early.table.rows).toHaveLength(1) // the half row still draws (marks dropped for now)
  expect(streamLayout(early, 96, true, undefined, false).hold).toBe(undefined)

  // First row complete, second streaming: frozen from the complete row alone.
  const first = table(`${head}| r01 | ok |\n| r02 | a much longer status that would widen the column if it were measured`)
  const { hold } = streamLayout(first, 96, true, undefined, false)
  expect(hold?.widths).toEqual([3, 6])

  // Later draws during the turn keep those widths, however the cells grow.
  const later = table(`${head}| r01 | ok |\n| r02 | a much longer status that would widen the column if it were measured |`)
  expect(streamLayout(later, 96, true, hold, false).drawn.layout.widths).toEqual([3, 6])
  expect(streamLayout(later, 96, true, hold, false).drawn.airy).toBe(false)

  // Turn complete: re-flow (and let go), unless the engine says it is off screen.
  const done = streamLayout(later, 96, false, hold, false)
  expect(done.hold).toBe(undefined)
  expect(done.drawn.layout.widths[1]).toBeGreaterThan(6)
  expect(streamLayout(later, 96, false, hold, true).drawn.layout.widths).toEqual([3, 6])

  // A reply taller than the window: frozen for good.
  const kept = streamLayout(later, 96, false, hold, false, false)
  expect(kept.drawn.layout.widths).toEqual([3, 6])
  expect(kept.hold).toEqual(hold)
})

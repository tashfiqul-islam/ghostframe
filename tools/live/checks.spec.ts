// The check helpers against a screen built from text: the divider found, the regions split, a receipt below its
// header, the pill and the selected row read with their colours. `bun test` in tools/live.
import { expect, test } from 'bun:test'

import { TINT, TOKEN } from '../../hooks/shared/look/palette.ts'
import { hasReceipt, hexOf, layoutOf, leftRows, paneRows, pillOf, receipts, rowsMatching, selectedRow } from './checks.ts'
import type { Capture, Cell } from './screen.ts'

const W = 100

/** A screen from rows of text: the left, `│`, then the pane; a cell's colours from `paint` when it names them. */
function screen(left: string[], pane: string[], paint: (x: number, y: number) => Partial<Cell> = () => ({})): Capture {
  const rows = [...left.map((l, y) => `${l.padEnd(40)}│${(pane[y] ?? '').padEnd(W - 41)}`), '─'.repeat(W), '❯', '─'.repeat(W)]
  const cells = rows.map((r, y) => Array.from(r.padEnd(W)).map((ch, x): Cell => ({ ch, width: 1, fg: null, bg: null, bold: false, ...paint(x, y) })))

  return { name: 'test', cols: W, rows: rows.length, cells, cursor: { x: 0, y: 0 } }
}

const LEFT = Array.from({ length: 10 }, () => '')

LEFT[1] = '    10:14:02 ◆  TURN 7'
LEFT[3] = '             │  the answer'
LEFT[5] = '      2m 44s ✓  DONE   ⣀⣤   3 steps'

const PANE = Array.from({ length: 10 }, () => '')

PANE[1] = '  ▐ ✓ DONE ▌  TURN 7'
PANE[4] = '▐ ✓ shell bun test'

test('the divider splits the body into the left and the pane; the input box is not part of either', () => {
  const cap = screen(LEFT, PANE)
  const layout = layoutOf(cap)

  expect(layout.divider).toBe(40)
  expect(layout.pane).toEqual({ x0: 41, x1: W, y0: 0, y1: 10 })
  expect(leftRows(cap)).toHaveLength(10)
  expect(paneRows(cap)[1]?.trim()).toBe('▐ ✓ DONE ▌  TURN 7')
})

test('a receipt counts only below the latest header', () => {
  const cap = screen(LEFT, PANE)

  expect(receipts(cap).map(r => r.word)).toEqual(['DONE'])
  expect(hasReceipt(cap)).toBe(true)
  const next = [...LEFT]

  next[7] = '    10:20:00 ◆  TURN 8'
  expect(hasReceipt(screen(next, PANE))).toBe(false)
  expect(rowsMatching(leftRows(cap), /TURN \d+/).map(r => r.y)).toEqual([1])
})

test('the pill and the selected row are read with their colours', () => {
  const cap = screen(LEFT, PANE, (x, y) =>
    y === 1 && x === 45 ? { fg: TOKEN.ok, bg: hexOf('pill.done') } : y === 4 && x >= 41 ? { bg: TINT.selected, ...(x === 41 ? { fg: TOKEN.accent } : {}) } : {}
  )

  expect(pillOf(cap)).toMatchObject({ glyph: '✓', word: 'DONE', fg: TOKEN.ok, bg: '#132019' })
  const selected = selectedRow(cap)

  expect(selected?.y).toBe(4)
  expect(selected?.bar.fg).toBe(TOKEN.accent)
  expect(new Set(selected?.backgrounds)).toEqual(new Set([TINT.selected]))
})

test('no pane docked: one region, the whole body', () => {
  const cap = screen(LEFT, [])
  const bare: Capture = { ...cap, cells: cap.cells.map(r => r.map(c => (c.ch === '│' && r.indexOf(c) === 40 ? { ...c, ch: ' ' } : c))) }

  expect(layoutOf(bare).pane).toBeUndefined()
  expect(pillOf(bare)).toBeUndefined()
})

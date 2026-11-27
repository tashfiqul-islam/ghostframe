import { expect, test } from 'claude-code/testing'

import { TINT, TOKEN } from '../../../hooks/shared/look/palette'
import { widthOf } from '../../../hooks/shared/look/width'
import { tableCard } from '../../../hooks/transcript/rows/tables'

// 7.6 on the live check's step 9 table (200 columns: 86 cells) and step 12's (100 columns: 78): columns sized to their
// content 3 cells apart, a number column right-aligned in its own width, one header band, zebra rows, the last column
// the rest of the card, cut with `…`.
const FLOOD = [
  '| # | Command | Result |',
  '|---|---|---|',
  ...[1, 2, 3, 4, 5].map(n => `| ${n} | ls /nope${n} | ls: cannot access '/nope${n}': No such file or directory |`),
  "| 6 | ls /nope1 (again) | ls: cannot access '/nope1': No such file or directory |"
]
const text = (row: readonly { t: string }[]) => row.map(p => p.t).join('')

for (const width of [86, 78]) {
  test(`1. the flood's table at ${width} cells: \`#\` right-aligned in its own width, 3 cells before Command; one header band; the last column cut with …`, () => {
    const rows = tableCard(FLOOD, width)
    const shown = rows.map(text)
    const card = shown.map(r => r.slice(16))

    // One header band: the header row is the card's first row, with no half-block edge above or under it.
    expect(card[0]).toMatch(/^ {2}# {3}Command {13}Result +$/)
    expect(card.filter(r => /^[▄▀]+$/.test(r.trim()))).toEqual([expect.stringMatching(/^▀+$/)])
    // Body rows: the number, 3 cells, the command, 3 cells, the result to the card's end, cut with `…`.
    expect(card[1]).toMatch(
      width === 86
        ? /^ {2}1 {3}ls \/nope1 {11}ls: cannot access '\/nope1': No such file or directory +$/
        : /^ {2}1 {3}ls \/nope1 {11}ls: cannot access '\/nope1': No such.*… *$/
    )
    expect(card[6]).toMatch(
      width === 86 ? /^ {2}6 {3}ls \/nope1 \(again\) {3}ls: cannot access .* directory +$/ : /^ {2}6 {3}ls \/nope1 \(again\) {3}ls: cannot access .*… *$/
    )
    for (const r of shown) expect(widthOf(r)).toBe(16 + width)
    // The header on codeHead, then zebra rows.
    const bgOf = (k: number) => rows[k]?.find(p => p.bg !== undefined)?.bg
    expect(bgOf(0)).toBe(TOKEN.codeHead)
    expect(bgOf(1)).toBe(TOKEN.code)
    expect(bgOf(2)).toBe(TINT.zebra)
  })
}

test('1. columns wider than the card give way, cut with `…`: no row runs past the card, the last keeps room', () => {
  const lines = ['| Name | Description | Result |', '|---|---|---|', `| ${'a'.repeat(30)} | ${'b'.repeat(40)} | ok, it worked fine |`]

  for (const r of tableCard(lines, 50).map(text)) expect(widthOf(r)).toBe(16 + 50)
  expect(text(tableCard(lines, 50)[1] ?? [])).toMatch(/…/)
  expect(text(tableCard(lines, 50)[1] ?? [])).toMatch(/ok,/)
})

test('B5. columns that do not fit are said: a dim `n columns hidden` row under the card, every row inside the width', () => {
  const ten = [
    '| a | b | c | d | e | f | g | h | i | j |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| 1x | 2x | 3x | 4x | 5x | 6x | 7x | 8x | 9x | tenth col |'
  ]
  const rows = tableCard(ten, 40)
  const shown = rows.map(text)
  const headers = (shown[0] ?? '').slice(16).trim().split(/\s+/)
  const note = rows.at(-1) ?? []

  for (const r of shown) expect(widthOf(r)).toBeLessThanOrEqual(16 + 40)
  // The columns drawn are the first ones, whole; the rest are counted.
  expect(headers).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].slice(0, headers.length))
  expect(text(note).slice(16)).toBe(`${10 - headers.length} columns hidden`)
  expect(note.at(-1)?.color).toBe(TOKEN.dim)
})

test('B5. one column that does not fit: `1 column hidden`', () => {
  const four = ['| Name | Description | Result | Notes |', '|---|---|---|---|', '| alpha beta | gamma delta | ok it worked | more words |']

  expect(text(tableCard(four, 20).at(-1) ?? []).slice(16)).toBe('1 column hidden')
})

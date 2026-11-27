import { expect, test } from 'claude-code/testing'

import { columns, rulerRows, timelineRows } from '../../../hooks/cockpit/rows/pane'
import type { Group } from '../../../hooks/cockpit/rows/pane'
import { TOKEN } from '../../../hooks/shared/look/palette'
import { widthOf } from '../../../hooks/shared/look/width'

// The timeline's title takes the width the track and the result leave (6.2, 8.3), measured from the pane's columns.
const LONG = "Before measuring, two things need checking: the repo's untracked files and the git calls"
const BRANCH = 'docs/readme-better-screenshots'
const text = (row: readonly { t: string }[]) => row.map(p => p.t).join('')

const group = (over: Partial<Group> = {}): Group => ({
  glyph: 'ok',
  title: LONG,
  bar: { from: 0, to: 5_000, color: TOKEN.barDone },
  result: '96 lines',
  tone: 'dim',
  ...over
})

test('6.2: the title takes what the track and the result leave; 72 columns stays as the screens draw it', () => {
  expect(columns(50)).toEqual({ title: 17, track: 12, result: 14 })
  expect(columns(68)).toEqual({ title: 25, track: 20, result: 16 })
  expect(columns(72)).toEqual({ title: 25, track: 20, result: 20 })
  expect(columns(90)).toEqual({ title: 43, track: 20, result: 20 })
  expect(columns(120)).toEqual({ title: 73, track: 20, result: 20 })
})

for (const width of [50, 68, 90, 120]) {
  test(`8.3, ${width} columns: a long title fills its column, the row is the pane's width, the track follows the title`, () => {
    const { title, track } = columns(width)
    const [row] = timelineRows([group()], 10_000, width, false)
    const drawn = text(row ?? [])

    expect(widthOf(drawn)).toBe(width)
    // The title column, from cell 4: as much of the title as fits, cut at its end.
    const shown = drawn.slice(4, 4 + title)
    expect(shown.trimEnd().length).toBeGreaterThan(Math.min(title, LONG.length) - 2)
    expect(LONG.startsWith(shown.replace(/…\s*$/, '').trimEnd())).toBe(true)
    // The bar starts on the track's first cell, two cells after the title column; the ruler sits over it.
    expect(drawn.slice(4 + title + 2, 4 + title + 2 + 1)).toBe('━')
    expect(text(rulerRows('10:14', 'now', width)[1] ?? []).indexOf('┬')).toBe(4 + title + 2)
    expect(text(rulerRows('10:14', 'now', width)[1] ?? []).trimEnd().length).toBe(4 + title + 2 + track)
  })

  test(`8.3, ${width} columns: a long branch as the value is cut in the middle, both ends kept`, () => {
    const [row] = timelineRows([group({ title: 'Pushing', result: BRANCH, glyph: 'shipped' })], 10_000, width, false)
    const value =
      text(row ?? [])
        .trimEnd()
        .split(/\s+/)
        .at(-1) ?? ''

    expect(value).toMatch(/^docs\/.*….*shots$/)
    expect(widthOf(value)).toBe(14)
  })

  test(`8.3, ${width} columns: the selected row shows its whole title, wrapped under the title column`, () => {
    const { title } = columns(width)
    const rows = timelineRows([group({ isSelected: true })], 10_000, width, false).map(text)
    const words = rows.map(r => r.slice(4, 4 + title).trim()).join(' ')

    expect(rows.every(r => widthOf(r) === width)).toBe(true)
    expect(rows.every(r => r.startsWith('▐'))).toBe(true)
    expect(rows.join('')).not.toContain('…')
    expect(words).toBe(LONG)
    if (widthOf(LONG) <= title) expect(rows.length).toBe(1)
    else expect(rows.length).toBeGreaterThan(1)
  })
}

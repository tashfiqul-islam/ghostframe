// Screen tests (Phase 12): each feeds the v8 renderers the data a spec screen shows, and compares the rows they draw
// with that screen's text block in section 12, character for character. Colours are checked against the tokens.
// Where a screen holds rows Cockpit does not draw (the engine's dialog, a turn before the one shown, the engine's own
// blank rows), the test compares the rows it does draw; docs/design/cockpit-v8.md section 14 says why for each.
import { expect, test } from 'claude-code/testing'

import { GLYPH } from '../../hooks/shared/look/glyphs'
import { PILL, TINT, TOKEN } from '../../hooks/shared/look/palette'
import type { Part } from '../../hooks/shared/parts'
import { screen, shown } from '../support/screens'
import { screen01, screen03, screen04, screen13, screen16, screen22, screen30, screen31 } from '../support/v8left'
import { pane01, pane03, pane04, pane13, pane16, pane22, pane23, pane29 } from '../support/v8pane'

const find = (rows: readonly (readonly Part[])[], t: string) => rows.flat().find(p => p.t === t)

test('screen 01, the left: the finished turn 7, every row', () => {
  const rows = screen01()

  expect(shown(rows)).toEqual(screen('01'))
  expect(find(rows, '10:14:02')?.color).toBe(TOKEN.machine)
  expect(find(rows, GLYPH.turn)?.color).toBe(TOKEN.spine)
  expect(find(rows, GLYPH.you)?.color).toBe(TOKEN.accent)
  expect(find(rows, 'DONE')).toMatchObject({ color: TOKEN.ok, bold: true })
  expect(find(rows, 'YAML')).toMatchObject({ color: TOKEN.machine, bold: true })
  expect(find(rows, '[1]')?.color).toBe(TOKEN.machine)
  // The lead sentence bright, the rest of the answer in text (7.4).
  expect(find([rows[7] ?? []], 'grapheme.')?.color).toBe(TOKEN.textBright)
  expect(find([rows[8] ?? []], 'old.')?.color).toBe(TOKEN.text)
  expect(rows.flat().some(p => p.bg === TINT.addedLine)).toBe(true)
  expect(rows.flat().some(p => p.bg === TINT.removedWord && p.t.includes('latest'))).toBe(true)
  expect(rows.flat().some(p => p.bg === TINT.zebra)).toBe(true)
})

test('screen 03, the left from turn 8: the failure card and FAILED, the answer wrapped at 86', () => {
  expect(shown(screen03())).toEqual(screen('03').slice(2))
  expect(find(screen03(), 'FAILED')).toMatchObject({ color: TOKEN.err, bold: true })
  expect(
    screen03()
      .flat()
      .some(p => p.bg === TINT.errCard)
  ).toBe(true)
})

test('screen 04, the left from turn 9 to the engine`s dialog: no NEEDS YOU row of its own (decision B)', () => {
  const rows = screen04()

  expect(shown(rows)).toEqual(screen('04').slice(2, 2 + rows.length))
  expect(find(rows, 'NEEDS YOU')).toBeUndefined()
  expect(find(rows, GLYPH.turn)?.color).toBe(TOKEN.accent)
})

test('screen 13, the left from turn 23: a memory notice, ⊘ BLOCKED in warn, the context warning, `1 blocked`', () => {
  const rows = screen13()

  expect(shown(rows)).toEqual(screen('13').slice(2))
  expect(find(rows, GLYPH.blocked)?.color).toBe(TOKEN.warn)
  expect(find(rows, 'b72d0aa')?.color).toBe(TOKEN.textBright)
  expect(find(rows, GLYPH.shipped)?.color).toBe(TOKEN.accent)
})

test('screen 16, the left from turn 18: no prose, so the worked node; the commit; the receipt', () => {
  const rows = screen16()

  expect(shown(rows)).toEqual(screen('16').slice(2))
  expect(find(rows, 'worked')?.color).toBe(TOKEN.dim)
})

test('screen 22, the left from /steps 7 all: step rows with no spine, quiet one-row outputs', () => {
  const rows = screen22()

  expect(shown(rows)).toEqual(screen('22').slice(2))
  expect(find(rows, '/copy code 1')?.color).toBe(TOKEN.machine)
  expect(find(rows, '2 of 14 fail')?.color).toBe(TOKEN.err)
})

test('screen 30, ctrl+o: every sentence with its clock and every step with its own time, a diff in place', () => {
  const rows = screen30()

  expect(shown(rows)).toEqual(screen('30'))
  expect(find(rows, '10:14:06')?.color).toBe(TOKEN.machine)
  expect(find(rows, 'Reproducing the failure first.')?.color).toBe(TOKEN.muted)
})

test('screen 31, 100 columns, no pane: the worked node, the failure node, the live line and its branches', () => {
  const { turn7, turn8, live } = screen31()

  expect(shown(turn7)).toEqual(screen('31').slice(0, 14))
  expect(shown(turn8)).toEqual(screen('31').slice(16, 24))
  expect(shown(live)).toEqual(screen('31').slice(32))
  expect(find(live, '1m 51s')?.color).toBe(TOKEN.accent)
  expect(find(turn8, GLYPH.fail)?.color).toBe(TOKEN.err)
})

const pane = (n: string, build: (rows: number) => Part[][]) => {
  const want = screen(n, 1)

  return { rows: build(want.length), want }
}

test('screen 01, the pane: tabs, the DONE head card, the ruler, turn 7`s groups as bars, the wordmark', () => {
  const { rows, want } = pane('01', pane01)

  expect(shown(rows)).toEqual(want)
  expect(find(rows, 'TIMELINE')).toMatchObject({ color: TOKEN.textBright, bold: true })
  expect(find(rows, ' ✓ DONE ')).toMatchObject({ color: TOKEN.ok, bold: true, bg: PILL.done })
  expect(find(rows, '┬────┬────┬────┬───┬')?.color).toBe(TOKEN.hairline)
  expect(rows[12]?.find(p => p.t === '━')?.color).toBe(TOKEN.err)
  expect(rows[14]?.find(p => p.t === '━')?.color).toBe(TOKEN.barDone)
  expect(find(rows, 'ghostframe')?.color).toBe(TOKEN.wordmark)
})

test('screen 03, the pane: FAILED, the selected failed group`s drawer in place, the hint row on the grid', () => {
  const { rows, want } = pane('03', pane03)

  expect(shown(rows)).toEqual(want)
  expect(rows[14]?.[0]).toMatchObject({ t: '▐', color: TOKEN.accent, bg: TINT.selected })
  // One background across the selected row (6.2).
  expect(new Set(rows[14]?.map(p => p.bg))).toEqual(new Set([TINT.selected]))
  expect(find(rows, 'tab')?.color).toBe(TOKEN.accent)
})

test('screen 04, the pane: NEEDS YOU, the waiting step selected with its one-line drawer, no now-line', () => {
  const { rows, want } = pane('04', pane04)

  expect(shown(rows)).toEqual(want)
  expect(find(rows, ' ! NEEDS YOU ')).toMatchObject({ color: TOKEN.warn, bg: PILL.needsYou })
  expect(find(rows, '41s')?.color).toBe(TOKEN.warn)
})

test('screen 13, the pane: the blocked commit as ⊘ in warn with its detail line', () => {
  const { rows, want } = pane('13', pane13)

  expect(shown(rows)).toEqual(want)
  expect(find(rows, '⊘')?.color).toBe(TOKEN.warn)
  expect(find(rows, 'blocked')?.color).toBe(TOKEN.warn)
})

test('screen 16, the pane: four groups, the commit`s bar in accent', () => {
  const { rows, want } = pane('16', pane16)

  expect(shown(rows)).toEqual(want)
  expect(rows[15]?.find(p => p.t === '━')?.color).toBe(TOKEN.accent)
})

test('screen 22, the pane: turn 7 as screen 01 shows it, beside the slash commands', () => {
  const { rows, want } = pane('22', pane22)

  expect(shown(rows)).toEqual(want)
})

test('screen 23, the pane: the Files tab, change bars, the selected file`s hunk in place, ◇ for an agent`s file', () => {
  const { rows, want } = pane('23', pane23)

  expect(shown(rows)).toEqual(want)
  expect(find(rows, 'FILES 3')).toMatchObject({ color: TOKEN.textBright, bold: true })
  expect(find(rows, '◇')?.color).toBe(TOKEN.agent)
  expect(find(rows, '@@ 14,3 @@')?.color).toBe(TOKEN.machine)
  expect(find(rows, 'runtime.ts')?.color).toBe(TOKEN.textBright)
  expect(find(rows, 'hooks/')?.color).toBe(TOKEN.dim)
})

test('screen 29, the pane: every step, no folding, the failed step`s output in place', () => {
  const { rows, want } = pane('29', pane29)

  expect(shown(rows)).toEqual(want)
  expect(find(rows, 'ALL STEPS · TURN 7')).toMatchObject({ color: TOKEN.muted, bold: true })
  expect(find(rows, '2 of 14')?.color).toBe(TOKEN.err)
})

import { expect, test } from 'claude-code/testing'

import { framed, hintRow, rulerRows, tabRows, timelineRows } from '../../../hooks/cockpit/v8/pane'
import type { Group } from '../../../hooks/cockpit/v8/pane'
import { agentHead, changeBar, diffView, interruptedRow, inspectorRows, pinnedHead } from '../../../hooks/cockpit/v8/views'
import { TOKEN } from '../../../hooks/shared/look/palette'
import type { Part } from '../../../hooks/shared/parts'
import { screen, shown } from '../../support/screens'
import { barOf, GROUPS_7, P, pane24, pane25, pane26, SPAN, VERSION } from '../../support/v8pane'

const want = (n: string) => screen(n, 1)

test('8.7, 8.8, 8.9: the Sources, Todo and Agents tabs (screens 24, 25, 26)', () => {
  expect(shown(pane24(want('24').length))).toEqual(want('24'))
  expect(shown(pane25(want('25').length))).toEqual(want('25'))
  expect(shown(pane26(want('26').length))).toEqual(want('26'))

  const sources = pane24(want('24').length).flat()

  expect(sources.find(p => p.t === '404')).toMatchObject({ color: TOKEN.err, bold: true })
  expect(sources.find(p => p.t === 'bun.sh')?.color).toBe(TOKEN.machine)
  expect(
    pane25(want('25').length)
      .flat()
      .find(p => p.t === 'Find why CI runs Bun 1.4.1')?.color
  ).toBe(TOKEN.textBright)
  expect(
    pane26(want('26').length)
      .flat()
      .find(p => p.t === '×1')?.color
  ).toBe(TOKEN.err)
})

test('8.6: the full diff, every hunk, two gutters, a long line wrapped under itself with ↩ (screen 28)', () => {
  const patch = [
    '@@ -1,4 +1,5 @@',
    ' import { which } from "bun";',
    '+import pin from "../mise.toml" with { type: "toml" };',
    ' ',
    '@@ -18,3 +19,7 @@',
    ' export function runtime() {',
    '+  const want = pin.tools.bun, have = Bun.version;',
    '+  if (Bun.semver.order(have, want) < 0) {',
    '+    throw new Error(`ghostframe needs Bun ${want} or newer; this is ${have}. Run mise install.`);',
    '+  }',
    '   return { version: Bun.version };',
    ' }'
  ]
  const rows = framed(
    [
      ...tabRows('files', { files: 3, sources: 2, todo: { done: 5, total: 5 }, agents: 3 }),
      [],
      ...diffView('hooks/runtime.ts', patch, { adds: 12, dels: 0 }, 7, P)
    ],
    hintRow(
      [
        ['b', 'back'],
        ['c', 'copy'],
        ['↑↓', 'scroll'],
        ['n', 'next file']
      ],
      VERSION,
      P
    ),
    want('28').length
  )

  expect(shown(rows)).toEqual(want('28'))
  expect(rows.flat().find(p => p.t === '@@ 1,4 @@')?.color).toBe(TOKEN.machine)
})

test('8.10: an agent in view: the ◇ AGENT head and its own timeline, no now-line (screen 27)', () => {
  const ok = (title: string, cells: string, result: string): Group => ({ glyph: 'ok', title, bar: barOf(cells), result, tone: 'dim' })
  const groups: Group[] = [
    ok('Running the width tests', '━━━╸', '14 pass'),
    ok('Running them again', '   ━━━━', '14 pass'),
    ok('Installing Bun 1.4.1', '      ╺━━━━━━━━', '1.4.1'),
    { glyph: 'live', title: 'Rerunning on 1.4.1', bar: barOf('               ━━━━━', TOKEN.accent), result: 'running', tone: 'accent', isSelected: true }
  ]
  const rows = framed(
    [
      ...tabRows('agents', { files: 0, sources: 3, todo: { done: 2, total: 5 }, agents: 3 }),
      [],
      ...agentHead('Audit tests', 'running · 1m 10s', 9, 0, 7, P),
      [],
      ...rulerRows('10:25', 'now', P),
      ...timelineRows(groups, SPAN, P, false)
    ],
    hintRow(
      [
        ['m', 'back to main'],
        ['tab', 'move'],
        ['enter', 'open step']
      ],
      VERSION,
      P
    ),
    want('27').length
  )

  expect(shown(rows)).toEqual(want('27'))
  expect(rows.flat().some(p => p.t === 'esc')).toBe(false)
})

test('9.4: a pinned turn under the live one on one line (screen 09); an interrupted turn`s line (screen 06)', () => {
  const pinned = GROUPS_7.filter(g => g.title !== 'Failing fast on old Bun').map(g => ({ ...g, detail: undefined }))
  const rows = framed(
    [
      ...tabRows('timeline', { files: 3, sources: 2, todo: { done: 5, total: 5 }, agents: 3 }),
      [],
      ...pinnedHead(
        { turnNo: 8, said: 'running · 4 steps', time: '2m 10s' },
        { turnNo: 7, range: '10:14:02 → 10:16:46', summary: 'Width tests fixed; CI now reads Bun from mise.toml' },
        P
      ),
      [],
      ...rulerRows('10:14', '10:17', P),
      ...timelineRows(pinned, SPAN, P, false)
    ],
    hintRow(
      [
        ['l', 'live'],
        ['p', 'previous'],
        ['n', 'next'],
        ['s', 'all']
      ],
      VERSION,
      P
    ),
    want('09').length
  )

  expect(shown(rows)).toEqual(want('09'))
  expect(shown([interruptedRow(11, 'after 3 steps · 2 files renamed', '11:02:05', P)])).toEqual([want('06')[10]])
})

test('8.5: the change bar is 5 cells, ok and err in proportion to the largest change, the rest dim', () => {
  const text = (ps: readonly Part[]) => ps.map(p => p.t).join('')

  expect(text(changeBar(12, 0, 12))).toBe('■■■■■')
  expect(changeBar(1, 1, 12).map(p => [p.t, p.color])).toEqual([
    ['■', TOKEN.ok],
    ['■■■■', TOKEN.dim]
  ])
})

test('8.13: the inline inspector is one card, never taller than it may be, its keys last', () => {
  const step = { glyph: 'ok' as const, kind: 'shell', subject: 'bun --version', result: '1.4.4', tone: 'dim' as const, ms: 300 }
  const rows = inspectorRows(
    8,
    12,
    2,
    Array.from({ length: 12 }, () => step),
    10,
    100
  )

  expect(rows.length).toBe(10)
  expect(shown(rows)[1]).toMatch(/^ {3}STEPS · TURN 8 +12 steps · 2 failed$/)
  expect(shown(rows).at(-2)).toBe('   s all   c copy   p previous   n next   esc close')
})

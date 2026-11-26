import { expect, test } from 'claude-code/testing'

import { framed, hintRow, rulerRows, tabRows, timelineRows } from '../../../hooks/cockpit/rows/pane'
import type { Group } from '../../../hooks/cockpit/rows/pane'
import { agentHead, changeBar, countsOf, diffView, filesView, interruptedRow, inspectorRows, pinnedHead } from '../../../hooks/cockpit/rows/views'
import { TOKEN } from '../../../hooks/shared/look/palette'
import { widthOf } from '../../../hooks/shared/look/width'
import type { Part } from '../../../hooks/shared/parts'
import { screen, shown } from '../../support/screens'
import { barOf, GROUPS_7, P, pane24, pane25, pane26, SPAN, VERSION } from '../../support/paneScreens'

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
  expect(shown([interruptedRow(11, 'after 3 steps · 2 files changed', '11:02:05', P)])).toEqual([want('06')[10]])
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

test('13. Files: a zero side is left out (`+6`, not `+6 −0`); an outside change is said on the baseline line', () => {
  const rows = shown(filesView([{ path: 'src/width.ts', adds: 6, dels: 0, isAgent: false }], 5, P))

  expect(rows.some(r => /−0/.test(r))).toBe(false)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}1 file changed +\+6$/))
  const none = shown(filesView([], 3, P))
  expect(none.some(r => /\+0|−0/.test(r))).toBe(false)
  const outside = shown(filesView([{ path: 'src/width.ts', adds: 0, dels: 7, isAgent: false }], 7, P, true))
  expect(outside).toContainEqual(expect.stringMatching(/^ {2}turn 7 · against the start of the turn · changed outside it too *$/))
  expect(countsOf(['@@ -1,2 +1,1 @@', '-a', '-b', '+c', ' d'])).toEqual({ adds: 1, dels: 2 })
})

test('14. a hint row keeps at least 4 cells before the wordmark; whole hints drop from the end until it does', () => {
  const sources: [string, string][] = [
    ['enter', 'copy url'],
    ['u', 'hide urls'],
    ['c', 'copy'],
    ['1', 'timeline']
  ]
  const agents: [string, string][] = [
    ['enter', 'open conversation'],
    ['tab', 'move'],
    ['1', 'timeline']
  ]

  for (const keys of [sources, agents]) {
    const row = shown([hintRow(keys, '1.0.0', P, 'copied')])[0] ?? ''
    const mark = row.indexOf('ghostframe v1.0.0')

    expect(mark).toBeGreaterThan(0)
    expect(row.slice(mark - 4, mark)).toBe('    ')
    // No hint is cut: each one shown is whole, and they are a prefix of the view's keys.
    const hints = row.slice(0, mark).trim().split(/ {4}/)
    expect(hints).toEqual(
      keys
        .slice(0, hints.length - 1)
        .map(([k, a]) => `${k} ${a}`)
        .concat(hints.slice(-1))
    )
    expect(hints.at(-1)).toBe('copied')
  }
})

test('17. an agent in view: its head`s state is ok-coloured when done, err when failed, accent while it runs', () => {
  const colourOf = (state: string) => agentHead('Audit src', state, 3, 0, 6, P)[1]?.find(p => p.t === state)?.color

  expect(colourOf('done · 28s')).toBe(TOKEN.ok)
  expect(colourOf('failed · 9s')).toBe(TOKEN.err)
  expect(colourOf('running · 4s')).toBe(TOKEN.accent)
})

test('2. no timeline row is wider than the pane, and a result is cut to 14 cells (5.7), agents` rows too', () => {
  const groups: Group[] = [
    {
      glyph: 'agent',
      title: 'Package.json agent done and more words',
      bar: { from: 0, to: 4_000, color: TOKEN.agent },
      result: '7 exit 0 and a long tail',
      tone: 'dim',
      agents: [
        {
          name: 'Audit package.json',
          bar: { from: 0, to: 2_000, color: TOKEN.agent },
          result: 'reported a lot of things',
          isFailed: false,
          isRunning: false,
          sub: { glyph: 'ok', kind: 'shell', subject: 'cat package.json', result: 'a very long result word', tone: 'dim' }
        }
      ]
    }
  ]

  for (const row of shown(timelineRows(groups, SPAN, P, false))) {
    expect(widthOf(row)).toBeLessThanOrEqual(P)
    const result = row.slice(51).trim()
    expect(widthOf(result)).toBeLessThanOrEqual(14)
  }
})

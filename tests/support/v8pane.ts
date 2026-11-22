// The pane of the Cockpit v8 screens, built from the data each screen shows: the screen tests compare these rows with
// the spec's section 12. Pure, so a script can print them too.
import { drawerRows, framed, headCard, hintRow, rulerRows, tabRows, timelineRows } from '../../hooks/cockpit/v8/pane'
import type { Bar, Group, Head, Tab, TabCounts } from '../../hooks/cockpit/v8/pane'
import { SPARK } from '../../hooks/shared/look/glyphs'
import { TOKEN } from '../../hooks/shared/look/palette'
import type { Part } from '../../hooks/shared/parts'

/** The pane's columns at 163 columns and up (6.2), and its body rows on the screens. */
export const P = 72

/** The version the screens' wordmark shows (the manifest's at the time the canvas was drawn). */
export const VERSION = '0.1.0'

/** A sparkline's levels, read off the cells a screen draws. */
export const sparkOf = (cells: string): number[] => Array.from(cells, c => SPARK.indexOf(c))

/** The track a screen draws for a bar as the span it covers, on a turn 40 s long (1 s per half cell). */
export const SPAN = 40_000

/** A bar read off a screen's 20 track cells (`  ╺━━╸ `), in its colour. */
export function barOf(cells: string, color: string = TOKEN.barDone): Bar {
  const halves = Array.from(cells.padEnd(20)).flatMap(c => (c === '━' ? [true, true] : c === '╺' ? [false, true] : c === '╸' ? [true, false] : [false, false]))
  const from = halves.indexOf(true)
  const to = halves.lastIndexOf(true) + 1

  return { from: from * 1_000, to: to * 1_000, color }
}

const blank: Part[] = []

/** The pane's top: the tabs, a blank row, the head card, a blank row, the ruler. */
function top(tab: Tab, counts: TabCounts, head: Head, from: string, to: string): Part[][] {
  return [...tabRows(tab, counts), blank, ...headCard(head, P), blank, ...rulerRows(from, to, P)]
}

const ok = (title: string, cells: string, result: string, extra: Partial<Group> = {}): Group => ({
  glyph: 'ok',
  title,
  bar: barOf(cells),
  result,
  tone: 'dim',
  ...extra
})

/** Turn 7's groups, finished (screens 01, 22, 33). */
export const GROUPS_7: Group[] = [
  {
    glyph: 'failed',
    title: 'Reproducing the failure',
    bar: barOf('━━╸', TOKEN.err),
    result: '2 of 14',
    tone: 'err',
    detail: 'width("e\\u0301") · expected 1, received 2'
  },
  ok('Comparing Bun versions', '  ━━', '1.4.1 · 1.4.4'),
  { glyph: 'agent', title: 'Audit tests', bar: barOf('    ━━━━━━', TOKEN.agent), result: 'clean', tone: 'dim' },
  { glyph: 'agent', title: 'Audit CI setup', bar: barOf('    ━━━━━╸', TOKEN.agent), result: 'no pin', tone: 'dim' },
  { glyph: 'agent', title: 'Audit dependencies', bar: barOf('    ━━━━━', TOKEN.agent), result: '1 high', tone: 'dim' },
  ok('Pinning Bun in ci.yml', '          ╺━━━', '+1 −1'),
  ok('Failing fast on old Bun', '             ╺━━╸', '+12'),
  ok('Running the width tests', '                ━━━', '14 pass'),
  { glyph: 'shipped', title: 'Pushing the fix', bar: barOf('                  ╺━', TOKEN.accent), result: 'a1f3c2e', tone: 'dim' }
]

const HEAD_7: Head = {
  state: 'done',
  turnNo: 7,
  range: '10:14:02 → 10:16:46',
  summary: 'Width tests fixed; CI now reads Bun from mise.toml',
  spark: sparkOf('▁▂▃▂▄▅▃▂▁▃▅▆▄▃▅▇█▆▇█▆▇▅▄▆▇▅▃▂▁▂▃▄▅▄▃▂▃▄▃▂▁▂▃▂▁'),
  stats: [
    { n: 23, word: 'steps' },
    { n: 1, word: 'fixed' },
    { n: 3, word: 'agents' },
    { n: 3, word: 'files' }
  ],
  duration: '2m 44s'
}

const COUNTS_7: TabCounts = { files: 3, sources: 2, todo: { done: 5, total: 5 }, agents: 3 }

/** Screen 01's pane: turn 7 finished, the timeline, not focused. */
export function pane01(rows: number): Part[][] {
  return framed([...top('timeline', COUNTS_7, HEAD_7, '10:14', '10:17'), ...timelineRows(GROUPS_7, SPAN, P, false)], hintRow([], VERSION, P), rows)
}

/** Screen 03's pane: turn 8 failed, its failed step opened in place, focused. */
export function pane03(rows: number): Part[][] {
  const head: Head = {
    state: 'failed',
    turnNo: 8,
    range: '10:31:07 → 10:34:19',
    summary: 'Width tests still fail on Windows',
    spark: sparkOf('▁▂▂▃▄▃▅▆▄▃▅▆▇▅▄▃▂▃'),
    stats: [
      { n: 12, word: 'steps' },
      { n: 2, word: 'still failing' },
      { n: 1, word: 'file' }
    ],
    duration: '3m 12s'
  }
  const groups: Group[] = [
    ok('Adding a Windows job', '━━━', '+9'),
    ok('Running on windows-latest', '  ━━━━━━━', 'started'),
    { glyph: 'failed', title: 'Width tests on Windows', bar: barOf('        ╺━━━━', TOKEN.err), result: '2 of 14', tone: 'err', isSelected: true }
  ]
  const after: Group[] = [
    ok('Checking the locale', '            ━━━', 'LANG unset'),
    { glyph: 'failed', title: 'Retrying with LANG set', bar: barOf('              ╺━━━━', TOKEN.err), result: '2 of 14', tone: 'err' },
    ok('Writing up the options', '                  ╺━', '2 options')
  ]
  const drawer = drawerRows(
    {
      kind: 'shell',
      command: 'bun test hooks/width',
      exit: 'exit 1',
      lines: [
        { glyph: 'failed', name: 'width("e\\u0301")', said: 'expected 1, received 2' },
        { glyph: 'failed', name: 'width("o\\u0308")', said: 'expected 1, received 2' }
      ],
      keys: [
        ['c', 'copy output'],
        ['enter', 'full output']
      ]
    },
    P
  )
  const keys: [string, string][] = [
    ['tab', 'move'],
    ['enter', 'open'],
    ['1–5', 'tabs'],
    ['?', 'keys']
  ]

  return framed(
    [
      ...top('timeline', { files: 1, sources: 1, todo: { done: 2, total: 4 }, agents: 0 }, head, '10:31', '10:34'),
      ...timelineRows(groups, SPAN, P, false),
      ...drawer,
      ...timelineRows(after, SPAN, P, false)
    ],
    hintRow(keys, VERSION, P),
    rows
  )
}

/** Screen 04's pane: turn 9 waits on a permission, the waiting step selected with its one-line drawer. */
export function pane04(rows: number): Part[][] {
  const head: Head = {
    state: 'needsYou',
    turnNo: 9,
    range: '10:40:12 → now',
    summary: 'Waiting for permission to run rm -rf dist',
    spark: sparkOf('▁▂▃▂▁█'),
    stats: [
      { n: 3, word: 'steps' },
      { n: 1, word: 'waiting' }
    ],
    duration: '41s'
  }
  const groups: Group[] = [
    ok('Reading the build script', '━━━━━', 'package.json'),
    ok('Checking dist/', '     ━━╸', '214 files'),
    { glyph: 'waiting', title: 'Removing dist/', bar: barOf('       ━━━━━━━━━━╸', TOKEN.warn), result: 'needs you', tone: 'warn', isSelected: true }
  ]

  return framed(
    [
      ...top('timeline', { files: 0, sources: 0, todo: { done: 1, total: 3 }, agents: 0 }, head, '10:40', 'now'),
      ...timelineRows(groups, SPAN, P, false),
      ...drawerRows({ kind: 'shell', command: 'rm -rf dist', said: ['Answer in the dialog on the left.'] }, P)
    ],
    hintRow([], VERSION, P),
    rows
  )
}

/** Screen 13's pane: turn 23, a blocked commit as `⊘` with its detail line. */
export function pane13(rows: number): Part[][] {
  const head: Head = {
    state: 'done',
    turnNo: 23,
    range: '16:20:40 → 16:20:58',
    summary: 'Formatted and committed on a branch',
    spark: sparkOf('▂▃▄▂▃▁'),
    stats: [
      { n: 5, word: 'steps' },
      { n: 1, word: 'blocked' },
      { n: 38, word: 'files' }
    ],
    duration: '18s'
  }
  const groups: Group[] = [
    ok('Formatting', '━━━━━━━━━━', '38 files'),
    {
      glyph: 'blocked',
      title: 'Committing to main',
      bar: barOf('          ━━━╸', TOKEN.warn),
      result: 'blocked',
      tone: 'warn',
      detail: 'PreToolUse hook guard-main.sh · exit 2'
    },
    ok('Creating chore/format', '             ━━━━', 'branch'),
    { glyph: 'shipped', title: 'Committing', bar: barOf('                ╺━━━', TOKEN.accent), result: 'b72d0aa', tone: 'dim' }
  ]

  return framed(
    [...top('timeline', { files: 38, sources: 0, todo: undefined, agents: 0 }, head, '16:20:40', '16:20:58'), ...timelineRows(groups, SPAN, P, false)],
    hintRow([], VERSION, P),
    rows
  )
}

/** Screen 16's pane: turn 18, no prose, four groups. */
export function pane16(rows: number): Part[][] {
  const head: Head = {
    state: 'done',
    turnNo: 18,
    range: '14:31:00 → 14:31:48',
    summary: 'Dev dependencies bumped and committed',
    spark: sparkOf('▂▃▄▄▃▂▃'),
    stats: [
      { n: 7, word: 'steps' },
      { n: 2, word: 'files' }
    ],
    duration: '48s'
  }
  const groups: Group[] = [
    ok('Listing outdated packages', '━━━━━', '9 outdated'),
    ok('Updating 9 packages', '     ━━━━━━━━', '+9 −9'),
    ok('Running the tests', '            ━━━━━╸', '412 pass'),
    { glyph: 'shipped', title: 'Committing', bar: barOf('                 ━━━', TOKEN.accent), result: '9f3e2b1', tone: 'dim' }
  ]

  return framed(
    [...top('timeline', { files: 2, sources: 0, todo: undefined, agents: 0 }, head, '14:31:00', '14:31:48'), ...timelineRows(groups, SPAN, P, false)],
    hintRow([], VERSION, P),
    rows
  )
}

/** Screen 22's pane: turn 7 as screen 01 shows it. */
export const pane22 = pane01

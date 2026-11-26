// The pane of the Cockpit screens, built from the data each screen shows: the screen tests compare these rows with
// the spec's section 12. Pure, so a script can print them too.
import { drawerRows, framed, headCard, hintRow, rulerRows, tabRows, timelineRows } from '../../hooks/cockpit/rows/pane'
import type { Bar, Group, Head, Tab, TabCounts } from '../../hooks/cockpit/rows/pane'
import { agentsView, allStepsView, filesView, sourcesView, todoView } from '../../hooks/cockpit/rows/views'
import type { StepRow } from '../../hooks/cockpit/rows/views'
import { SPARK } from '../../hooks/shared/look/glyphs'
import { TOKEN } from '../../hooks/shared/look/palette'
import type { Part } from '../../hooks/shared/parts'

/** The pane's columns at 163 columns and up (6.2), and its body rows on the screens. */
export const P = 72

/** The version the screens' wordmark shows (the manifest's at the time the canvas was drawn). */
export const VERSION = '1.0.0'

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
    ['1–5', 'tabs']
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

const KEYS = {
  files: [
    ['enter', 'diff'],
    ['c', 'copy path'],
    ['1', 'timeline']
  ],
  steps: [
    ['s', 'fit'],
    ['enter', 'output'],
    ['c', 'copy'],
    ['p n', 'turns']
  ],
  sources: [
    ['enter', 'copy url'],
    ['u', 'hide urls'],
    ['c', 'copy'],
    ['1', 'timeline']
  ],
  todo: [
    ['1', 'timeline'],
    ['1–5', 'other tabs']
  ],
  agents: [
    ['enter', 'open conversation'],
    ['tab', 'move'],
    ['1', 'timeline']
  ]
} as const satisfies Record<string, readonly (readonly [string, string])[]>

/** Screen 23's pane: the Files tab, the selected file's first hunk open in place, agent edits marked. */
export function pane23(rows: number): Part[][] {
  return framed(
    [
      ...tabRows('files', COUNTS_7),
      blank,
      ...filesView(
        [
          {
            path: '.github/workflows/ci.yml',
            adds: 1,
            dels: 1,
            isAgent: false,
            isSelected: true,
            hunk: ['@@ -14,3 +14,3 @@', ' - uses: oven-sh/setup-bun@v2', '-  with: { bun-version: latest }', '+  with: { bun-version-file: mise.toml }']
          },
          { path: 'hooks/runtime.ts', adds: 12, dels: 0, isAgent: false },
          { path: 'tests/width.test.tsx', adds: 1, dels: 0, isAgent: true }
        ],
        7,
        P
      )
    ],
    hintRow(KEYS.files, VERSION, P),
    rows
  )
}

const step = (glyph: StepRow['glyph'], kind: string, subject: string, result: string, ms: number, extra: Partial<StepRow> = {}): StepRow => ({
  glyph,
  kind,
  subject,
  result,
  tone: glyph === 'failed' ? 'err' : 'dim',
  ms,
  ...extra
})

/** Screen 29's pane: every step of turn 7, the failed one`s output open in place. */
export function pane29(rows: number): Part[][] {
  const steps: StepRow[] = [
    step('ok', 'read', 'tests/width.test.tsx', '96 lines', 400),
    step('failed', 'test', 'bun test hooks/width', '2 of 14', 3_000, {
      isSelected: true,
      output: {
        head: 'exit 1 · 3s',
        lines: ['bun test v1.4.4', '× width > combining marks', '  expected: 1  received: 2', '  at tests/width.test.tsx:41:27', '12 pass · 2 fail · 14 total'],
        trimmed: false
      }
    }),
    step('ok', 'shell', 'bun --version', '1.4.4', 300),
    step('ok', 'read', '.github/workflows/ci.yml', '48 lines', 200),
    step('agent', 'agent', '3 launched', '2 · 1 failed', 70_000),
    step('ok', 'fetch', 'bun.sh/blog/bun-v1.4.2', '200', 1_000),
    step('ok', 'edit', '.github/workflows/ci.yml', '+1 −1', 200),
    step('ok', 'edit', 'hooks/runtime.ts', '+12', 300),
    step('ok', 'test', 'bun test hooks/width', '14 pass', 3_000),
    step('shipped', 'shell', 'git push', 'a1f3c2e', 2_000)
  ]

  return framed([...tabRows('timeline', COUNTS_7), blank, ...allStepsView(7, 23, 1, steps, 13, P)], hintRow(KEYS.steps, VERSION, P), rows)
}

/** Screen 24's pane: the Sources tab with its URLs; this screen draws no wordmark. */
export function pane24(rows: number): Part[][] {
  const pages = [
    { n: 1, host: 'bun.sh', title: 'Bun v1.4.2', status: '200', url: 'https://bun.sh/blog/bun-v1.4.2', isSelected: true },
    { n: 2, host: 'github.com', title: 'oven-sh/setup-bun · README', status: '200', url: 'https://github.com/oven-sh/setup-bun' },
    { n: undefined, host: 'docs.sigstore.dev', title: 'Cosign · keyless signing', status: '404', url: 'https://docs.sigstore.dev/cosign/keyless' }
  ]

  return framed(
    [...tabRows('sources', { files: 0, sources: 3, todo: undefined, agents: 0 }), blank, ...sourcesView(pages, true, P)],
    [{ t: '  ', color: TOKEN.dim }, ...keyPartsOf(KEYS.sources)],
    rows
  )
}

/** Screen 25's pane: the Todo tab. */
export function pane25(rows: number): Part[][] {
  return framed(
    [
      ...tabRows('todo', { files: 0, sources: 3, todo: { done: 2, total: 5 }, agents: 3 }),
      blank,
      ...todoView(
        [
          { text: 'Reproduce the width failure', state: 'done' },
          { text: 'Compare Bun on CI and locally', state: 'done' },
          { text: 'Find why CI runs Bun 1.4.1', state: 'current' },
          { text: 'Pin Bun in CI', state: 'open' },
          { text: 'Rerun the width tests on CI', state: 'open' }
        ],
        7,
        P
      )
    ],
    hintRow(KEYS.todo, VERSION, P),
    rows
  )
}

/** Screen 26's pane: the Agents tab. */
export function pane26(rows: number): Part[][] {
  return framed(
    [
      ...tabRows('agents', { files: 0, sources: 3, todo: { done: 2, total: 5 }, agents: 3 }),
      blank,
      ...agentsView(
        [
          {
            name: 'Audit tests',
            isFailed: false,
            open: 0,
            steps: 9,
            ms: 70_000,
            isSelected: true,
            step: { glyph: 'current', kind: 'shell', subject: 'bun test hooks/width --rerun', state: 'running', tone: 'accent' }
          },
          {
            name: 'Audit CI setup',
            isFailed: false,
            open: 0,
            steps: 4,
            ms: 58_000,
            step: { glyph: 'current', kind: 'fetch', subject: 'docs.github.com/…/setup-bun', state: 'running', tone: 'accent' }
          },
          {
            name: 'Audit dependencies',
            isFailed: true,
            open: 1,
            steps: 6,
            ms: 62_000,
            step: { glyph: 'failed', kind: 'shell', subject: 'npm audit --omit dev', state: 'stopped', tone: 'err' }
          }
        ],
        '10:25:20',
        P
      )
    ],
    hintRow(KEYS.agents, VERSION, P),
    rows
  )
}

const keyPartsOf = (keys: readonly (readonly [string, string])[]): Part[] =>
  keys.flatMap(([k, a], i): Part[] => [...(i > 0 ? [{ t: '    ', color: TOKEN.dim }] : []), { t: k, color: TOKEN.accent }, { t: ` ${a}`, color: TOKEN.dim }])

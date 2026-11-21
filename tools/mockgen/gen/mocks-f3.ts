// Scenarios F.23 to F.30, and the two small mocks of sections G and I.
import { cat, sp, fit, m, cellsOf, setBg, rule, mock, transcript, nth } from './lib'
import type { FileRow, Line, NowHead, PaneModel, Transcript } from './lib'
import { flat, S, dock, fall, HINT, turn7, P8, liveDock } from './data'
import { agents, todos, filesBig, long } from './data2'
import { idle } from './mocks-f1'

const IDLE = { hint: HINT.autoIdle }

// ---- F.23 tables of every shape
const hair = (T: Transcript): Line => fit(cat(sp(2), cellsOf('─'.repeat(T.F - 2), 'h')), T.F)
const kvs = (T: Transcript, rows: readonly (readonly [string, string])[]): Line[] =>
  rows.map(([k, v]) => fit(cat(sp(2), cellsOf(k.padEnd(14), 'm'), m(v)), T.F))
const rec = (T: Transcript, n: number, of: number, rows: readonly (readonly [string, string])[]): Line[] => [
  rule(T.F, { label: `${n} of ${of}` }),
  ...kvs(T, rows)
]
const tables = (T: Transcript): Line[] =>
  flat(
    T,
    T.turn(21, '14:02'),
    '',
    T.prompt('show me the audit numbers every way you can'),
    '',
    T.p('Seven views of the same audit. Each is the shape its data asks for.', { lead: true }),
    '',
    T.h('Plain'),
    T.table(
      ['Workflow', 'Before', 'After'],
      [
        ['scorecard', 'Pull ghcr.io/ossf/scorecard…', 'Scorecard · analyze'],
        ['ci', 'build', 'CI · test · ubuntu'],
        ['ci', 'lint', 'CI · lint · oxlint'],
        ['pr', 'check', 'PR · lint title']
      ],
      { fgs: ['t', 'm', 't'] }
    ),
    '',
    T.h('Numeric'),
    T.table(
      ['Module', 'Lines', 'Tests', 'Coverage %'],
      [
        ['hooks/ledger.ts', '141', '41', '98.6'],
        ['hooks/held.ts', '52', '38', '100.0'],
        ['hooks/register.tsx', '657', '112', '91.2'],
        ['hooks/grid.ts', '140', '14', '88.0']
      ],
      { align: ['l', 'r', 'r', 'r'] }
    ),
    hair(T),
    fit(cat(sp(2), '{T|Total             }   {T|  990}   {T|  205}   {T|      92.9}'), T.F),
    '',
    T.h('Comparison'),
    T.table(
      ['', 'bun publish', 'npm publish', 'changesets'],
      [
        ['provenance', 'yes', 'yes', 'yes'],
        ['OIDC, no token', 'yes', 'yes', 'no'],
        ['monorepo aware', 'no', 'no', 'yes'],
        ['extra dependency', 'none', 'none', '2 packages']
      ],
      { fgs: ['m', 't', 't', 't'] }
    ),
    '',
    T.h('Status'),
    T.table(
      ['Check', 'State', 'Time'],
      [
        ['unit', '{g|pass}', '4.1s'],
        ['integration', '{g|pass}', '31.0s'],
        ['e2e', '{R|fail}', '1m 12s'],
        ['lint', '{m|skip}', ''],
        ['types', '{w|flaky}', '9.4s']
      ],
      { align: ['l', 'l', 'r'] }
    ),
    '',
    T.h('Key and value'),
    kvs(T, [
      ['package', 'ghostframe 0.5.0'],
      ['engine', 'Claude Code 2.1.329 or later'],
      ['licence', 'MIT'],
      ['size', '41.2 kB packed · 3 files']
    ]),
    '',
    T.h('Before and after'),
    T.table(
      ['Metric', 'Before', '', 'After'],
      [
        ['register.tsx lines', '884', '→', '657'],
        ['largest function', '212 lines', '→', '48 lines'],
        ['tests through the engine', '19', '→', '191']
      ],
      { fgs: ['t', 'm', 'd', 't'], align: ['l', 'r', 'l', 'r'] }
    ),
    '',
    T.h('Wide: 12 columns become records'),
    rec(T, 1, 12, [
      ['audit', 'register.tsx'],
      ['findings', '4'],
      ['worst', 'claim() reads state before turn.start'],
      ['steps', '38'],
      ['time', '4m 41s']
    ]),
    rec(T, 2, 12, [
      ['audit', 'helper modules'],
      ['findings', '2'],
      ['worst', 'ReDoS in the HEADING regex: cubic'],
      ['steps', '53'],
      ['time', '5m 02s']
    ]),
    fit(cat(sp(2), '{m|… 10 more records}'), T.F),
    '',
    T.receipt('done · turn 21', '4 steps', '18s')
  )
dock('f23', {
  R: 74,
  bottom: IDLE,
  left: tables,
  M: {
    idle: idle(21, '14:02', 'done', 'read only', '18s'),
    steps: [
      S('1s', 'read', 'docs/audit/summary.md', '212 lines'),
      S('2s', 'read', 'docs/audit/findings.json', '96 lines'),
      S('4s', 'shell', 'bun run cov --json', '92.9%'),
      S('6s', 'search', '"provenance" in docs', '7 matches')
    ]
  }
})
fall('f23-long', {
  R: 14,
  C: 100,
  bottom: { noStatus: true, hint: HINT.autoIdle },
  left: T =>
    flat(
      T,
      fit(cat(sp(2), '{t|38   tests/md/table.test.tsx}           {t|pass}      {t|0.41}'), T.F),
      setBg(fit(cat(sp(2), '{t|39   tests/md/heading.test.tsx}         {t|pass}      {t|0.38}'), T.F), 'z', 2),
      fit(cat(sp(2), '{t|40   tests/md/fence.test.tsx}           {t|pass}      {t|0.52}'), T.F),
      fit(cat(sp(2), '{m| #   File                              State   Time s}'), T.F),
      fit(cat(sp(2), cellsOf('─'.repeat(T.F - 2), 'H')), T.F),
      fit(cat(sp(2), '{t|41   tests/width.test.tsx}              {t|pass}      {t|0.48}'), T.F),
      '',
      fit(cat(sp(2), '{m|File   Reason}'), T.F),
      fit(cat(sp(2), cellsOf('─'.repeat(T.F - 2), 'H')), T.F),
      fit(cat(sp(2), '{m|no rows}'), T.F)
    )
})

// ---- F.24 an mdxcn figure
const fig = [
  '+----------------------- [ CI RUN 4211 ] ------------------------+',
  '|                                                                |',
  '| ●  10:02  checkout                                             |',
  '| │                                                              |',
  '| ●  10:02  setup-bun resolves "latest" as 1.4.1                 |',
  '| │                                                              |',
  '| ●  10:03  bun test: 2 of 14 fail in width.test.tsx             |',
  '| │                                                              |',
  '| ○  10:03  typecheck, lint: skipped                             |',
  '|                                                                |',
  '+----------------------------------------------------------------+'
]
dock('f24', {
  R: 34,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(22, '14:10'),
      '',
      T.prompt('draw me what happened in CI run 4211'),
      '',
      T.p('The run failed at the test step because of the Bun it installed, and everything after it was skipped.', { lead: true }),
      '',
      ...fig.map((l, i) => fit(cat(sp(2), i === 6 ? cellsOf(l, 'T') : cellsOf(l, i === 0 || i === fig.length - 1 ? 'd' : 't')), T.F)),
      fit(cat(sp(2), '{m|Figure 1 · CI run 4211, job test}'), T.F),
      '',
      T.p('The fix from turn 7 pins the version, so step 2 can no longer drift.'),
      '',
      T.receipt('done · turn 22', '2 steps', '9s')
    ),
  M: {
    idle: idle(22, '14:10', 'done', 'read only', '9s'),
    steps: [S('2s', 'shell', 'gh run view 4211 --json jobs', '1 job · 5 steps'), S('4s', 'read', 'ci log · job 4211', '212 lines')]
  }
})

// ---- F.25 git: commit, pull request, merge
dock('f25', {
  R: 30,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      turn7(T).slice(-3),
      '',
      '',
      T.turn(8, '10:31'),
      '',
      T.prompt(P8 + ', merge when the checks pass'),
      '',
      T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s'),
      T.exc('↗', 't', '', 'PR #6 opened · ci: pin Bun to mise.toml', '14s', ['{l|https://github.com/tashfiqul-islam/ghostframe/pull/6}']),
      T.exc('↗', 't', '', 'PR #6 merged · squash · main is 2c4afb9', '3m 31s'),
      '',
      T.p('PR #6 is merged. The first CI run failed on a cache miss and passed on the re-run; nothing in the change caused it.', { lead: true }),
      '',
      T.receipt('done · turn 8', '9 steps · 1 failure → fixed', '3m 36s')
    ),
  M: {
    idle: idle(8, '10:35', 'done', '1 failure → fixed · ↗ PR #6 merged', '3m 36s'),
    steps: [
      S('3s', 'shell', 'git push -u origin fix/ci-bun-pin', '1 commit', 'out'),
      S('14s', 'shell', 'gh pr create --fill', 'PR #6', 'out'),
      S('1m 20s', 'shell', 'gh pr checks 6 --watch', '1 of 3 fail', 'fail'),
      S('1m 24s', 'shell', 'gh run view 4219 --log-failed', 'cache miss'),
      S('1m 27s', 'shell', 'gh run rerun 4219 --failed', 'queued'),
      S('3m 20s', 'shell', 'gh pr checks 6 --watch', '3 of 3 pass', 'pass'),
      S('3m 31s', 'shell', 'gh pr merge 6 --squash', '2c4afb9', 'out'),
      S('3m 33s', 'shell', 'git switch main', 'main'),
      S('3m 35s', 'shell', 'git pull --ff-only', '1 commit')
    ]
  }
})

// ---- F.26 a turn with no prose, only tools
dock('f26', {
  R: 18,
  bottom: IDLE,
  left: T => flat(T, T.turn(23, '14:15'), '', T.prompt('format everything'), '', T.receipt('done · turn 23', '2 steps · 14 files · {g|+88} {r|−91}', '3s')),
  M: {
    idle: idle(23, '14:15', 'done', '14 files formatted', '3s'),
    steps: [S('2s', 'shell', 'oxfmt .', '14 files'), S('3s', 'shell', 'git status --short', '14 files')],
    files: (
      [
        ['hooks/register.tsx', '', 21, 22],
        ['hooks/ledger.ts', '', 9, 9],
        ['hooks/held.ts', '', 4, 5],
        ['hooks/grid.ts', '', 6, 6],
        ['tests/kit/seed.ts', '', 3, 3],
        ['hooks/md/table.ts', '', 11, 12],
        ['a', '', 34, 34]
      ] satisfies FileRow[]
    ).map((f, i) => (i === 6 ? ['hooks/md/heading.ts', '', 34, 34] : f))
  }
})

// ---- F.27 a turn with only prose
dock('f27', {
  R: 22,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(24, '14:16'),
      '',
      T.prompt('should the held store be an LRU or a plain Map with a cap?'),
      '',
      T.p(
        'An LRU, because the cap is hit in normal use and the oldest claim is the right one to drop. A plain Map with a cap drops the newest, which is the one the current turn needs.',
        { lead: true }
      ),
      '',
      T.p('The cost is one extra `delete` and `set` per read to refresh the order. At 256 entries that is not measurable.'),
      '',
      T.receipt('done · turn 24', '', '4s')
    ),
  M: {
    idle: idle(24, '14:16', 'done', 'no steps', '4s'),
    steps: [S('2s', 'shell', 'oxfmt .', '14 files'), S('3s', 'shell', 'git status --short', '14 files')],
    stepsTurn: 23
  }
})

// ---- F.28 a 60-column window (fallback)
fall('f28', {
  C: 60,
  R: 40,
  bottom: IDLE,
  hero: true,
  left: T =>
    flat(
      T,
      turn7(T, 'fall'),
      '',
      '',
      T.turn(8, '10:31'),
      '',
      T.prompt(P8),
      '',
      T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s'),
      T.exc('↗', 't', '', 'PR #6 opened · ci: pin Bun to mise.toml', '14s', ['{l|https://github.com/tashfiqul-islam/ghostframe/pull/6}']),
      T.capsule('worked · 2 steps · 2 shell', '16s'),
      '',
      T.p('PR #6 is open against `main`.', { lead: true }),
      '',
      T.receipt('done · turn 8', '', '19s')
    )
})

// ---- F.29 a 220-column ultra-wide window
dock('f29', {
  C: 220,
  R: 34,
  left: T => flat(T, turn7(T), '', '', T.turn(12, '11:02'), '', T.prompt('go: split register.tsx as planned, move the tests, run the full gate, open the PR')),
  live: T => [liveDock(T, '7m 36s')],
  M: {
    now: { meta: 'turn 12 · step 47', say: 'Moving the claim logic behind claim(key, turn).', kind: 'test', subj: 'bun test hooks/ledger', el: '8s' },
    steps: long(46),
    agents: agents('run').slice(0, 3),
    todos: todos(1, 1),
    files: filesBig.slice(0, 4)
  }
})

// ---- F.30 streaming frames t0 to t5 (160 columns, pane 56)
const P30 = 'compare the two stores'
const base30 = (T: Transcript): Line[] => flat(T, T.turn(25, '14:20'), '', T.prompt(P30))
const para30 = 'Both hold the same data; they differ in what they drop when full. Numbers are from the benchmark I just ran.'
const tbl30 = (T: Transcript, n: number): Line[] =>
  T.table(
    ['Store', 'Drops', 'Read ns', 'Write ns'],
    [
      ['LRU', 'oldest read', '41', '58'],
      ['Map with cap', 'newest write', '22', '31'],
      ['Map, no cap', 'nothing', '21', '29'],
      ['WeakMap', 'on GC', '19', '27']
    ].slice(0, n),
    { align: ['l', 'l', 'r', 'r'] }
  )
const steps30 = [S('2s', 'read', 'hooks/held.ts', '52 lines'), S('9s', 'shell', 'bun run bench stores', '4 rows')]
const now30 = (say: string, kind: string, subj: string, el: string): NowHead => ({ meta: 'turn 25 · 2 steps', say, kind, subj, el })
const f30 = (name: string, left: (T: Transcript) => Line[], M: PaneModel, live: (T: Transcript) => Line[]): void =>
  dock(name, { C: 160, P: 56, R: 22, left, M, live })
f30(
  'f30-t0',
  base30,
  {
    now: { meta: 'turn 25 · step 2', say: 'Benchmarking both stores.', kind: 'shell', subj: 'bun run bench stores', el: '6s' },
    steps: [nth(steps30, 0), S('9s', 'shell', 'bun run bench stores', 'running', 'run')]
  },
  T => [liveDock(T, '9s', 'working', 0)]
)
f30(
  'f30-t1',
  T => flat(T, base30(T), '', fit(cat(sp(2), '{b|Both hold the same data; they differ in what they}'), T.F)),
  { now: now30('Writing the answer.', 'writing', 'the answer', '0.6s'), steps: steps30 },
  T => [liveDock(T, '10s', 'writing', 1)]
)
f30(
  'f30-t2',
  T => flat(T, base30(T), '', T.p(para30, { lead: true }), '', fit(cat(sp(2), '{m|table · 2 rows so far}'), T.F)),
  { now: now30('Writing the answer.', 'writing', 'the answer', '1.4s'), steps: steps30 },
  T => [liveDock(T, '11s', 'writing', 3)]
)
f30(
  'f30-t3',
  T => flat(T, base30(T), '', T.p(para30, { lead: true }), '', fit(cat(sp(2), '{m|table · 4 rows so far}'), T.F)),
  { now: now30('Writing the answer.', 'writing', 'the answer', '2.2s'), steps: steps30 },
  T => [liveDock(T, '11s', 'writing', 5)]
)
f30(
  'f30-t4',
  T => flat(T, base30(T), '', T.p(para30, { lead: true }), '', tbl30(T, 4), '', fit(cat(sp(2), '{t|Keep the LRU: 19 ns per read is the price of}'), T.F)),
  { now: now30('Writing the answer.', 'writing', 'the answer', '2.6s'), steps: steps30 },
  T => [liveDock(T, '12s', 'writing', 7)]
)
dock('f30-t5', {
  C: 160,
  P: 56,
  R: 22,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      base30(T),
      '',
      T.p(para30, { lead: true }),
      '',
      tbl30(T, 4),
      '',
      T.p('Keep the LRU: 19 ns per read is the price of dropping the right entry.'),
      '',
      T.receipt('done · turn 25', '2 steps', '13s')
    ),
  M: { idle: idle(25, '14:20', 'done', 'read only', '13s'), steps: steps30 }
})

// ---- G: a width check with wide characters
const G = transcript(59)
mock(
  'g-width',
  60,
  [
    nth(G.prompt('幅のテストを直して 👍🏽 and keep é as one cell', { chips: false }), 0),
    G.blank(),
    ...G.p('`全角` is 4 cells, `👍🏽` is 2, `é` is 1.', { lead: true }),
    G.blank(),
    G.receipt('done · turn 26', '', '2s')
  ].map(l => fit(l, 60))
)

// ---- I: the glyph test card (probe 16)
mock('i-card', 80, [
  fit(cellsOf('0 2 4 6 8 0 2 4 6 8 0 2 4 6 8 0 2 4 6 8 0 2 4 6 8 0 2 4 6 8 0 2 4 6 8 0 2 4 6 8', 'd'), 80),
  fit(cellsOf('▍ │ ✕ ⊘ ! ✓ ↗ ± ↺ ◇ ● › ※ ∴ ⠹ ⠿ ─ ┄ · … ↩ → ▰ ▱ ▸ ▏ ¹ ² ³ █ × − └', 't'), 80),
  fit(cellsOf('| | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | | |', 'd'), 80),
  fit(cellsOf('every glyph sits on an even column; a gap or an overlap means it is not 1 cell', 'm'), 80)
])

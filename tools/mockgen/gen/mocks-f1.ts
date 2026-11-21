// Scenarios F.1 to F.10.
import { dialog, cat, sp, fit, m, lr, cellsOf, rule, nth } from './lib'
import type { Agent, Idle, Line, PaneModel, SourceRef, Step, Transcript } from './lib'
import { flat, S, dock, fall, HINT, turn6, turn7, M7idle, liveNow, liveNeed } from './data'
import { agents, todos, filesBig, sources8, long } from './data2'
import type { SourceFull } from './data2'

export const idle = (turn: number, clock: string, state: string, story: string, time: string, next?: string): Idle => ({
  meta: `turn ${turn} · ${clock}`,
  state,
  story,
  time,
  next
})
const IDLE = { hint: HINT.autoIdle }

// ---- F.1 a fresh session and a first answer
export const steps1: readonly Step[] = [
  S('2s', 'read', 'README.md', '212 lines'),
  S('3s', 'read', 'package.json', '48 lines'),
  S('5s', 'search', '**/*.test.tsx', '26 files'),
  S('7s', 'read', 'hooks/register.tsx', '884 lines'),
  S('9s', 'read', 'tests/kit/seed.ts', '64 lines'),
  S('12s', 'read', '.github/workflows/ci.yml', '61 lines'),
  S('38s', 'test', 'bun test', '191 pass', 'pass'),
  S('44s', 'shell', 'bun run typecheck', 'clean'),
  S('46s', 'shell', 'git log --oneline -5', '5 commits')
]
const turn1 = (T: Transcript): Line[] =>
  flat(
    T,
    T.turn(1, '10:03'),
    '',
    T.prompt('what does this repo do, and is the test suite healthy?'),
    '',
    T.p(
      'ghostframe is a Claude Code plugin that redraws the terminal transcript, and its suite is healthy. 191 tests pass in 26 files and the typecheck is clean.',
      { lead: true }
    ),
    '',
    T.list([
      '`hooks/register.tsx` is the whole plugin: 884 lines, 13 hooks',
      'the tests reach it only through the engine, so they survive a refactor',
      'CI installs Bun without a pin, which is the one thing I would fix first'
    ]),
    '',
    T.receipt('done · turn 1', '9 steps', '52s')
  )
dock('f1', {
  R: 34,
  hero: true,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.notice('Claude Code 2.1.329 · Opus 5.5 · ~/code/ghostframe', '10:02'),
      T.notice('ghostframe 0.5.0 · cockpit docked at 72 columns · ctrl+x tab focuses the pane', '10:02'),
      '',
      '',
      turn1(T)
    ),
  M: { idle: idle(1, '10:04', 'done', 'suite green · 191 pass', '52s'), steps: steps1 }
})

// ---- F.2 one-line Q&A
dock('f2', {
  R: 24,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      turn1(T).slice(-3),
      '',
      '',
      T.turn(2, '10:06'),
      '',
      T.prompt('which bun version does the repo pin?'),
      '',
      T.p('`1.4.3`, in `mise.toml`. `package.json` has no `engines` field, so nothing enforces it.', { lead: true }),
      '',
      T.receipt('done · turn 2', '', '0.9s')
    ),
  M: { idle: idle(2, '10:06', 'done', 'no steps', '0.9s'), steps: steps1, stepsTurn: 1 }
})

// ---- F.3 a long explanatory answer
dock('f3', {
  R: 46,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(3, '10:09'),
      '',
      T.prompt('explain how the width helper should count cells, with the code'),
      '',
      T.p(
        'Width is counted per grapheme cluster, not per code point. A cluster is what the reader sees as one character, and the terminal gives it one cell or two.',
        { lead: true }
      ),
      '',
      T.h('Three cases'),
      T.list([
        'a combining mark adds zero cells: `e` followed by U+0301 is one cell',
        'CJK characters and most emoji are two cells',
        'a ZWJ sequence is one cluster; terminals disagree about its width, so reserve the larger'
      ]),
      '',
      T.h('The helper'),
      T.code('ts', 'hooks/grid.ts · 7 lines', [
        'const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });',
        '',
        'export function width(text: string): number {',
        '  let cells = 0;',
        '  for (const { segment } of seg.segment(text)) cells += cellWidth(segment);',
        '  return cells;',
        '}'
      ]),
      '',
      T.h('What to test'),
      T.list(
        [
          'A combining mark, a skin-tone modifier and a ZWJ family, each as one cluster.',
          'A cut that lands inside a wide character: it must leave one blank cell, not half a glyph.',
          'The same strings on the oldest Bun you support, because ICU decides the clusters.'
        ],
        { ordered: true }
      ),
      '',
      T.quote('Never slice a string by index before measuring it.'),
      '',
      T.receipt('done · turn 3', '3 steps', '21s')
    ),
  M: {
    idle: idle(3, '10:09', 'done', 'read only', '21s'),
    steps: [
      S('1s', 'read', 'hooks/grid.ts', '140 lines'),
      S('2s', 'search', '"cellWidth(" in hooks', '11 matches'),
      S('3s', 'read', 'tests/width.test.tsx', '96 lines')
    ]
  }
})

// ---- F.4 a debugging turn: 20 steps, a failing test, a fix
dock('f4', { R: 36, hero: true, bottom: IDLE, left: T => flat(T, turn6(T), '', '', turn7(T)), M: M7idle })

// ---- F.5 a 312-step turn, fallback at 100 columns: top, middle, end
const P12 = 'go: split register.tsx as planned, move the tests, run the full gate, open the PR'
const head12 = (T: Transcript): Line[] =>
  flat(
    T,
    T.you('approved the plan · accept edits on', '2m 05s'),
    '',
    T.receipt('done · turn 11', '14 steps', '2m 05s'),
    '',
    '',
    T.turn(12, '11:02'),
    '',
    T.prompt(P12)
  )
const todoRow = (C: number, text: string, n: string): Line => fit(lr(cat('{a|▸} {b|[>]} ', m(text, 'b')), cat(m(n, 'm'), sp(5)), C - 6), C)
fall('f5-top', {
  R: 28,
  left: T => flat(T, head12(T)),
  live: [liveNow(100, 'shell', 'bun test hooks/ledger', 'step 18 · 4s · 2m 56s'), todoRow(100, 'Move the 7 pure-helper tests next to their modules', '0 of 7')]
})
const fail171 = (T: Transcript): Line[] =>
  T.exc('✕', 'r', 'failed', 'test · bun test hooks/held · 1 of 38', '27m 56s', ['expect(held.size).toBe(256) · received 257', 'hooks/held.test.tsx:88:23'])
const report = (T: Transcript): Line[] =>
  flat(
    T,
    T.p('Halfway report. The ledger and the held store are out of `register.tsx` and green on their own; the hook tests are next.', { fg: 't' }),
    '',
    T.table(
      ['Module', 'Lines', 'Tests', 'State'],
      [
        ['hooks/ledger.ts', '141', '41', 'pass'],
        ['hooks/held.ts', '52', '38', 'pass'],
        ['hooks/register.tsx', '657', '112', 'moving']
      ],
      { align: ['l', 'r', 'r', 'l'] }
    )
  )
fall('f5-mid', {
  R: 28,
  left: T =>
    flat(
      T,
      T.capsule('worked · 58 steps · 27 shell · 18 read · 9 edit +4 · 1 failure → fixed', '14m 28s'),
      T.capsule('worked · 31 steps · 15 shell · 9 read · 5 edit +2', '19m 28s'),
      T.capsule('worked · 29 steps · 12 shell · 10 read · 4 edit +3', '24m 10s'),
      '',
      report(T),
      '',
      fail171(T),
      T.capsule('worked · 53 steps · 25 shell · 16 read · 8 edit +4 · 1 failure → fixed', '32m 56s')
    ),
  live: [liveNow(100, 'edit', 'hooks/register.tsx', 'step 209 · 1s · 34m 08s'), todoRow(100, 'Move hook tests, one module per commit', '4 of 7')]
})
fall('f5-end', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.capsule('worked · 38 steps · 19 shell · 11 read · 6 edit +2 · 1 failure → fixed', '44m 12s'),
      T.capsule('worked · 31 steps · 16 shell · 8 read · 5 edit +2', '49m 12s'),
      T.exc('↗', 't', '', 'pushed refactor/ledger-held · 9 commits · origin', '50m 20s'),
      T.exc('↗', 't', '', 'PR #7 opened · refactor: split register into ledger and held store', '50m 41s', [
        '{l|https://github.com/tashfiqul-islam/ghostframe/pull/7}'
      ]),
      T.capsule('worked · 11 steps · 8 shell · 3 read', '50m 58s'),
      '',
      T.p(
        'The split is done and PR #7 is open with the full gate green. `register.tsx` went from 884 lines to 657; the ledger and the held store each have their own tests.',
        { lead: true }
      ),
      '',
      T.list([
        '3 failures on the way, all fixed: an off-by-one in the LRU cap, a stale fixture, two type errors',
        '31 files changed across 9 commits, one module per commit as planned'
      ]),
      '',
      T.receipt('done · turn 12', '312 steps · 31 files · 7 of 7 to-dos', '51m 02s')
    )
})

// ---- F.6 seven background agents, fallback at 100 columns
const P13 = 'audit the repo before we publish: code, tests, docs, CI and the toolchain, in parallel'
const rosterRow = (a: Agent): Line => {
  const failed = a.state === 'failed'
  const done = a.state === 'done'
  return fit(
    lr(
      cat(
        a.nested ? '  ' : '',
        failed ? '{r|✕}' : `{${done ? 'd' : 'v'}|◇}`,
        ' ',
        fit(cellsOf(a.name, done ? 'm' : failed ? 't' : 'v'), a.nested ? 22 : 24),
        ' ',
        failed ? cat('{R|failed}  ', m(a.subj, 'm')) : done ? cat('{d|done}    ', m(a.subj, 'd')) : cat(cellsOf(a.kind.padEnd(7), 'm'), ' ', m(a.subj))
      ),
      cat(cellsOf(`${String(a.steps).padStart(3)} · ${a.time.padStart(7)}`, 'd'), sp(5)),
      94
    ),
    100
  )
}
fall('f6-run', {
  R: 30,
  left: T => flat(T, T.turn(13, '11:58'), '', T.prompt(P13)),
  live: [
    liveNow(100, 'agent', 'waiting on 7 agents', 'step 7 · 1m 12s · 1m 16s'),
    fit(rule(94, { label: 'AGENTS', meta: '7 running · 1 nested {d|[-]}' }), 100),
    ...agents('run').map(rosterRow)
  ]
})
fall('f6-done', {
  R: 30,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(13, '11:58'),
      '',
      T.prompt(P13),
      '',
      T.exc('✕', 'r', 'failed', 'agent Audit publish-readiness · context limit · 48 steps', '4m 02s'),
      T.capsule('worked · 7 agents · 262 steps · 6 done · {r|1 failed}', '5m 02s'),
      '',
      T.p(
        'Six of seven audits came back; the repo is close but not ready to publish. The publish-readiness audit ran out of context and needs a narrower brief.',
        { lead: true }
      ),
      '',
      T.table(
        ['Audit', 'Findings', 'Worst'],
        [
          ['register.tsx', '4', 'claim() reads state before turn.start'],
          ['helper modules', '2', 'ReDoS in the HEADING regex: cubic'],
          ['tests', '3', '19 tests share one mutable fixture'],
          ['CI and supply chain', '6', 'actions pinned by tag, not by SHA'],
          ['docs and ADRs', '2', 'ADR 0007 describes the old ledger'],
          ['toolchain', '0', 'bun 1.4.3 via mise is current']
        ],
        { align: ['l', 'r', 'l'] }
      ),
      '',
      T.receipt('done · turn 13', '{r|1 agent failed}', '5m 31s')
    )
})

// ---- F.7 web research with 8 sources
const cited = sources8.filter(s => s[0] !== '·').map(([mk, host, title, , url]): SourceRef => [mk, host, title, url])
export const steps14: readonly Step[] = [
  S('3s', 'web', '"npm trusted publishing github actions"', '10 results'),
  S('9s', 'fetch', 'docs.npmjs.com/trusted-publishers', '200 · 38 kB'),
  S('15s', 'fetch', 'docs.github.com/…/workflow-syntax', '200 · 212 kB'),
  S('21s', 'fetch', 'docs.github.com/…/reusing-workflows', '200 · 96 kB'),
  S('26s', 'web', '"bun publish provenance oidc"', '8 results'),
  S('31s', 'fetch', 'bun.sh/docs/cli/publish', '200 · 22 kB'),
  S('37s', 'fetch', 'github.blog/changelog/…immutable-releases', '200 · 14 kB'),
  S('44s', 'fetch', 'docs.sigstore.dev/cosign/keyless', '404', 'fail'),
  S('49s', 'web', '"zizmor auditor persona"', '6 results'),
  S('55s', 'fetch', 'docs.zizmor.sh/audits', '200 · 51 kB'),
  S('1m 02s', 'fetch', 'securitylab.github.com/…/actions', '200 · 67 kB'),
  S('1m 05s', 'read', '.github/workflows/release.yml', '48 lines'),
  S('1m 06s', 'read', 'package.json', '48 lines')
]
export const answer14 = (T: Transcript): Line[] =>
  flat(
    T,
    T.p(
      'Use npm trusted publishing: the release job proves who it is with OIDC, and no token is stored anywhere¹. Three things have to be true for it to work.',
      { lead: true }
    ),
    '',
    T.list(
      [
        'the job needs `id-token: write`, declared on the job, not the workflow²',
        'a reusable workflow publishes as its caller, so the trust entry must name the caller³',
        '`bun publish` passes provenance through, but only from a tag build⁵'
      ],
      { ordered: true }
    ),
    '',
    T.p('Run zizmor with the auditor persona on the release workflow before you turn it on; it flags the permission mistakes that make this unsafe⁴.'),
    '',
    T.sources(
      'SOURCES',
      [nth(cited, 3), nth(cited, 0), nth(cited, 1), nth(cited, 2), nth(cited, 4)].map((c, i): SourceRef => ['¹²³⁴⁵'.charAt(i), c[1], c[2], c[3]])
    )
  )
export const M14: { idle: Idle; steps: readonly Step[]; sources: SourceFull[] } = {
  idle: idle(14, '12:14', 'done', '1 fetch failed · not cited', '1m 31s'),
  steps: steps14,
  sources: [nth(sources8, 3), nth(sources8, 0), nth(sources8, 1), nth(sources8, 2), nth(sources8, 4), ...sources8.slice(5)].map((s, i): SourceFull =>
    i < 5 ? ['¹²³⁴⁵'.charAt(i), s[1], s[2], s[3], s[4]] : s
  )
} satisfies PaneModel
dock('f7', {
  R: 46,
  hero: true,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(14, '12:12'),
      '',
      T.prompt('how should we publish to npm from CI without a long-lived token? cite sources'),
      '',
      answer14(T),
      '',
      T.receipt('done · turn 14', '13 steps · 8 sources', '1m 31s')
    ),
  M: M14
})

// ---- F.8 a big multi-file refactor, unfolded (ctrl+o)
dock('f8', {
  R: 44,
  bottom: { hint: '{b|unfolded} {m|· every step of every turn · ctrl+o to fold · ctrl+e shows all}' },
  left: T =>
    flat(
      T,
      T.turn(12, '11:02'),
      '',
      T.prompt(P12),
      '',
      T.beat('Extracting the claim logic first; nothing else moves yet.', '12s'),
      T.xstep('read', 'hooks/register.tsx', '884 lines', '0.2s'),
      T.xstep('write', 'hooks/ledger.ts', '+141', '0.4s'),
      T.xstep('edit', 'hooks/register.tsx', '+3 −41', '0.3s'),
      T.code(
        'diff',
        'hooks/register.tsx · +3 −41 · first hunk',
        [
          ' import { cellWidth } from "./grid";',
          '-import { LRU } from "./lru";',
          '+import { claim, release } from "./ledger";',
          ' ',
          ' export const register: Register = (on) => {',
          '-  const ledger = new Map<string, Claim>();',
          '   on("turn.start", ($, e) => {',
          '-    ledger.clear();',
          '+    release(e.turn - 1);'
        ],
        { diff: true }
      ),
      T.xstep('test', 'bun test hooks/ledger', '3 of 41 fail', '4.1s', 'R'),
      T.xthought('The cap is checked after the insert, so the store holds 257.', '9s'),
      T.beat('Three tests fail: the LRU cap is off by one. Fixing it in the ledger, not in the tests.', '9m 28s'),
      T.xstep('edit', 'hooks/ledger.ts', '+1 −1', '0.2s'),
      T.xstep('test', 'bun test hooks/ledger', '41 pass', '3.9s', 'g'),
      T.xstep('shell', 'git commit -m "refactor: extract ledger"', 'c41d9e0', '0.3s', 't'),
      T.beat('Ledger is green and committed. Moving the held store the same way.', '10m 40s'),
      T.xstep('write', 'hooks/held.ts', '+52', '0.3s'),
      T.xstep('edit', 'hooks/register.tsx', '+2 −88', '0.4s'),
      T.xstep('write', 'hooks/held.test.tsx', '+61', '0.3s'),
      T.xstep('test', 'bun test hooks/held', '38 pass', '3.2s')
    ),
  M: { idle: idle(12, '11:53', 'done', '3 failures → fixed · ↗ PR #7', '51m 02s'), steps: long(312, { running: false }), todos: todos(7, -1), files: filesBig }
})

// ---- F.9 a permission prompt waiting, fallback at 100 columns
const permD = (C: number): Line[] =>
  dialog(
    C,
    'PERMISSION',
    'shell',
    ['git push --force-with-lease origin fix/ci-bun-pin'],
    ['allow once', 'always allow  {m|Bash(git push --force-with-lease:*) in this repo}', 'deny, and tell Claude what to do instead'],
    { note: '{w|Rewrites 1 commit on the remote branch.} Rebased on main at 2c4afb9.' }
  )
fall('f9', {
  R: 30,
  left: T =>
    flat(
      T,
      turn7(T, 'fall').slice(-9),
      '',
      '',
      T.turn(8, '10:31'),
      '',
      T.prompt('rebase on main and push it'),
      '',
      T.exc('✕', 'r', 'failed', 'shell · git push · rejected (non-fast-forward)', '9s')
    ),
  live: [liveNeed(94, 'permission · shell git push --force-with-lease')],
  bottom: { dialog: permD(100), st: { mode: 'needs you', modeFg: 'W' } }
})

// ---- F.10 a denied action and the recovery
dock('f10', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(9, '10:44'),
      '',
      T.prompt('clean the build output and rebuild'),
      '',
      T.you('denied · shell rm -rf dist · "keep dist, CI caches it"', '6s'),
      '',
      T.p(
        'Rebuilt in place without deleting anything: `bun run build` overwrote 14 files in `dist/` and removed none. The 3 stale files from the old entry point are still there.',
        { lead: true }
      ),
      '',
      T.p('If you want them gone, the safe way is `git clean -n dist` to see the list first.'),
      '',
      T.receipt('done · turn 9', '5 steps · 1 denied', '41s')
    ),
  M: {
    idle: idle(9, '10:45', 'done', '1 denied · rebuilt in place', '41s'),
    steps: [
      S('2s', 'read', 'package.json', '48 lines'),
      S('6s', 'shell', 'rm -rf dist', 'denied', 'you'),
      S('11s', 'search', 'dist/**', '17 files'),
      S('34s', 'shell', 'bun run build', '14 files'),
      S('36s', 'shell', 'git status --short dist', 'clean')
    ]
  }
})

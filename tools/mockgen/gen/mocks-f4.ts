// Scenarios F.32 to F.43 (F.31 is in mocks-f31.mjs).
import { dialog, cat, sp, fit, lr, cellsOf, setBg, paneKit, nth } from './lib'
import type { Line, NowHead, Step, Transcript } from './lib'
import { flat, S, dock, fall, HINT, turn6, turn7, M7idle, P7, P8, steps7, files7, sources7, liveDock, liveNow } from './data'
import { agents, todos, filesBig, long, AG } from './data2'
import type { Stage } from './data2'
import { idle, answer14, M14 } from './mocks-f1'
import { plan1, plan2, P11 } from './mocks-f2'
import { diffView } from './mocks-e2'

const IDLE = { hint: HINT.autoIdle }
const P12 = 'go: split register.tsx as planned, move the tests, run the full gate, open the PR'
const head12 = (T: Transcript): Line[] => flat(T, T.turn(12, '11:02'), '', T.prompt(P12))
const answer12 = (T: Transcript): Line[] =>
  flat(
    T,
    T.p(
      'The split is done and PR #7 is open with the full gate green. `register.tsx` went from 884 lines to 657; the ledger and the held store each have their own tests.',
      { lead: true }
    ),
    '',
    T.list([
      '3 failures on the way, all fixed: an off-by-one in the LRU cap, a stale fixture, two type errors',
      '31 files changed across 9 commits, one module per commit as planned'
    ])
  )
const pr7 = (T: Transcript): Line[] =>
  flat(
    T,
    T.exc('↗', 't', '', 'pushed refactor/ledger-held · 9 commits · origin', '50m 20s'),
    T.exc('↗', 't', '', 'PR #7 opened · refactor: split register into ledger and held store', '50m 41s', [
      '{l|https://github.com/tashfiqul-islam/ghostframe/pull/7}'
    ])
  )
const receipt12 = (T: Transcript): Line => T.receipt('done · turn 12', '312 steps · 3 failures → fixed · 31 files · 7 of 7 to-dos', '51m 02s')
const report = (T: Transcript): Line[] =>
  flat(
    T,
    T.p('Halfway report. The ledger and the held store are out of `register.tsx` and green on their own; the hook tests are next.'),
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
const now12 = (step: number, say: string, kind: string, subj: string, el: string): NowHead => ({ meta: `turn 12 · step ${step}`, say, kind, subj, el })
const M12idle = {
  idle: idle(12, '11:53', 'done', '3 failures → fixed · ↗ PR #7', '51m 02s'),
  steps: long(312, { running: false }),
  todos: todos(7, -1),
  files: filesBig
}

// ---- F.32 idle after a long turn
dock('f32', { R: 36, bottom: IDLE, hero: true, left: T => flat(T, head12(T), '', report(T), '', pr7(T), '', answer12(T), '', receipt12(T)), M: M12idle })

// ---- F.33 the 312-step turn in the pane: start, middle, end
dock('f33-start', {
  R: 32,
  left: T => flat(T, turn7(T).slice(-3), '', '', head12(T)),
  live: T => [liveDock(T, '2m 56s')],
  M: {
    now: now12(18, 'Starting with the pure-helper tests: no fixtures to move.', 'shell', 'bun test hooks/ledger', '4s'),
    steps: long(17),
    todos: todos(0, 0),
    files: filesBig.slice(5, 6)
  }
})
dock('f33-mid', {
  R: 32,
  hero: true,
  left: T => flat(T, head12(T), '', report(T)),
  live: T => [liveDock(T, '34m 08s')],
  M: {
    now: now12(209, 'Hook tests next, one module per commit.', 'edit', 'hooks/register.tsx', '1s'),
    steps: long(208).map((s, i) => (i === 208 ? S('34m 08s', 'edit', 'hooks/register.tsx', 'running', 'run') : s)),
    todos: todos(4, 4),
    files: filesBig.slice(0, 8)
  }
})
dock('f33-end', {
  R: 32,
  left: T => flat(T, head12(T), '', report(T), '', pr7(T)),
  live: T => [liveDock(T, '50m 58s', 'writing')],
  M: {
    now: { meta: 'turn 12 · 312 steps', say: 'Writing the answer.', kind: 'writing', subj: 'the answer', el: '3s' },
    steps: long(312, { running: false }),
    todos: todos(7, -1),
    files: filesBig
  }
})

// ---- F.34 seven agents in the pane: launch, running, late, done
const P13 = 'audit the repo before we publish: code, tests, docs, CI and the toolchain, in parallel'
const head13 = (T: Transcript): Line[] => flat(T, T.turn(13, '11:58'), '', T.prompt(P13))
const agentSteps = (stage: Stage): Step[] => [
  S('2s', 'read', 'docs/audit/brief.md', '41 lines'),
  ...AG.map(([name], i) =>
    S(
      '4s',
      'agent',
      name,
      stage === 'launch'
        ? 'launched'
        : stage === 'run'
          ? 'running'
          : stage === 'late'
            ? i === 0 || i === 1 || i === 3
              ? 'running'
              : i === 5
                ? 'failed'
                : 'done'
            : i === 5
              ? 'failed'
              : 'done',
      stage === 'launch' || stage === 'run' || (stage === 'late' && (i === 0 || i === 1 || i === 3)) ? 'run' : i === 5 ? 'fail' : '',
      i === 5 ? { open: true } : {}
    )
  )
]
const now13 = (el: string, n: number): NowHead => ({
  meta: 'turn 13 · step 8',
  say: 'Seven audits in parallel; I will merge their reports.',
  kind: 'agent',
  subj: `waiting on ${n} agent${n === 1 ? '' : 's'}`,
  el
})
dock('f34-launch', { R: 30, left: head13, live: T => [liveDock(T, '6s')], M: { now: now13('2s', 7), steps: agentSteps('launch'), agents: agents('launch') } })
dock('f34-run', {
  R: 30,
  hero: true,
  left: head13,
  live: T => [liveDock(T, '1m 16s')],
  M: { now: now13('1m 12s', 7), steps: agentSteps('run'), agents: agents('run') }
})
dock('f34-late', { R: 30, left: head13, live: T => [liveDock(T, '4m 02s')], M: { now: now13('3m 58s', 3), steps: agentSteps('late'), agents: agents('late') } })
dock('f34-done', {
  R: 30,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      head13(T),
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
      T.exc('✕', 'r', 'still failing', 'agent Audit publish-readiness · context limit · 48 steps', '4m 02s'),
      '',
      T.receipt('done · turn 13', '9 steps · 7 agents · {r|1 failed}', '5m 31s')
    ),
  M: {
    idle: idle(13, '12:04', 'done', '{r|1 agent failed} · 6 reports merged', '5m 31s'),
    steps: [...agentSteps('done'), S('5m 04s', 'read', 'docs/audit/summary.md', '212 lines')],
    agents: agents('done')
  }
})

// ---- F.35 pinning an old turn
const scrolled = (T: Transcript): Line[] =>
  flat(T, turn6(T), '', '', turn7(T), '', '', T.turn(8, '10:31'), '', T.prompt(P8), '', T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s'))
const M12mid = {
  now: now12(209, 'Hook tests next, one module per commit.', 'edit', 'hooks/register.tsx', '1s'),
  steps: long(208),
  todos: todos(4, 4),
  files: filesBig.slice(0, 8)
}
dock('f35-before', { R: 34, left: scrolled, live: T => [liveDock(T, '34m 08s')], bottom: { input: '/steps 7' }, M: M12mid })
dock('f35-after', {
  R: 34,
  hero: true,
  left: scrolled,
  live: T => [liveDock(T, '34m 12s')],
  M: {
    ...M12mid,
    now: now12(210, 'Hook tests next, one module per commit.', 'shell', 'bun test hooks/held', '2s'),
    pin: 7,
    steps: steps7,
    files: files7,
    sources: sources7,
    stepsMeta: '20 steps · {r|1 failed} · 2m 44s'
  }
})

// ---- F.36 a permission prompt while the pane shows the step that asked
const permD = (C: number): Line[] =>
  dialog(
    C,
    'PERMISSION',
    'shell',
    ['git push --force-with-lease origin fix/ci-bun-pin'],
    ['allow once', 'always allow  {m|Bash(git push --force-with-lease:*) in this repo}', 'deny, and tell Claude what to do instead'],
    { note: '{w|Rewrites 1 commit on the remote branch.} Rebased on main at 2c4afb9.' }
  )
dock('f36', {
  R: 36,
  hero: true,
  bottom: { dialog: permD(200), st: { mode: 'needs you', modeFg: 'W' } },
  left: T => flat(T, turn7(T), '', '', T.turn(8, '10:31'), '', T.prompt('rebase on main and push it')),
  M: {
    now: { meta: 'turn 8 · step 4', needs: 'permission', kind: 'shell', subj: 'git push --force-with-lease origin fix/ci-bun-pin', el: '12s' },
    steps: [
      S('2s', 'shell', 'git fetch origin', '2 commits'),
      S('5s', 'shell', 'git rebase origin/main', 'rebased'),
      S('9s', 'shell', 'git push', 'non-fast-forward', 'fail', { open: true }),
      S('21s', 'shell', 'git push --force-with-lease origin fix/ci-bun-pin', 'needs you', 'need')
    ]
  }
})

// ---- F.37 a failure, then recovery, in both halves
const head7 = (T: Transcript): Line[] => flat(T, T.turn(7, '10:26'), '', T.prompt(P7))
dock('f37-fail', {
  R: 24,
  left: head7,
  live: T => [liveDock(T, '52s')],
  M: {
    now: { meta: 'turn 7 · step 7', say: 'It fails here too: 1.4.1 splits the skin-tone modifier.', kind: 'read', subj: 'hooks/grid.ts', el: '1s' },
    steps: [...steps7.slice(0, 5), { ...steps7[5], open: true }, S('52s', 'read', 'hooks/grid.ts', 'running', 'run')]
  }
})
dock('f37-fixed', { R: 24, bottom: IDLE, left: T => turn7(T), M: M7idle })
dock('f37-open', {
  R: 24,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      head7(T),
      '',
      T.p('I found the cause but could not fix it here: CI runs Bun 1.4.1 and the tests need 1.4.2 or later. The workflow file is protected on this branch.', {
        lead: true
      }),
      '',
      T.exc('✕', 'r', 'still failing', 'test · bun test width · 2 of 14', '41s', ['expect(width("👍🏽")).toBe(2) · received 4', 'tests/width.test.tsx:41:27']),
      T.exc('⊘', 'w', 'still blocked', 'edit .github/workflows/ci.yml · policy: protected path', '1m 44s'),
      '',
      T.receipt('{R|failed} {m|· turn 7}', '12 steps · 1 failure · 1 blocked', '1m 52s')
    ),
  M: {
    idle: idle(7, '10:28', '{R|failed}', '1 failure · 1 blocked', '1m 52s', 'unprotect ci.yml, or pin Bun another way'),
    steps: [
      ...steps7.slice(0, 5),
      { ...steps7[5], open: true },
      ...steps7.slice(6, 11),
      S('1m 44s', 'edit', '.github/workflows/ci.yml', 'protected path', 'block', { open: true })
    ]
  }
})

// ---- F.38 plan mode across both halves
dock('f38', {
  R: 44,
  bottom: { hint: HINT.accept.replace(' · esc to stop', '') },
  left: T =>
    flat(
      T,
      T.turn(11, '10:58'),
      '',
      T.prompt(P11),
      '',
      plan1(T),
      '',
      T.you('rejected the plan · "do the ledger first, alone"', '1m 31s'),
      '',
      plan2(T),
      '',
      T.you('approved the plan · accept edits on', '2m 05s'),
      '',
      T.receipt('done · turn 11', '19 steps · 2 plans', '2m 05s')
    ),
  M: {
    idle: idle(11, '11:00', 'done', 'plan approved · revision 2', '2m 05s', 'next: say "go" to start the plan'),
    steps: [
      S('3s', 'read', 'hooks/register.tsx', '884 lines'),
      S('6s', 'search', '"claim(" in hooks', '14 matches'),
      S('9s', 'read', 'docs/adr/0007-ledger.md', '88 lines'),
      S('14s', 'search', '"heldStore" in hooks', '9 matches'),
      S('19s', 'read', 'tests/register.test.tsx', '412 lines'),
      S('24s', 'search', '**/*.test.tsx', '26 files'),
      S('31s', 'read', 'tests/kit/seed.ts', '64 lines'),
      S('38s', 'read', 'hooks/grid.ts', '140 lines'),
      S('44s', 'search', '"export " in hooks/register.tsx', '31 matches'),
      S('49s', 'read', 'package.json', '48 lines'),
      S('52s', 'read', 'docs/audit/summary.md', '212 lines'),
      S('55s', 'search', '"LRU" in hooks', '6 matches'),
      S('58s', 'read', 'hooks/lru.ts', '71 lines'),
      S('1m 00s', 'read', '.github/workflows/ci.yml', '61 lines'),
      S('1m 31s', 'plan', '4 steps · touches 31 files', 'rejected', 'you'),
      S('1m 36s', 'read', 'hooks/register.tsx:40-212', '173 lines'),
      S('1m 39s', 'search', '"ledger" in tests', '19 matches'),
      S('1m 41s', 'read', 'tests/kit/seed.ts', '64 lines'),
      S('2m 05s', 'plan', 'revision 2 · 2 steps · 6 files', 'approved', 'you')
    ]
  }
})

// ---- F.39 resizing 200 → 100 → 200 mid-turn
const M39 = (step: number, n: number) => ({
  now: now12(step, 'Moving the claim logic behind claim(key, turn).', 'test', 'bun test hooks/ledger', '8s'),
  steps: long(n),
  todos: todos(1, 1),
  files: filesBig.slice(0, 4)
})
dock('f39-a', { R: 30, left: T => flat(T, turn7(T), '', '', head12(T)), live: T => [liveDock(T, '7m 36s')], M: M39(47, 46) })
fall('f39-b', {
  C: 100,
  R: 30,
  left: T => flat(T, turn7(T, 'fall'), '', '', head12(T), '', T.capsule('worked · 30 steps · 14 shell · 9 read · 5 edit +2', '5m 00s')),
  live: [
    liveNow(100, 'test', 'bun test hooks/ledger', 'step 48 · 2s · 7m 44s'),
    fit(lr(cat('{a|▸} {b|[>] Move hook tests, one module per commit}'), cat('{m|1 of 7}', sp(5)), 94), 100)
  ]
})
dock('f39-c', {
  R: 30,
  left: T => flat(T, turn7(T), '', '', head12(T)),
  live: T => [liveDock(T, '7m 58s')],
  M: { ...M39(50, 49), now: now12(50, 'Moving the claim logic behind claim(key, turn).', 'edit', 'hooks/ledger.ts', '1s') }
})

// ---- F.40 toggling fullscreen off and on mid-session
dock('f40-a', { R: 28, bottom: { hint: HINT.autoIdle, input: '/tui default' }, left: T => flat(T, turn6(T), '', '', turn7(T)), M: M7idle })
fall('f40-b', {
  C: 200,
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      turn7(T, 'fall').slice(4),
      '',
      T.notice('fullscreen off · no dock on the main screen · capsules from here · /steps opens the log above the prompt', '10:30'),
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
dock('f40-c', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      turn7(T).slice(-9),
      '',
      '',
      T.turn(8, '10:31'),
      '',
      T.prompt(P8),
      '',
      T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s'),
      T.exc('↗', 't', '', 'PR #6 opened · ci: pin Bun to mise.toml', '14s', ['{l|https://github.com/tashfiqul-islam/ghostframe/pull/6}']),
      '',
      T.p('PR #6 is open against `main`.', { lead: true }),
      '',
      T.receipt('done · turn 8', '2 steps', '19s'),
      '',
      T.notice('fullscreen on · cockpit docked at 72 columns · step logs for 8 turns', '10:33')
    ),
  M: {
    idle: idle(8, '10:32', 'done', '↗ PR #6 opened', '19s'),
    steps: [S('3s', 'shell', 'git push -u origin fix/ci-bun-pin', '1 commit', 'out'), S('14s', 'shell', 'gh pr create --fill', 'PR #6', 'out')]
  }
})

// ---- F.41 web research: SOURCES in the pane, footnotes in the answer
const K = paneKit(72)
const pad = (rows: readonly Line[], n: number, foot: readonly Line[] = []): Line[] => {
  const out = [...rows]
  while (out.length < n - foot.length) out.push(K.blank())
  return [...out.slice(0, n - foot.length), ...foot]
}
const srcAll = M14.sources.flatMap((s, i) => {
  const r1 = K.source(s)
  const url =
    s[4] ||
    nth(
      [
        'https://github.blog/changelog/2026-10-28-immutable-releases',
        'https://securitylab.github.com/resources/github-actions-preventing-pwn-requests',
        'https://docs.sigstore.dev/cosign/keyless'
      ],
      i - 5
    )
  const r2 = fit(cat(sp(4), cellsOf(url, s[3] === '404' ? 'd' : 'l')), 72)
  return i === 2 ? [setBg(r1, 'k'), setBg(r2, 'k')] : [r1, r2]
})
dock('f41', {
  R: 46,
  focus: true,
  bottom: { hint: HINT.pane },
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
  lines: (_P, R) =>
    pad([K.sec('LAST', 'turn 14 · 12:14'), ...K.last(M14.idle), K.blank(), K.sec('SOURCES · ALL', '8 read · 5 cited', { labelFg: 'b' }), ...srcAll], R - 7, [
      K.blank(),
      fit(cat(sp(2), '{b|enter} {m|open in the browser}   {b|c} {m|copy URL}   {b|u} {m|fit}   {b|esc} {m|prompt}'), 72)
    ])
})

// ---- F.42 a multi-file refactor: FILES, and how a diff is viewed
const fileAll = filesBig.map((f, i) => (i === 2 ? setBg(K.file(f), 'k') : K.file(f)))
dock('f42-files', {
  R: 34,
  focus: true,
  bottom: { hint: HINT.pane },
  left: T => flat(T, head12(T), '', pr7(T), '', answer12(T), '', receipt12(T)),
  lines: (_P, R) =>
    pad(
      [
        K.sec('LAST', 'turn 12 · 11:53'),
        ...K.last(M12idle.idle),
        K.blank(),
        K.sec('FILES · ALL', '11 changed · {g|+418} {r|−388}', { labelFg: 'b' }),
        ...fileAll
      ],
      R - 7,
      [K.blank(), fit(cat(sp(2), '{b|enter} {m|diff}   {b|c} {m|copy path}   {b|f} {m|fit}   {b|esc} {m|prompt}'), 72)]
    )
})
dock('f42-diff', {
  R: 34,
  focus: true,
  hero: true,
  bottom: { hint: HINT.pane },
  left: T => flat(T, head12(T), '', pr7(T), '', answer12(T), '', receipt12(T)),
  lines: (_P, R) => diffView(R - 7)
})
fall('f42-fall', {
  C: 100,
  R: 30,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      receipt12(T),
      '',
      '',
      T.prompt('/diff hooks/register.tsx'),
      T.code(
        'diff',
        'hooks/register.tsx · +11 −238 · hunk 1 of 4',
        [
          ' import { cellWidth } from "./grid";',
          '-import { LRU } from "./lru";',
          '+import { claim, release } from "./ledger";',
          '+import { held } from "./held";',
          ' ',
          ' export const register: Register = (on) => {',
          '-  const ledger = new Map<string, Claim>();',
          '-  const store = new LRU<string, Held>(256);',
          '   on("turn.start", ($, e) => {',
          '-    ledger.clear();',
          '+    release(e.turn - 1);'
        ],
        { diff: true }
      ),
      fit(cat(sp(2), '{m|… 3 more hunks · /diff hooks/register.tsx all · /copy diff hooks/register.tsx}'), T.F)
    )
})

// ---- F.43 compaction and resume: what the pane shows after each
dock('f43-compact', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      receipt12(T),
      '',
      fit('{m|● Compacted while idle to keep the next turn fast · "idleCompaction": false in settings.json turns this off}', T.F + 1),
      T.notice('compacted · 182k → 24k tokens · summary kept · 12 turns folded · step logs kept', '12:40')
    ),
  M: {
    ...M12idle,
    idle: idle(
      12,
      '11:53',
      'done',
      '3 failures → fixed · {m|before the compaction}',
      '51m 02s',
      'Claude no longer has these steps in context; the pane still does'
    )
  }
})
dock('f43-resume', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.notice('resumed · session of Wed 18 Nov · 31 turns · 22% context · step logs for 31 turns', '09:02'),
      '',
      fit("{m|※ recap: You're publishing ghostframe. The register split is merged (PR #7); the release workflow still}", T.F + 1),
      fit('{m|  uses a stored npm token and ADR 0007 is stale. (turn off recaps in /config)}', T.F + 1)
    ),
  M: {
    idle: {
      meta: 'turn 31 · Wed 18 Nov',
      state: 'done',
      story: 'restored from the step log',
      time: '14s',
      next: 'this session has run nothing yet · /steps 12 pins any earlier turn'
    },
    steps: [
      S('2s', 'read', '.github/workflows/release.yml', '48 lines'),
      S('4s', 'read', 'docs/adr/0007-ledger.md', '88 lines'),
      S('6s', 'read', 'package.json', '48 lines'),
      S('9s', 'shell', 'git log --oneline -3', '3 commits')
    ],
    stepsTurn: 31
  }
})

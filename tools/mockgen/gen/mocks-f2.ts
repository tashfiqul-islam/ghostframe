// Scenarios F.11 to F.22.
import { dialog, cat, sp, fit, m, lr, cellsOf, setBg, fitPane, mock } from './lib'
import type { Line, Mark, NowHead, Step, Transcript } from './lib'
import { flat, S, dock, fall, HINT, turn7, M7idle, steps7, files7, sources7, liveDock } from './data'
import { todos, filesBig, long } from './data2'
import { idle } from './mocks-f1'

const IDLE = { hint: HINT.autoIdle }

// ---- F.11 plan mode end to end, fallback at 100 columns
const planBody = (T: Transcript, items: readonly string[], tail: string): Line[] =>
  flat(T, fit(cat(sp(2), '{B|Split register.tsx into a ledger and a held store}'), T.F), '', T.list(items, { ordered: true }), '', T.p(tail))
export const plan1 = (T: Transcript): Line[] => [
  T.frameTop('PLAN', '4 steps · touches 31 files'),
  ...planBody(
    T,
    [
      'Extract claim logic into `hooks/ledger.ts` behind `claim(key, turn)`.',
      'Move the LRU into `hooks/held.ts`; test it at the interface.',
      'Re-point 19 tests at the new modules, one commit per module.',
      'Delete the dead exports the audit confirmed.'
    ],
    'Not in this plan: the grapheme width fix (PR #4).'
  ),
  T.frameEnd()
]
export const plan2 = (T: Transcript): Line[] => [
  T.frameTop('PLAN · REVISION 2', '2 steps · touches 6 files'),
  ...planBody(
    T,
    ['Extract claim logic into `hooks/ledger.ts` behind `claim(key, turn)`, with its own tests.', 'Stop there and open a PR. The held store is a second plan.'],
    'Not in this plan: the held store, the test moves, the dead exports.'
  ),
  T.frameEnd()
]
export const P11 = 'plan the register.tsx split, do not touch anything yet'
fall('f11', {
  R: 44,
  bottom: { hint: HINT.accept.replace(' · esc to stop', '') },
  left: T =>
    flat(
      T,
      T.turn(11, '10:58'),
      '',
      T.prompt(P11),
      '',
      T.capsule('worked · 14 steps · 9 read · 5 search', '1m 02s'),
      '',
      plan1(T),
      '',
      T.you('rejected the plan · "do the ledger first, alone"', '1m 31s'),
      T.capsule('worked · 3 steps · 2 read · 1 search', '1m 44s'),
      '',
      plan2(T),
      '',
      T.you('approved the plan · accept edits on', '2m 05s'),
      '',
      T.receipt('done · turn 11', '2 plans', '2m 05s')
    )
})

// ---- F.12 an ask-user card
const askD = (C: number): Line[] =>
  dialog(
    C,
    'QUESTION',
    '1 of 1 · single choice',
    ['PR #7 (refactor: split register into ledger and held store) is green. How should it land?'],
    ['Squash-merge when green', 'Merge commit, keep the 9 commits', 'Leave it open; I will merge it myself', 'Other…'],
    { foot: 'enter to choose · 1 to 4 pick · esc to skip' }
  )
dock('f12', {
  R: 30,
  bottom: { dialog: askD(200), st: { mode: 'needs you', modeFg: 'W' } },
  left: T =>
    flat(
      T,
      T.turn(15, '12:20'),
      '',
      T.prompt('PR #7 is green, land it and clean up the branch'),
      '',
      T.you('Delete the remote branch too? {d|→} {t|Yes, after the merge}', '18s')
    ),
  M: {
    now: { meta: 'turn 15 · step 4', needs: 'question · 1 of 1', kind: 'ask', subj: 'How should it land?', el: '41s' },
    steps: [
      S('3s', 'shell', 'gh pr view 7 --json state,checks', '3 of 3 pass'),
      S('5s', 'shell', 'git status --short', 'clean'),
      S('18s', 'ask', 'Delete the remote branch too?', 'yes', 'you'),
      S('59s', 'ask', 'How should it land?', 'needs you', 'need')
    ]
  }
})

// ---- F.13 an interrupted turn and a steering message
dock('f13', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(16, '12:31'),
      '',
      T.prompt('run the full gate on main after the merge'),
      '',
      setBg(lr(cat('{a|▍} {b|skip the e2e suite, it needs the staging secrets}'), '{m|steer · 1m 10s}', T.F), 's'),
      '',
      T.p('Unit and integration are green on `main` at `a1f3c2e`; I was partway through the', { lead: true }),
      fit(cat(sp(2), '{m|…}'), T.F),
      '',
      T.you('interrupted · esc · shell bun run gate was cut after 22s', '4m 12s'),
      '',
      T.receipt('{w|interrupted} {m|· turn 16}', '31 steps', '4m 12s')
    ),
  M: {
    idle: idle(16, '12:35', '{w|interrupted}', 'step 31 cut · 1 steer', '4m 12s', 'nothing was written after the cut'),
    steps: [
      ...long(28, { running: false }),
      S('3m 49s', 'test', 'bun test --filter integration', '64 pass', 'pass'),
      S('4m 12s', 'shell', 'bun run gate', 'cut', 'you')
    ]
  }
})

// ---- F.14 a rate limit
dock('f14', {
  R: 24,
  bottom: { hint: HINT.autoIdle, st: { mode: 'needs you', modeFg: 'W', five: 100, fiveLeft: 'resets 16:00', ctx: 41 } },
  left: T =>
    flat(
      T,
      T.turn(17, '14:41'),
      '',
      T.prompt('now do the held store the same way'),
      '',
      T.exc('!', 'w', 'needs you', '5-hour limit reached · resets 16:00 (in 1h 12m) · or /model to switch', '6m 48s'),
      '',
      T.receipt('{W|needs you} {m|· turn 17}', '47 steps · 4 files', '6m 48s')
    ),
  M: {
    idle: idle(17, '14:48', '{W|needs you}', '5-hour limit · resets 16:00', '6m 48s', 'step 47 finished; nothing was lost · say "continue" at 16:00'),
    steps: long(47, { running: false }),
    todos: todos(1, 1),
    files: filesBig.slice(0, 4)
  }
})

// ---- F.15 compaction mid-session, fallback at 100 columns
fall('f15', {
  R: 26,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.receipt('done · turn 30', '312 steps · 31 files · 7 of 7 to-dos', '51m 02s'),
      '',
      fit('{m|● Compacted while idle to keep the next turn fast · "idleCompaction": false in settings.json turns this off}', T.F + 1),
      T.notice('compacted · 182k → 24k tokens · summary kept · 30 turns folded · step logs kept', '23:58'),
      '',
      '',
      T.turn(31, '23:59', 'AFTER COMPACT'),
      '',
      T.prompt('what is left before we can publish?'),
      '',
      T.capsule('worked · 4 steps · 3 read · 1 shell', '9s'),
      '',
      T.p('Two things: the release workflow still uses a stored token, and ADR 0007 describes the old ledger.', { lead: true }),
      '',
      T.receipt('done · turn 31', '', '14s')
    )
})

// ---- F.16 a resumed session with a recap, fallback at 100 columns
fall('f16', {
  R: 30,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.notice('resumed · session of Wed 18 Nov · 31 turns · 22% context · step logs for 31 turns', '09:02'),
      '',
      fit("{m|※ recap: You're publishing ghostframe. The register split is merged (PR #7); the release workflow still}", T.F + 1),
      fit('{m|  uses a stored npm token and ADR 0007 is stale. (turn off recaps in /config)}', T.F + 1),
      fit('{m|  └ Read .github/workflows/release.yml (48 lines)}', T.F + 1),
      fit('{m|  └ Skills restored (karpathy-guidelines, ponytail)}', T.F + 1),
      '',
      '',
      T.turn(32, 'Thu 19 Nov · 09:02', 'RESUMED'),
      '',
      T.prompt('switch the release workflow to trusted publishing'),
      '',
      T.capsule('worked · 9 steps · 4 read · 3 edit · 2 shell', '48s'),
      '',
      T.p(
        'The release job now publishes with OIDC and the `NPM_TOKEN` secret is no longer read. I did not delete the secret; that is yours to do in the repository settings.',
        { lead: true }
      ),
      '',
      T.receipt('done · turn 32', '2 files', '54s')
    )
})

// ---- F.17 slash command output
const kv = (T: Transcript, k: string, v: string, rest: string): Line =>
  fit(cat(sp(2), cellsOf(k.padEnd(13), 'm'), cellsOf(v.padEnd(10), 't'), m(rest, 'm')), T.F)
const help = (T: Transcript, c: string, d: string): Line => fit(cat(sp(2), cellsOf(c.padEnd(22), 't'), m(d, 'm')), T.F)
dock('f17', {
  R: 36,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.prompt('/cost'),
      T.frameTop('/cost'),
      kv(T, 'session', '$54.26', '4h 41m · 31 turns'),
      kv(T, 'last turn', '$1.23', '51m 02s · 312 steps'),
      kv(T, 'input', '1.2M', 'tokens · 94% cached'),
      kv(T, 'output', '186k', 'tokens'),
      T.frameEnd(),
      '',
      T.prompt('/help cockpit'),
      T.frameTop('/help · cockpit'),
      help(T, '/cockpit', 'open or close the pane · /cockpit 56 sets its width'),
      help(T, '/steps 7', 'pin the steps of turn 7 in the pane · /steps releases the pin'),
      help(T, '/steps 7 all', 'print the whole log of turn 7 here, as text you can select'),
      help(T, '/diff hooks/grid.ts', 'print the diff of one file changed this session'),
      help(T, '/files', 'print the files-changed table of the last turn'),
      help(T, '/copy', 'answer · code 2 · link 3 · steps 7 · turn 7, to the clipboard'),
      T.frameEnd(),
      '',
      T.prompt('/steps 7'),
      T.notice('/steps 7 · turn 7 pinned in the pane · 20 steps · /steps releases it', '12:41'),
      '',
      T.prompt('/steps 44'),
      T.exc('✕', 'r', 'failed', '/steps 44 · no such turn · this session has 31', '12:41')
    ),
  M: {
    idle: idle(31, '12:14', 'done', 'no steps', '14s'),
    pin: 7,
    steps: steps7,
    files: files7,
    sources: sources7,
    stepsMeta: '20 steps · {r|1 failed} · 2m 44s'
  }
})

// ---- F.18 bash mode
const out = (T: Transcript, l: string, fg = 't'): Line => setBg(fit(cat(sp(2), cellsOf(l, fg)), T.F), 's', 2)
dock('f18', {
  R: 32,
  bottom: { hint: '{t|shell} {m|· runs in your shell, output goes to Claude}', input: '! ' },
  left: T =>
    flat(
      T,
      turn7(T).slice(-5),
      '',
      '',
      setBg(fit(cat('{a|▍} {a|!} {b|bun test tests/width.test.tsx --bail}'), T.F), 's'),
      T.frameTop('shell', 'exit 0 · 1.2s'),
      out(T, 'bun test v1.4.3'),
      out(T, 'tests/width.test.tsx:'),
      ...[
        'width > counts ASCII as one cell [0.11ms]',
        'width > counts a combining mark as zero cells [0.09ms]',
        'width > counts CJK as two cells [0.08ms]',
        'width > counts a skin-tone modifier with its base [0.21ms]',
        'width > counts a ZWJ family as one cluster [0.19ms]'
      ].map(l => setBg(fit(cat(sp(2), '{g|(pass)} ', cellsOf(l, 't')), T.F), 's', 2)),
      out(T, ''),
      out(T, ' 14 pass', 'g'),
      out(T, ' 0 fail'),
      out(T, ' 31 expect() calls'),
      out(T, 'Ran 14 tests across 1 file. [48.00ms]'),
      fit(cat(sp(2), '{m|… 9 more lines · ctrl+o}'), T.F),
      T.frameEnd()
    ),
  M: M7idle
})

// ---- F.19 a hook error
dock('f19', {
  R: 26,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(18, '13:02'),
      '',
      T.prompt('make cellWidth async so it can load the table lazily'),
      '',
      T.p('I could not land this: the lint hook rejects the edit and I should not work around a hook. The change makes two callers drop a promise.', {
        lead: true
      }),
      '',
      T.exc('⊘', 'w', 'still blocked', 'edit hooks/grid.ts · hook PreToolUse lint-staged', '2m 14s', [
        'oxlint: 2 errors · no-floating-promises (hooks/grid.ts:88, :102)'
      ]),
      '',
      T.receipt('{W|needs you} {m|· turn 18}', '6 steps · 1 blocked', '2m 20s'),
      '',
      fit('{m|● ghostframe: turn.complete hook skipped: threw state.set: denied: ghostframe owns no key "pane.pin"}', T.F + 4)
    ),
  M: {
    idle: idle(18, '13:04', '{W|needs you}', '1 blocked · hook lint-staged', '2m 20s', 'fix the two callers, or tell Claude to'),
    steps: [
      S('2s', 'read', 'hooks/grid.ts', '140 lines'),
      S('4s', 'search', '"cellWidth(" in hooks', '11 matches'),
      S('31s', 'edit', 'hooks/grid.ts', 'hook lint-staged', 'block', { open: true }),
      S('44s', 'read', 'hooks/md/table.ts', '212 lines'),
      S('1m 58s', 'edit', 'hooks/grid.ts', 'hook lint-staged', 'block', { open: true }),
      S('2m 14s', 'shell', 'oxlint hooks/grid.ts', '2 errors', 'fail', { open: true })
    ]
  }
})

// ---- F.20 a Playwright browser session
const br = (t: string, s: string, r: string, mk: Mark | '' = ''): Step => S(t, 'browser', s, r, mk)
dock('f20', {
  R: 30,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.turn(19, '13:20'),
      '',
      T.prompt('log in to the demo app as the seeded user and check the dashboard export'),
      '',
      T.p(
        'Login works and the dashboard renders, but there is no export button to click. The page has an "Export" menu with a "CSV" item instead, so the test plan names a control that no longer exists.',
        { lead: true }
      ),
      '',
      T.exc('✕', 'r', 'still failing', 'browser · click "Export CSV" · no such element', '1m 09s', [
        'getByRole("button", { name: "Export CSV" }) · 0 elements · waited 5.0s'
      ]),
      '',
      T.p('Screenshots are in `.playwright/`: `login.png`, `dashboard.png`, `export-menu.png`.'),
      '',
      T.receipt('{R|failed} {m|· turn 19}', '12 steps · 1 failure', '1m 31s')
    ),
  M: {
    idle: idle(19, '13:21', '{R|failed}', '1 failure · selector not found', '1m 31s'),
    steps: [
      S('2s', 'read', 'e2e/dashboard.plan.md', '31 lines'),
      br('6s', 'goto localhost:5173/login', '200 · 1280×720'),
      br('7s', 'fill #email "dev@ghostframe.test"', 'filled'),
      br('8s', 'fill #password', 'filled'),
      br('10s', 'click "Sign in"', 'navigated'),
      br('11s', 'screenshot login.png', 'saved · 96 kB'),
      br('14s', 'wait for "Dashboard"', 'visible'),
      br('15s', 'screenshot dashboard.png', 'saved · 212 kB'),
      br('1m 09s', 'click "Export CSV"', 'no such element', 'fail'),
      br('1m 14s', 'snapshot', '41 nodes'),
      br('1m 20s', 'click "Export"', 'menu open'),
      br('1m 22s', 'screenshot export-menu.png', 'saved · 88 kB')
    ].map((s, i) => (i === 8 ? { ...s, open: true } : s))
  }
})

// ---- F.21 an MCP-heavy turn
const mc = (t: string, s: string, r: string, mk: Mark | '' = ''): Step => S(t, 'mcp', s, r, mk)
dock('f21', {
  R: 28,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      T.notice('mcp context7 disconnected · tools unavailable · /mcp to reconnect', '13:40'),
      '',
      '',
      T.turn(20, '13:41'),
      '',
      T.prompt('is anything on my calendar tomorrow that clashes with the release window?'),
      '',
      T.p(
        'Nothing clashes: the release window is 10:00 to 11:00 and your first meeting is at 13:30. I could not check the Bun release notes because context7 is disconnected, so the window assumes no new Bun version tomorrow.',
        { lead: true }
      ),
      '',
      T.receipt('done · turn 20', '9 steps · 1 failure', '38s')
    ),
  M: {
    idle: idle(20, '13:42', 'done', '1 failure · mcp context7 is down', '38s'),
    steps: [
      mc('2s', 'calendar · list_calendars', '3 calendars'),
      mc('5s', 'calendar · list_events', '4 events'),
      mc('7s', 'calendar · get_event', 'Release window'),
      mc('9s', 'calendar · get_event', 'Design review'),
      mc('12s', 'drive · search_files', '2 files'),
      mc('15s', 'drive · read_file_content', 'release-checklist.md'),
      mc('21s', 'context7 · resolve-library-id', 'disconnected', 'fail'),
      mc('24s', 'calendar · suggest_time', '3 slots'),
      mc('31s', 'gmail · search_threads', '0 threads')
    ]
  }
})

// ---- F.22 the to-do list over time
const P22 = 'go: split register.tsx as planned, move the tests, run the full gate, open the PR'
const head22 = (T: Transcript): Line[] => flat(T, T.turn(12, '11:02'), '', T.prompt(P22))
const now22 = (step: number, say: string, kind: string, subj: string, el: string): NowHead => ({ meta: `turn 12 · step ${step}`, say, kind, subj, el })
dock('f22-a', {
  R: 26,
  left: head22,
  live: T => [liveDock(T, '20s')],
  M: {
    now: now22(3, 'Writing the plan down as a to-do list.', 'todo', '0 of 7', '1s'),
    steps: [
      S('4s', 'read', 'docs/plans/register-split.md', '64 lines'),
      S('12s', 'read', 'hooks/register.tsx', '884 lines'),
      S('20s', 'todo', '7 items', 'running', 'run')
    ],
    todos: todos(0, 0)
  }
})
mock(
  'f22-b',
  72,
  fitPane(72, 20, {
    now: now22(41, 'Hook tests next, one module per commit.', 'edit', 'hooks/ledger.test.tsx', '2s'),
    steps: long(40),
    todos: todos(1, 1),
    files: filesBig.slice(0, 3)
  })
)
dock('f22-c', {
  R: 26,
  bottom: IDLE,
  left: T =>
    flat(
      T,
      head22(T),
      '',
      T.p('The split is done and PR #7 is open with the full gate green.', { lead: true }),
      '',
      T.receipt('done · turn 12', '312 steps · 3 failures → fixed · 31 files · 7 of 7 to-dos', '51m 02s')
    ),
  M: { idle: idle(12, '11:53', 'done', '3 failures → fixed · ↗ PR #7', '51m 02s'), steps: long(312, { running: false }), todos: todos(7, -1), files: filesBig }
})

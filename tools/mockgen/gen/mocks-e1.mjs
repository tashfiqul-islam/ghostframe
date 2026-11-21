// Section C and E mocks, left half and bottom: 80 columns unless stated.
import { transcript, paneKit, at, mock, fit, cat, sp, m, lr, cellsOf, rule, setBg, status, chrome, HINT, spin } from './lib.mjs';
import { flat, P7, fail7, liveNow, liveNeed } from './data.mjs';

const T = transcript(79);
const t80 = (name, items, o = {}) => mock(name, 80, flat(T, ...items).map((l) => fit(l, 80)), o);
const T60 = transcript(59);
const band = (src) => fit(m(src), 80);

// ---- C grid
const T120 = transcript(120);
const pk = paneKit(72);
const join = (l, r) => [...fit(l, 126), ...cellsOf('│', 'h'), ...sp(1), ...r];
mock('c-ruler-dock', 200, [
  at(200, Array.from({ length: 20 }, (_, i) => [i * 10, String(i)])),
  fit(cellsOf('0123456789'.repeat(20), 'd'), 200),
  join(T120.turn(7, '10:26'), pk.sec('STEPS', '20 steps')),
  join(T120.p('Prose is capped at 88 cells, so it ends at column 89 on every docked width.')[0], pk.step({ time: '2m 31s', kind: 'test', subj: 'bun test', res: '191 pass', mark: 'pass' })),
  at(200, [[0, '^'], [2, '^'], [89, '^ 89'], [119, '^ 119'], [126, '^'], [128, '^ ^ spine 128 · content 130'], [176, 'result ends 191'], [199, '^']]),
  at(200, [[0, '| content 2'], [108, 'time edge'], [126, 'divider 126 (engine)'], [183, 'time edge 193…199']]),
  at(200, [[0, 'spine 0']]),
]);
mock('c-ruler-60', 60, [
  fit(cellsOf('0         1         2         3         4         5         ', 'd'), 60),
  fit(cellsOf('0123456789'.repeat(6), 'd'), 60),
  fit(T60.turn(7, '10:26'), 60),
  fit(T60.capsule('worked · 20 steps · 6 shell · 5 read · 2 test +7', '2m 36s'), 60),
  fit(cat('{d|^ ^}', sp(53), '{d|^}'), 60),
  fit(cat('{d|| content starts at 2}', sp(23), '{d|time edge 58}'), 60),
  fit('{d|spine 0}', 60),
]);

// ---- E.1 turn boundary and receipt
t80('e-turn', [
  T.turn(7, '10:26'), '', T.prompt(P7), '',
  T.p('CI was running Bun 1.4.1, whose bundled ICU splits a skin-tone modifier into its own grapheme. The tests and the code were right; the runner was old.', { lead: true }), '',
  T.receipt('done · turn 7', '20 steps · 1 failure → fixed · 3 files', '2m 44s'),
], { hero: true });

// ---- E.2 prompt
t80('e-prompt', [
  T.prompt('tests/ is getting bigger, should we folderize them properly?'), '',
  T.prompt("base tsconfig wasn't updated to be top tier as per the skills, I think you're missing a lot of points and directions from the skill itself"), '',
  T.prompt('review @hooks/register.tsx against @docs/adr/0007-ledger.md {bk|[ image 1 ]}'), '',
  T.prompt("error TS4111: Property 'turn' comes from an index signature, so it must be accessed with ['turn'].", { chips: false }),
  setBg(fit(cat('{a|▍}   {b|hooks/register.tsx:412:18}'), 79), 's'),
  setBg(fit(cat('{a|▍} {m|… 497 more lines · pasted · ctrl+o}'), 79), 's'),
], { hero: true });

// ---- E.3 capsule (fallback)
t80('e-capsule', [
  T.capsule('worked · 20 steps · 6 shell · 5 read · 2 test +7 · 1 failure → fixed', '2m 36s'),
  '',
  T.capsule('worked · 2 steps · 2 read', '3s'),
  T.capsule('worked · 1 step · 1 edit', '0.4s'),
  T.capsule('worked · 312 steps · 141 shell · 96 read · 41 edit +34 · 3 failures → fixed', '51m 02s'),
  T.capsule('worked · 9 steps · 4 read · 3 shell · 2 edit · {r|1 failure}', '48s'),
  T.capsule('worked · 7 agents · 214 steps · 6 done · {r|1 failed}', '13m 42s'),
  T.capsule('worked · 14 steps · 9 read · 5 search · {w|1 blocked}', '1m 10s'),
  T.capsule('thought', '48s'),
], { hero: true });
const T50 = transcript(49);
mock('e-capsule-60', 60, [
  T60.capsule('worked · 20 steps · 6 shell · 5 read · 2 test +7 · 1 failure → fixed', '2m 36s'),
  T60.capsule('worked · 312 steps · 141 shell · 96 read · 41 edit +34 · 3 failures → fixed', '51m 02s'),
  T50.capsule('worked · 20 steps · 6 shell · 5 read · 2 test +7 · 1 failure → fixed', '2m 36s'),
  T50.capsule('worked · 9 steps · 4 read · 3 shell · 2 edit · {r|1 failure}', '48s'),
].map((l) => fit(l, 60)));

// ---- E.4 the unfolded view (ctrl+o)
const stepX = (kind, subj, res, time, resFg = 'm') => lr(cat('{H|│}   ', cellsOf(kind.padEnd(8), 'm'), ' ', m(subj)), cat(m(res, resFg), sp(3), cellsOf(time.padStart(6), 'd')), 79);
t80('e-unfold', [
  lr(cat('{H|│} ', m('Lint is clean. Running zizmor with the auditor persona (as CI does)', 'm')), '{d|1m 12s}', 79),
  fit(cat('{H|│} ', m('and the format check, then opening the PR.', 'm')), 79),
  stepX('shell', 'zizmor --persona auditor .github/workflows', 'clean', '4.1s'),
  stepX('shell', 'oxfmt --check .', '3 files differ', '0.9s', 'r'),
  stepX('shell', 'git commit -m "ci: precise workflow names"', 'a1f3c2e', '0.3s'),
  stepX('shell', 'gh pr create --fill', 'PR #5', '2.2s'),
  lr(cat('{H|│}   {d|∴ thought} ', m('The format check failed and I committed anyway.', 'm')), '{d|6s}', 79),
], { hero: true });

// ---- E.5 exception and event rows
t80('e-exc', [
  T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s'),
  T.exc('↗', 't', '', 'PR #6 opened · ci: pin Bun to mise.toml', '14s', ['{l|https://github.com/tashfiqul-islam/ghostframe/pull/6}']),
  T.you('denied · shell rm -rf dist · "keep the build output"', '1m 02s'),
  T.exc('!', 'w', 'needs you', 'rate limited · resumes 14:05 · or /model to switch', '15m 02s'),
  '',
  T.exc('✕', 'r', 'still failing', 'test · bun test width · 2 of 14', '4m 12s', ['expect(width("e\\u0301")).toBe(1) · received 2', 'tests/width.test.tsx:41:27']),
  T.exc('⊘', 'w', 'still blocked', 'write tests/width.test.tsx · auto-mode classifier', '4m 30s'),
  T.receipt('{R|failed} {m|· turn 9}', '31 steps · 1 failure · 1 blocked', '4m 41s'),
], { hero: true });
t80('e-exc-fall', [
  fail7(T),
  T.exc('⊘', 'w', 'blocked', 'write tests/width.test.tsx · auto-mode classifier', '1m 30s'),
  T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '2m 40s'),
  T.capsule('worked · 23 steps · 7 shell · 6 read · 3 test +7 · 1 failure → fixed · {w|1 blocked}', '2m 44s'),
]);

// ---- E.7 answer
t80('e-answer', [
  T.p('Colocation works, so the tests can move next to the code they cover. The runner discovers `*.test.tsx` anywhere under `hooks/`, and `validate` ignores them.', { lead: true }), '',
  T.h('What moves'),
  T.list(['26 test files go from `tests/` to the folder of their module', 'shared fixtures stay in `tests/kit/`']),
  T.list(['`seedState()` and `fakeClock()` are imported by 19 files'], { inset: 4 }),
  T.list(['nothing changes for CI: the glob is already `**/*.test.tsx`']), '',
  T.h('Order'),
  T.list(['Move the 7 pure-helper tests first (no fixtures).', 'Move the hook tests, one module per commit.'], { ordered: true }), '',
  T.quote('Tests reach register only through the engine, so the split is safe.'),
], { hero: true });

// ---- E.8 code
t80('e-code', [
  T.code('ts', 'hooks/grid.ts · 6 lines', ['export function graphemes(text: string): string[] {', '  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });', '  return Array.from(seg.segment(text), (s) => s.segment);', '}', '', '// shortcut: no cache, add one if this shows up in a profile']), '',
  T.code('diff', 'hooks/register.tsx · +2 −1', [' const turn = state.turn;', '- const width = [...text].length;', '+ const width = graphemes(text)', '+   .reduce((n, g) => n + cellWidth(g), 0);'], { diff: true }), '',
  T.code('sh', '', ['bun test tests/width.test.tsx --bail']),
], { hero: true });

// ---- E.9 links and sources (answer side)
t80('e-sources', [
  T.p("One step keeps GitHub's name: the image pull is inserted by GitHub itself¹, and reusable workflows inherit the caller's `run-name`²."), '',
  T.sources('SOURCES', [['¹', 'docs.github.com', 'Workflow syntax for GitHub Actions', 'https://docs.github.com/en/actions/writing-workflows/workflow-syntax'], ['²', 'docs.github.com', 'Reusing workflows', 'https://docs.github.com/en/actions/sharing-automations/reusing-workflows']]),
]);

// ---- E.10 figure (quoted art: its glyphs are its own)
const fig = ['+------------------ [ NIGHT ] -------------------+', '|                                                |', '| ●  14:02  p95 crossed 800ms                    |', '| │                                              |', '| ●  14:11  rolled back the cache flag           |', '| │                                              |', '| ○  14:40  write the postmortem                 |', '|                                                |', '+------------------------------------------------+'];
t80('e-figure', [...fig.map((l) => fit(cat(sp(2), cellsOf(l, 'd')), 79)), fit(cat(sp(2), '{m|Figure 1 · the night of the incident}'), 79)]);

// ---- E.11 table
t80('e-table', [T.table(['Workflow', 'Before', 'After'], [['scorecard', 'Pull ghcr.io/ossf/scorecard…', 'Scorecard · analyze'], ['ci', 'build', 'CI · test · ubuntu'], ['ci', 'lint', 'CI · lint · oxlint'], ['pr', 'check', 'PR · lint title']], { fgs: ['t', 'm', 't'] })]);

// ---- E.13 subagents, fallback band
t80('e-agents-fall', [
  band(rule(75, { label: 'AGENTS', meta: '5 running · 2 done {d|[-]}' })),
  ...[['v', '◇', 'Audit register.tsx', 'read', 'hooks/register.tsx', '14 ·  1m 12s'], ['v', '◇', 'Audit helper modules', 'shell', 'node redos-probe.mjs', '22 ·  1m 12s'], ['v', '◇', 'Research toolchain', 'fetch', 'bun.sh/docs/install', ' 9 ·  1m 10s'], ['v', '◇', 'Research CI and supply chain', 'web', '"zizmor auditor persona"', '11 ·  1m 09s'], ['d', '◇', 'Audit tests', 'done', '', '31 ·  3m 58s']].map(([f, g, n, k, s, r]) => band(lr(cat(`{${f}|${g}} `, fit(cellsOf(n, f === 'd' ? 'm' : 'v'), 22), ' ', cellsOf(k.padEnd(7), f === 'd' ? 'd' : 'm'), ' ', m(s)), cat(cellsOf(r, 'd'), sp(5)), 75))),
  band(lr(cat('{r|✕} ', fit(cellsOf('Audit publish-readiness', 't'), 22), ' {R|failed}  {m|context limit}'), cat(cellsOf('48 ·  4m 02s', 'd'), sp(5)), 75)),
  '',
  T.exc('✕', 'r', 'failed', 'agent Audit publish-readiness · context limit', '13m 42s'),
  T.capsule('worked · 7 agents · 214 steps · 6 done · {r|1 failed}', '14m 50s'),
]);

// ---- E.14 to-do, fallback
t80('e-todo-fall', [
  band(cat('{a|▸} {b|[>] Split register.tsx into ledger and held store}', sp(18), '{m|5 of 7}')),
  '',
  T.receipt('done · turn 12', '{w|5 of 7 to-dos} · 9 files', '12m 05s'),
]);

// ---- E.15 permission
t80('e-perm', [
  T.frameTop('PERMISSION', 'shell'),
  fit(cat(sp(2), '{b|git push --force-with-lease origin fix/rendering-parsing}'), 79),
  fit(cat(sp(2), '{w|Rewrites 3 commits on the remote branch.} {m|Rebased on main at 2c4afb9.}'), 79), '',
  setBg(fit(cat(sp(2), '{a|▸} {b|1  allow once}'), 79), 'k', 4, 17),
  fit(cat(sp(4), '{t|2  always allow}  {m|Bash(git push --force-with-lease:*) in this repo}'), 79),
  fit(cat(sp(4), '{t|3  deny, and tell Claude what to do instead}'), 79),
  T.frameEnd(), '',
  T.you('always allow · Bash(bun test:*) · this repo', '2m 10s'),
  T.you('denied · shell rm -rf dist · "keep the build output"', '6m 31s'),
]);

// ---- E.16 question card
t80('e-ask', [
  T.frameTop('QUESTION', '1 of 1 · single choice'),
  fit(cat(sp(2), '{b|PR #1 (build: toolchain, strict types and ci) is green. How should it land?}'), 79), '',
  setBg(fit(cat(sp(2), '{a|▸} {b|1  Squash-merge each PR when green}'), 79), 'k', 4, 38),
  ...['2  Merge commits, keep the topic history', '3  Leave it open; I will merge it myself', '4  Other…'].map((o) => fit(cat(sp(4), m(o)), 79)),
  T.frameEnd(), '',
  T.you('How should it land? {d|→} {t|Squash-merge each PR when green}', '9m 02s'),
  T.you('Stage list {d|→} {t|security settings, merge settings}', '9m 20s'),
]);

// ---- E.17 plan
t80('e-plan', [
  T.frameTop('PLAN', '4 steps · touches 31 files'),
  fit(cat(sp(2), '{B|Split register.tsx into a ledger and a held store}'), 79), '',
  T.list(['Extract claim logic into `hooks/ledger.ts` behind `claim(key, turn)`.', 'Move the LRU into `hooks/held.ts`; test it at the interface.', 'Re-point 19 tests at the new modules, one commit per module.', 'Delete the dead exports the audit confirmed.'], { ordered: true }), '',
  T.p('Not in this plan: the grapheme width fix (PR #4).'),
  T.frameEnd(), '',
  T.you('approved the plan · accept edits on', '2m 05s'),
]);

// ---- E.18 mode
t80('e-mode', [HINT.default, HINT.accept, HINT.plan, HINT.auto, HINT.pane].map((h) => fit(cat(sp(2), m(h)), 79)));

// ---- E.19 interrupted
t80('e-interrupt', [
  T.you('interrupted · esc · shell bun run gate was cut after 22s', '4m 12s'), '',
  T.receipt('{w|interrupted} {m|· turn 11}', '31 steps · 2 files', '4m 12s'),
]);

// ---- E.20 queued and steer
t80('e-steer', [
  band(cat('{a|▍} {m|queued}  {t|also bump the plugin version to 0.4.0}', sp(4), '{m|sends when the turn ends}')), '',
  setBg(lr(cat('{a|▍} {b|remember to follow skills properly, do not go astray}'), '{m|steer · 5m 10s}', 79), 's'),
]);

// ---- E.21 errors
t80('e-errors', [
  T.exc('✕', 'r', 'failed', 'API error 500 · 10 retries over 2m 41s · nothing was lost', '14m 49s'),
  T.exc('!', 'w', 'needs you', 'rate limited · resumes 14:05 · or /model to switch', '15m 02s'),
  T.exc('!', 'w', 'needs you', '5-hour limit reached · resets 16:00 (in 1h 12m)', '15m 02s'),
  T.exc('!', 'w', 'needs you', 'weekly limit reached · resets Mon 09:00', '15m 02s'),
  T.exc('✕', 'r', 'failed', 'network · no route to api.anthropic.com', '15m 30s'),
  T.exc('✕', 'r', 'failed', 'shell timed out after 2m 00s · bun test --watch', '17m 31s'),
]);

// ---- E.22 context and compaction
t80('e-compact', [
  band(lr(liveNeed(70, 'context 92% · /compact now, or it compacts at 95%'), '{d|[-]}', 80)), '',
  T.notice('compacted · 182k → 24k tokens · summary kept · 38 turns folded', '23:58'), '',
  T.turn(31, '23:59', 'AFTER COMPACT'),
]);

// ---- E.23 resume
t80('e-resume', [
  T.notice('resumed · session of Wed 18 Nov · 30 turns · 61% context', '09:02'), '',
  fit(cat("{m|※ recap: You're modernizing and publishing the theme as ghostframe, and I'm}"), 79),
  fit(cat('{m|  fixing what review found on PR #4. (turn off recaps in /config)}'), 79), '',
  T.turn(31, 'Thu 19 Nov · 09:02', 'RESUMED'),
]);

// ---- E.24 slash commands
const kv = (k, v, rest) => fit(cat(sp(2), cellsOf(k.padEnd(13), 'm'), cellsOf(v.padEnd(10), 't'), m(rest, 'm')), 79);
t80('e-slash', [
  T.frameTop('/cost'), kv('session', '$54.26', '4h 41m · 31 turns'), kv('last turn', '$1.23', '51m 25s · 312 steps'), kv('input', '1.2M', 'tokens · 94% cached'), kv('output', '186k', 'tokens'), T.frameEnd(), '',
  T.notice('/steps 7 · turn 7 pinned in the pane · 20 steps · esc or /steps to release', '10:41'),
  T.notice('/cockpit off · pane closed · this session uses capsules', '10:42'),
  T.exc('✕', 'r', 'failed', '/steps 44 · no such turn · this session has 31', '10:42'),
]);

// ---- E.25 bash mode
t80('e-bash', [
  setBg(fit(cat('{a|▍} {a|!} {b|bun test tests/width.test.tsx --bail}'), 79), 's'),
  T.frameTop('shell', '{r|exit 1} · 1.4s'),
  ...['tests/width.test.tsx:', '(fail) width > counts a combining mark as zero cells [0.41ms]', ' 1 pass', ' 1 fail'].map((l, i) => setBg(fit(cat(sp(2), cellsOf(l, i === 1 || i === 3 ? 'r' : i === 2 ? 'g' : 't')), 79), 's', 2)),
  fit(cat(sp(2), '{m|… 188 more lines · ctrl+o}'), 79),
  T.frameEnd(),
]);

// ---- E.26 memory, E.27 hooks, E.28 notices, E.29 rewind
t80('e-memory', [T.notice('memory saved · decide-dont-ask.md · feedback · +15 lines', '3m 40s'), T.notice('memory updated · follow-skills-one-to-one.md · +3 −1', '9m 12s')]);
t80('e-hooks', [
  T.exc('⊘', 'w', 'still blocked', 'edit hooks/grid.ts · hook PreToolUse lint-staged', '2m 14s', ['oxlint: 2 errors · no-floating-promises (hooks/grid.ts:88, :102)']),
  T.notice('hook SessionStart · caveman · mode: caveman', '23:40'), '',
  fit('{m|● ghostframe: turn.start hook skipped: threw state.set: denied: ghostframe own…}', 79),
]);
t80('e-notices', [T.notice('mcp context7 disconnected · tools unavailable · /mcp to reconnect', '23:12'), T.notice('ghostframe reloaded · 13 hooks · pane kept', '23:41'), T.notice('update 2.1.329 installed · restart to apply', '23:41')]);
t80('e-rewind', [fit(lr(cat('{t|↺} ', m('rewound to turn 12 · 3 files restored · conversation kept', 't')), '{d|23:20}', 79), 79), '', T.turn(13, '23:21', 'AFTER REWIND')]);

// ---- E.30 git events
t80('e-git', [
  T.exc('↗', 't', '', 'pushed fix/naming · 2 commits · origin', '6m 12s'),
  T.exc('↗', 't', '', 'PR #5 opened · ci: precise workflow, job and step names', '6m 14s', ['{l|https://github.com/tashfiqul-islam/ghostframe/pull/5}']),
  T.exc('↗', 't', '', 'PR #5 merged · squash · main is a1f3c2e', '8m 09s'),
  T.exc('↗', 'w', '', '{w|pushed (forced)} fix/rendering-parsing · 3 commits rewritten · origin', '9m 40s'),
]);

// ---- E.31 files, fallback (/files)
const frow = (p, tag, a, d) => lr(cat(sp(2), cellsOf(p, 't')), cat(m(tag.padStart(5), 'm'), ' ', m(a.padStart(7), 'g'), ' ', m(d.padStart(5), 'r'), sp(6)), 79);
t80('e-files-fall', [T.frameTop('/files · TURN 12', '4 changed · {g|+212} {r|−38}'), frow('hooks/ledger.ts', 'new', '+141', ''), frow('hooks/held.ts', 'new', '+52', ''), frow('hooks/register.tsx', '', '+11', '−38'), frow('tests/kit/seed.ts', '', '+8', ''), T.frameEnd()]);

// ---- E.32 receipt
t80('e-receipt', [
  T.receipt('done · turn 7', '20 steps · 1 failure → fixed · 3 files', '2m 44s'),
  T.receipt('done · turn 12', '312 steps · 3 failures → fixed · 31 files · 7 of 7 to-dos', '51m 25s'),
  T.receipt('{R|failed} {m|· turn 9}', '9 steps · 1 failure', '48s'),
  T.receipt('{W|needs you} {m|· turn 10}', '6 steps · 1 blocked', '48s'),
  T.receipt('{w|interrupted} {m|· turn 11}', '31 steps · 2 files', '4m 12s'),
  T.receipt('{v|waiting · 2 agents} {m|· turn 13}', '12 steps', '1m 05s'),
  T.receipt('done · turn 14', '', '0.4s'),
  '',
  T.receipt('done · turn 7', '3 files', '2m 44s'),
], { hero: true });

// ---- E.33 live area
const TD = transcript(79);
t80('e-live-dock', [
  lr(cat(`{a|${spin(2)}} {m|working}`), '{m|12m 08s}', 79),
  band(cat('{a|▍} {m|queued}  {t|also bump the plugin version to 0.4.0}')),
  ...chrome(80, { noStatus: true }),
]);
t80('e-live-fall', [
  liveNow(80, 'test', 'bun test tests/width.test.tsx', 'step 47 · 8s · 12m 08s'),
  band(rule(75, { label: 'AGENTS', meta: '2 running {d|[-]}' })),
  band(lr(cat('{v|◇ Audit register.tsx}     {m|read}    hooks/register.tsx'), cat('{d|14 ·  1m 12s}', sp(5)), 75)),
  band(lr(cat('{v|◇ Research toolchain}     {m|fetch}   bun.sh/docs/install'), cat('{d| 9 ·  2m 03s}', sp(5)), 75)),
  band(cat('{a|▸} {b|[>] Split register.tsx into ledger and held store}', sp(18), '{m|5 of 7}')),
  band(cat('{a|▍} {m|queued}  {t|also bump the plugin version to 0.4.0}')),
  ...chrome(80, { noStatus: true }),
]);

// ---- E.34 prompt input
t80('e-input', [
  ...chrome(80, { noStatus: true, hint: HINT.default }), '',
  fit('{m|>} {b|/st}{a|█}', 80),
  setBg(fit(cat(sp(2), '{a|▸} {b|/steps}            {m|pin the steps of one turn in the pane · /steps 7 · /steps to release}'), 80), 'k', 2, 80),
  fit(cat(sp(4), '{t|/status}           {m|show version, model and account}'), 80), '',
  fit('{m|>} {b|review @hooks/reg}{a|█}', 80),
  setBg(fit(cat(sp(2), '{a|▸} {b|hooks/register.tsx}'), 80), 'k', 2, 80),
  fit(cat(sp(4), '{t|hooks/register.test.tsx}'), 80), '',
  fit(cat(sp(2), '{m|history search · "width" · 3 of 12 · ctrl+r for older · esc to leave}'), 80),
]);

// ---- E.35 status line
mock('e-status-200', 200, status(200), { hero: true });
mock('e-status-100', 100, status(100));
mock('e-status-60', 60, status(60));
mock('e-status-warn', 200, status(200, { mode: 'needs you', ctx: 92, five: 100, fiveLeft: 'resets 16:00', week: 81 }));

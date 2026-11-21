// Section E mocks, the pane: 40, 56 and 72 body columns.
import { paneKit, fitPane, mock, fit, cat, sp, lr, cellsOf, setBg, chrome, HINT, nth } from './lib'
import type { Line, Now, PaneModel, RuleOpts, Step } from './lib'
import { S, steps7, files7, sources7, M8 } from './data'
import { agents, todos, filesBig, sources8, long } from './data2'

const Mfull = {
  now: { meta: 'turn 12 · step 47', say: 'Moving the claim logic behind claim(key, turn).', kind: 'test', subj: 'bun test hooks/ledger', el: '8s' },
  steps: long(46),
  agents: agents('run').slice(0, 2),
  todos: todos(4, 4),
  files: filesBig.slice(0, 4),
  sources: sources8.slice(0, 2)
} satisfies PaneModel

// ---- E.36 the pane at three widths (same model, 30 body rows)
for (const P of [72, 56, 40]) mock(`e-pane-${P}`, P, fitPane(P, 30, Mfull), { hero: P === 72 })

// ---- E.37 collapse ladder at 56 columns
for (const R of [22, 16, 11, 7]) mock(`e-ladder-${R}`, 56, fitPane(56, R, Mfull))

// ---- E.38 NOW and LAST
const K = paneKit(72)
const nowOf = (meta: string, n: Now, o: RuleOpts = {}): Line[] => [K.sec('NOW', meta, o), ...K.now(n)]
mock(
  'e-now',
  72,
  [
    ...nowOf('turn 8 · step 2', { say: 'Opening the pull request.', kind: 'shell', subj: 'gh pr create --fill', el: '11s' }),
    K.blank(),
    ...nowOf('turn 8 · step 2', { say: 'Opening the pull request.', kind: 'thinking', subj: '', el: '48s' }),
    K.blank(),
    ...nowOf('turn 8', { say: 'Waiting for the first token.', kind: 'waiting', subj: '', el: '2s' }),
    K.blank(),
    ...nowOf('turn 8 · step 31', { say: 'Reading the three stores in parallel.', kind: 'read', subj: 'hooks/held.ts {m|+2}', el: '1s' }),
    K.blank(),
    ...nowOf('turn 8 · step 47', {
      say: 'The API is overloaded; nothing was lost.',
      kind: 'waiting',
      subj: 'API overloaded (529) · retry 3 of 10 in 8s',
      el: '41s'
    }),
    K.blank(),
    ...nowOf('turn 8 · 20 steps', { say: 'Writing the answer.', kind: 'writing', subj: 'the answer', el: '4s' }),
    K.blank(),
    ...nowOf('turn 8 · step 3', { needs: 'permission', kind: 'shell', subj: 'git push --force-with-lease origin fix/ci-bun-pin', el: '12s' }, { labelFg: 'W' }),
    K.blank(),
    ...nowOf('turn 8 · step 3', { needs: 'question · 1 of 1', kind: 'ask', subj: 'How should it land?', el: '1m 04s' }, { labelFg: 'W' })
  ],
  { hero: true }
)
mock('e-last', 72, [
  K.sec('LAST', 'turn 7 · 10:29'),
  ...K.last({ state: 'done', story: '1 failure → fixed · ± 7be09d2', time: '2m 44s' }),
  K.blank(),
  K.sec('LAST', 'turn 9 · 10:52'),
  ...K.last({ state: '{R|failed}', story: '1 failure · test bun test width', time: '48s', next: 'ask Claude to continue, or /steps 9 to read the log' }),
  K.blank(),
  K.sec('LAST', 'turn 13 · 11:20'),
  ...K.last({ state: '{v|waiting}', story: '2 agents still running', time: '1m 05s', next: 'their reports start turn 14' }),
  K.blank(),
  K.sec('LAST', 'turn 14 · 11:31'),
  ...K.last({ state: 'done', story: 'no steps', time: '0.4s' }),
  K.blank(),
  K.sec('LAST', 'no turn yet'),
  K.text('nothing has run in this session')
])

// ---- E.39 STEPS rows at three widths
const demo: readonly Step[] = [
  S('4s', 'read', 'ci log · job 4211', '212 lines'),
  S('41s', 'test', 'bun test width', '2 of 14 fail', 'fail'),
  S('1m 20s', 'web', '"Intl.Segmenter skin tone ICU"', '8 results'),
  S('1m 31s', 'fetch', 'unicode.org/reports/tr29', '200 · 88 kB'),
  S('1m 44s', 'edit', '.github/workflows/ci.yml', '+6 −2'),
  S('1m 50s', 'write', 'tests/width.test.tsx', 'classifier', 'block'),
  S('2m 31s', 'test', 'bun test', '191 pass', 'pass'),
  S('2m 36s', 'shell', 'git commit', '7be09d2', 'commit'),
  S('2m 40s', 'shell', 'git push -u origin fix/ci-bun-pin', '1 commit', 'out'),
  S('2m 44s', 'mcp', 'context7 · query-docs', 'timed out', 'fail'),
  { mark: 'think', kind: 'thought', subj: '', res: '', time: '48s' },
  S('3m 02s', 'shell', 'git push --force-with-lease', 'needs you', 'need'),
  S('3m 14s', 'shell', 'gh pr create --fill', 'running', 'run')
]
for (const P of [72, 56, 40]) {
  const k = paneKit(P)
  mock(`e-steps-${P}`, P, [k.sec('STEPS', '12 steps · {r|2 failed}'), ...demo.map(k.step)], { hero: P === 72 })
}

// ---- E.6 thinking in the pane
mock('e-think', 72, [
  ...nowOf('turn 12 · step 12', { say: 'Working out why the quantifier backtracks.', kind: 'thinking', subj: '', el: '48s' }),
  K.blank(),
  K.sec('STEPS', '12 steps'),
  K.step(S('1m 02s', 'read', 'hooks/md/heading.ts', '96 lines')),
  K.step({ mark: 'think', kind: 'thought', subj: '', res: '', time: '1m 50s' }),
  K.step(S('1m 58s', 'edit', 'hooks/md/heading.ts', '+2 −2'))
])

// ---- E.12 tool kinds: a browser run in the pane
mock('e-kinds', 72, [
  K.sec('STEPS', '5 steps · {r|1 failed}'),
  K.step(S('58s', 'browser', 'goto localhost:5173/login', '200 · 1280×720')),
  K.step(S('59s', 'browser', 'fill #email "dev@ghostframe.test"', 'filled')),
  K.step(S('1m 00s', 'browser', 'click "Sign in"', 'navigated')),
  K.step(S('1m 01s', 'browser', 'screenshot dashboard.png', 'saved · 212 kB')),
  K.step(S('1m 09s', 'browser', 'click "Export CSV"', 'no such element', 'fail'))
])

// ---- E.40 AGENTS
for (const P of [72, 40]) {
  const k = paneKit(P)
  mock(
    `e-agents-${P}`,
    P,
    [k.sec('AGENTS', '{r|1 failed} · 5 running · 1 done'), ...[...agents('run').slice(0, 5), nth(agents('done'), 4), nth(agents('done'), 5)].map(k.agent)],
    { hero: P === 72 }
  )
}

// ---- E.41 TODO
mock('e-todo', 72, [K.sec('TODO', '4 of 7'), ...todos(4, 4).map(K.todo), K.blank(), K.sec('TODO', '7 of 7'), K.text('all 7 done', 'm')])
mock(
  'e-todo-40',
  40,
  (() => {
    const k = paneKit(40)
    return [k.sec('TODO', '4 of 7'), ...todos(4, 4).slice(3, 7).map(k.todo)]
  })()
)

// ---- E.42 FILES and the diff view
mock('e-files', 72, [K.sec('FILES', '11 changed · {g|+418} {r|−388}'), ...filesBig.slice(0, 5).map(K.file), K.text('… 6 more files · +57 −150', 'd')])
const dl = (src: string, fg: string): Line => setBg(fit(cat(sp(2), cellsOf(src, fg)), 72), 's', 2)
/** the diff view of one file, R rows of a 72-cell pane */
export const diffView = (R: number): Line[] => {
  const rows = [
    lr(cat('{h|┄} {d|[} {b|DIFF · hooks/register.tsx} {d|]}'), '{g|+11} {r|−238} {m|· 4 hunks}', 72),
    K.text('{m|hunk 1 of 4 · lines 40 to 52}'),
    dl(' import { cellWidth } from "./grid";', 't'),
    dl('-import { LRU } from "./lru";', 'r'),
    dl('+import { claim, release } from "./ledger";', 'g'),
    dl('+import { held } from "./held";', 'g'),
    dl(' ', 't'),
    dl(' export const register: Register = (on) => {', 't'),
    dl('-  const ledger = new Map<string, Claim>();', 'r'),
    dl('-  const store = new LRU<string, Held>(256);', 'r'),
    dl('   on("turn.start", ($, e) => {', 't'),
    dl('-    ledger.clear();', 'r'),
    dl('+    release(e.turn - 1);', 'g'),
    K.text('{m|hunk 2 of 4 · lines 118 to 131}'),
    dl('-    if (ledger.has(key)) return ledger.get(key);', 'r'),
    dl('+    return claim(key, e.turn);', 'g'),
    K.blank(),
    fit(cat(sp(2), '{b|n} {m|next hunk}   {b|p} {m|previous}   {b|c} {m|copy patch}   {b|b} {m|back to FILES}'), 72)
  ]
  while (rows.length < R) rows.splice(rows.length - 2, 0, K.blank())
  return rows.slice(0, R)
}
mock('e-diff', 72, diffView(18))

// ---- E.43 SOURCES
for (const P of [72, 40]) {
  const k = paneKit(P)
  mock(`e-src-${P}`, P, [k.sec('SOURCES', '8 read · 5 cited'), ...sources8.map(k.source)])
}

// ---- E.44 full view (focused): beats and steps, scrolled by the engine
export const fullView = (P: number, steps: readonly Step[], says: Readonly<Record<number, string>>): Line[] => {
  const k = paneKit(P)
  const out: Line[] = []
  steps.forEach((s, i) => {
    const say = says[i]
    if (say) out.push(k.step({ say }))
    out.push(k.step(s))
  })
  return out
}
export const says7: Readonly<Record<number, string>> = {
  0: 'Reading the failing job and the test it ran.',
  4: 'Reproducing with the exact Bun version CI used.',
  6: 'It fails here too: 1.4.1 splits the skin-tone modifier.',
  8: 'Checking whether that is ICU or our width helper.',
  11: 'Pinning CI to the version in mise.toml.',
  16: 'Re-running the suite on the pinned version.',
  17: 'Green. Committing.'
}
export const keysFull: Line = fit(
  cat(sp(2), '{b|s} {m|fit}   {b|c} {m|copy row}   {b|enter} {m|open}   {b|p} {b|n} {m|turn}   {b|l} {m|live}   {b|esc} {m|prompt}'),
  72
)
mock(
  'e-full',
  72,
  [
    K.sec('STEPS · TURN 7 · ALL', '20 steps · {r|1 failed} · rows 1 to 17 of 27', { labelFg: 'b' }),
    ...fullView(72, steps7, says7).slice(0, 17),
    K.blank(),
    keysFull
  ],
  { hero: true }
)

// ---- E.44 step detail
mock('e-detail', 72, [
  lr(cat('{h|┄} {d|[} {b|STEP 6 · TURN 7} {d|]}'), '{R|2 of 14 fail} {d|·    41s}', 72),
  K.text('{m|test}     {b|bun test tests/width.test.tsx --bail}'),
  K.text('{m|ran}      {t|19.2s · exit 1 · 96 lines of output}'),
  K.blank(),
  ...[
    'tests/width.test.tsx:',
    '(fail) width > counts a skin-tone modifier with its base [0.38ms]',
    '  expect(width("👍🏽")).toBe(2) · received 4',
    '    at tests/width.test.tsx:41:27',
    '(fail) width > counts a ZWJ family as one cluster [0.41ms]',
    ' 12 pass',
    ' 2 fail'
  ].map((l, i) => setBg(fit(cat(sp(2), cellsOf(l, i === 1 || i === 4 || i === 6 ? 'r' : i === 5 ? 'g' : 't')), 72), 's', 2)),
  K.text('{d|… 89 more lines · ctrl+o shows all}'),
  K.blank(),
  fit(cat(sp(2), '{b|c} {m|copy output}   {b|r} {m|copy command}   {b|b} {m|back to STEPS}'), 72)
])

// ---- E.45 pinning
export const Mpin7 = { ...M8, pin: 7, steps: steps7, files: files7, sources: sources7, stepsMeta: '20 steps · {r|1 failed} · 2m 44s' } satisfies PaneModel
mock('e-pin', 72, fitPane(72, 30, Mpin7), { hero: true })

// ---- E.46 the inline inspector (pane seated above the prompt, 100 columns)
const K98 = paneKit(98)
mock('e-inline', 100, [
  ...[
    lr('{m|steps}', '{d|[×]}', 98),
    K98.sec('STEPS · TURN 7 · PINNED', '20 steps · {r|1 failed} · 2m 44s', { labelFg: 'b' }),
    K98.text('… 12 earlier · 4 read · 3 shell · 2 fetch +3', 'd'),
    K98.step(nth(steps7, 5)),
    ...steps7.slice(14).map(K98.step)
  ].map(l => fit(cat(sp(1), l), 100)),
  ...chrome(100, { hint: HINT.pane, noStatus: true })
])

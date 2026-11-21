// Shared content: one session of the ghostframe project, reused across scenarios.
import { cat, sp, fit, lr, m, cellsOf, transcript, screen, mock, dur, spin, HINT } from './lib.mjs';

/** flatten: '' is a blank row, a line is an array of cells, a block is an array of lines */
export function flat(T, ...items) {
  const out = [];
  for (const it of items) {
    if (it === '') out.push(T.blank());
    else if (Array.isArray(it) && it.length && Array.isArray(it[0])) out.push(...it);
    else if (Array.isArray(it) && it.length === 0) continue;
    else out.push(it);
  }
  return out;
}

export const S = (time, kind, subj, res = '', mark = '', extra = {}) => ({ time, kind, subj, res, mark, ...extra });

// ------------------------------------------------------------ turn 7: the CI width bug (20 steps)
export const steps7 = [
  S('4s', 'read', 'ci log · job 4211', '212 lines'),
  S('9s', 'read', 'tests/width.test.tsx', '96 lines'),
  S('12s', 'read', '.github/workflows/ci.yml', '61 lines'),
  S('15s', 'search', '"setup-bun" in .github', '2 matches'),
  S('22s', 'shell', 'docker run oven/bun:1.4.1', 'pulled'),
  S('41s', 'test', 'bun test width', '2 of 14 fail', 'fail'),
  S('50s', 'read', 'hooks/grid.ts', '140 lines'),
  S('1m 02s', 'shell', 'bun --version', '1.4.1'),
  S('1m 20s', 'web', '"Intl.Segmenter skin tone ICU"', '8 results'),
  S('1m 31s', 'fetch', 'unicode.org/reports/tr29', '200 · 88 kB'),
  S('1m 38s', 'fetch', 'bun.sh/blog/bun-v1.4.2', '200 · 41 kB'),
  S('1m 44s', 'edit', '.github/workflows/ci.yml', '+6 −2'),
  S('2m 02s', 'edit', 'mise.toml', '+1'),
  S('2m 10s', 'write', 'tests/kit/runtime.ts', '+18'),
  S('2m 14s', 'read', 'package.json', '48 lines'),
  S('2m 20s', 'shell', 'mise install', 'bun 1.4.3'),
  S('2m 31s', 'test', 'bun test', '191 pass', 'pass'),
  S('2m 33s', 'shell', 'oxfmt --check .', 'clean'),
  S('2m 34s', 'shell', 'git add -A', '3 files'),
  S('2m 36s', 'shell', 'git commit', '7be09d2', 'commit'),
];
export const files7 = [['.github/workflows/ci.yml', '', 6, 2], ['mise.toml', '', 1, 0], ['tests/kit/runtime.ts', 'new', 18, 0]];
export const sources7 = [['·', 'unicode.org', 'UAX #29: Text Segmentation'], ['·', 'bun.sh', 'Bun v1.4.2']];
export const P7 = 'the width tests fail on CI but pass locally, find out why and fix it';
export const answer7 = (T) => flat(T,
  T.p('CI was running Bun 1.4.1, whose bundled ICU splits a skin-tone modifier into its own grapheme. The tests and the code were right; the runner was old.', { lead: true }),
  '',
  T.list(['`ci.yml` installs Bun from `mise.toml`, the pin you use locally', '`runtime.ts` fails fast when Bun is older than the pin']),
  '',
  T.p('Committed as `7be09d2`, not pushed.'),
);
export const fail7 = (T) => T.exc('✕', 'r', 'failed', 'test · bun test width · 2 of 14', '41s', ['expect(width("👍🏽")).toBe(2) · received 4', 'tests/width.test.tsx:41:27']);
export const turn7 = (T, mode = 'dock') => flat(T,
  T.turn(7, '10:26'), '', T.prompt(P7), '',
  ...(mode === 'dock' ? [] : [fail7(T), T.capsule('worked · 20 steps · 6 shell · 5 read · 2 test +7 · 1 failure → fixed', '2m 36s'), '']),
  answer7(T), '',
  mode === 'dock' ? T.receipt('done · turn 7', '20 steps · 1 failure → fixed · 3 files', '2m 44s') : T.receipt('done · turn 7', '3 files', '2m 44s'),
);
export const idle7 = { meta: 'turn 7 · 10:29', state: 'done', story: '1 failure → fixed · ± 7be09d2', time: '2m 44s' };
export const M7idle = { idle: idle7, steps: steps7, files: files7, sources: sources7 };

// ------------------------------------------------------------ turn 8: push and open a PR (running)
export const P8 = 'push it and open a PR';
export const steps8 = [S('3s', 'shell', 'git push -u origin fix/ci-bun-pin', '1 commit', 'out'), S('14s', 'shell', 'gh pr create --fill', 'running', 'run')];
export const M8 = { now: { meta: 'turn 8 · step 2', say: 'Opening the pull request.', kind: 'shell', subj: 'gh pr create --fill', el: '11s' }, steps: steps8 };

// ------------------------------------------------------------ turn 6 (short, for scrollback)
export const turn6 = (T, mode = 'dock') => flat(T,
  T.turn(6, '10:19'), '', T.prompt('which bun does CI install?'), '',
  ...(mode === 'dock' ? [] : [T.capsule('worked · 2 steps · 2 read', '3s'), '']),
  T.p('Whatever `setup-bun` resolves as `latest` on the day the cache was built. The workflow has no pin, so CI and your machine can differ.', { lead: true }), '',
  mode === 'dock' ? T.receipt('done · turn 6', '2 steps', '6s') : T.receipt('done · turn 6', '', '6s'),
);

// ------------------------------------------------------------ live rows
/** docked: the left half says only that the turn is alive and for how long */
export const liveDock = (T, time, word = 'working', i = 2) => lr(cat(`{a|${spin(i)}} `, m(word, 'm')), m(time, 'm'), T.F);
/** fallback: the full now-row of v6 E.33, 5 cells short of the terminal edge */
export const liveNow = (C, kind, subj, right, i = 2) => fit(lr(cat(`{a|${spin(i)}} `, cellsOf(kind.padEnd(8), 'm'), ' ', m(subj, 't')), m(right, 'd'), C - 6), C);
export const liveNeed = (w, text) => fit(cat('{w|!} {W|needs you} {m|·} ', m(text)), w);

// ------------------------------------------------------------ screen helpers
/** docked screen at C columns with a pane of P body cells */
export function dock(name, { C = 200, R = 34, P = 72, left, M, lines, live, bottom = {}, hero = false, focus = false, top = false, title = '' }) {
  const leftW = C - P - 2;
  const F = Math.min(leftW - 1, 120);
  const T = transcript(F);
  const rows = screen({ C, R, F, left: left(T), pane: { P, M, lines: lines ? lines(P, R) : undefined, focus, title }, live: live ? live(T) : [], bottom, top });
  mock(name, C, rows, { hero });
}
/** fallback screen: no pane; the transcript carries capsules and exception rows */
export function fall(name, { C = 100, R = 30, left, live = [], bottom = {}, hero = false, top = false }) {
  const F = Math.min(C - 1, 120);
  const T = transcript(F);
  mock(name, C, screen({ C, R, F, left: left(T), live: typeof live === 'function' ? live(T) : live, bottom, top }), { hero });
}
export { HINT, dur, sp, cat, fit, lr, m, cellsOf };

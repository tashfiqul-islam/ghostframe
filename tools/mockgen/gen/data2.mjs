// More shared content: agents, to-dos, files, sources and the 312-step turn.
import { dur } from './lib.mjs';
import { S } from './data.mjs';

export const AG = [
  ['Audit register.tsx', 'read', 'hooks/register.tsx', 14],
  ['Audit helper modules', 'shell', 'node redos-probe.mjs', 22],
  ['Research toolchain', 'fetch', 'bun.sh/docs/install', 9],
  ['Research CI and supply chain', 'web', '"zizmor auditor persona"', 11],
  ['Audit tests', 'search', '"describe(" in tests', 31],
  ['Audit publish-readiness', 'read', 'package.json', 48],
  ['Audit docs and ADRs', 'read', 'docs/adr/0007-ledger.md', 17],
];
/** roster at a stage: 'launch' | 'run' | 'late' | 'done' */
export function agents(stage) {
  const t = { launch: '2s', run: '1m 12s', late: '3m 58s', done: '' }[stage];
  const rows = AG.map(([name, kind, subj, steps], i) => {
    if (stage === 'launch') return { name, kind: 'start', subj: 'reading its brief', steps: 0, time: t };
    if (stage === 'run') return { name, kind, subj, steps, time: t };
    const fin = ['4m 41s', '5m 02s', '4m 12s', '4m 55s', '3m 58s', '4m 02s', '3m 40s'][i];
    if (i === 5) return { name, state: 'failed', subj: 'context limit', steps: 48, time: fin };
    if (stage === 'late' && (i === 0 || i === 1 || i === 3)) return { name, kind, subj: ['hooks/ledger.ts', 'bun test hooks/md', '', '"oidc trusted publishing npm"'][i], steps: steps + 20, time: t };
    return { name, state: 'done', subj: ['4 findings', '2 findings · 1 ReDoS', 'bun 1.4.3 · mise', '6 findings', '3 findings', '', '2 stale ADRs'][i], steps: steps + [24, 31, 12, 27, 0, 0, 9][i], time: fin };
  });
  if (stage === 'run') rows.splice(3, 0, { name: 'Verify release dates', kind: 'fetch', subj: 'registry.npmjs.org', steps: 3, time: '18s', nested: true });
  return rows;
}

export const todos = (done, cur) => ['Move the 7 pure-helper tests next to their modules', 'Move hook tests, one module per commit', 'Keep shared fixtures in tests/kit', 'Update the CI glob and the validate ignore list', 'Split register.tsx into ledger and held store', 'Grapheme-aware width helper, test first', 'Full gate, PR, merge'].map((t, i) => [i < done ? 'x' : i === cur ? '>' : ' ', t]);
export const filesBig = [['hooks/ledger.ts', 'new', 141, 0], ['hooks/held.ts', 'new', 52, 0], ['hooks/register.tsx', '', 11, 238], ['hooks/ledger.test.tsx', 'new', 96, 0], ['hooks/held.test.tsx', 'new', 61, 0], ['tests/kit/seed.ts', '', 8, 0], ['tests/register.test.tsx', 'del', 0, 144], ['hooks/grid.ts', '', 12, 3], ['docs/adr/0008-held-store.md', 'new', 34, 0], ['.github/workflows/ci.yml', '', 2, 2], ['package.json', '', 1, 1]];
export const sources8 = [
  ['¹', 'docs.github.com', 'Workflow syntax for GitHub Actions', '200', 'https://docs.github.com/en/actions/writing-workflows/workflow-syntax'],
  ['²', 'docs.github.com', 'Reusing workflows', '200', 'https://docs.github.com/en/actions/sharing-automations/reusing-workflows'],
  ['³', 'docs.zizmor.sh', 'Audit rules · personas', '200', 'https://docs.zizmor.sh/audits/#personas'],
  ['⁴', 'docs.npmjs.com', 'Trusted publishing for npm packages', '200', 'https://docs.npmjs.com/trusted-publishers'],
  ['⁵', 'bun.sh', 'bun publish', '200', 'https://bun.sh/docs/cli/publish'],
  ['·', 'github.blog', 'Changelog: immutable releases', '200', ''],
  ['·', 'securitylab.github.com', 'Keeping your Actions secure', '200', ''],
  ['·', 'docs.sigstore.dev', 'Cosign · keyless signing', '404', ''],
];

const POOL = [
  ['shell', ['bun test hooks/ledger', 'bun run typecheck', 'git status --short', 'bun test hooks/held', 'oxlint hooks', 'git add -A', 'git commit', 'bun run gate', 'rg -n "claim(" hooks', 'oxfmt .'], ['191 pass', 'clean', '4 files', '38 pass', 'clean', '6 files', 'c41d9e0', 'clean', '14 matches', '3 files']],
  ['read', ['hooks/register.tsx', 'hooks/ledger.ts', 'hooks/held.ts', 'tests/kit/seed.ts', 'docs/adr/0007-ledger.md', 'hooks/grid.ts', 'tests/register.test.tsx', 'package.json'], ['884 lines', '141 lines', '52 lines', '64 lines', '88 lines', '140 lines', '412 lines', '48 lines']],
  ['edit', ['hooks/register.tsx', 'hooks/ledger.ts', 'hooks/held.ts', 'hooks/ledger.test.tsx', 'tests/kit/seed.ts'], ['+3 −41', '+12 −2', '+6 −1', '+18', '+4 −4']],
  ['search', ['"heldStore" in hooks', '"claim(" in tests', '**/*.test.tsx'], ['9 matches', '41 matches', '26 files']],
];
const WEIGHT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3];
const FAILS = { 58: ['test', 'bun test hooks/ledger', '3 of 41 fail'], 171: ['test', 'bun test hooks/held', '1 of 38 fail'], 240: ['shell', 'bun run typecheck', '2 errors'] };
const FIXES = { 64: ['test', 'bun test hooks/ledger', '41 pass'], 177: ['test', 'bun test hooks/held', '38 pass'], 246: ['shell', 'bun run typecheck', 'clean'] };
/** the first n steps of the long turn; step i ends at i × 9.8 s. A failure stays open until its fix. */
export function long(n, { running = true } = {}) {
  let seed = 7;
  const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const time = dur(i * 9.8);
    const [kind, subs, ress] = POOL[WEIGHT[rnd(WEIGHT.length)]];
    const j = rnd(subs.length);
    if (FAILS[i]) out.push(S(time, ...FAILS[i], 'fail', { open: n < i + 6 }));
    else if (FIXES[i]) out.push(S(time, ...FIXES[i], 'pass'));
    else out.push(S(time, kind, subs[j], ress[j], kind === 'shell' && subs[j] === 'git commit' ? 'commit' : ''));
  }
  if (running && n < 312) out.push(S(dur(n * 9.8 + 6), 'shell', 'bun test hooks/ledger', 'running', 'run'));
  return out;
}

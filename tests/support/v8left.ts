// The left of the Cockpit v8 screens, built from the data each screen shows: the screen tests compare these rows with
// the spec's section 12. Pure: no engine, so a script can print them too.
import { blockedRow, detailRow, failureRow, needsYouRow, noticeRow, sentenceRows, shippedRow } from '../../hooks/cockpit/v8/events'
import { branchRow, failureCard, liveRows, receiptRow, slashOutputRow, slashRow, stepLineRow, stepsAllRows, workedRow } from '../../hooks/cockpit/v8/left'
import type { StepLine, TurnCounts } from '../../hooks/cockpit/v8/left'
import { NO_SPINE, spineOnly } from '../../hooks/shared/look/spine'
import type { Part } from '../../hooks/shared/parts'
import { diffCard } from '../../hooks/shared/look/code'
import { answerRows, footnoteRows } from '../../hooks/transcript/v8/markdown'
import { messageCard, thoughtRow, turnHeader } from '../../hooks/transcript/v8/turn'

/** A wall clock on the screens' day. */
export const at = (h: number, m: number, s: number): number => new Date(2026, 10, 23, h, m, s).getTime()

/** The text column beside the pane and wide (6.1), and narrow with no pane. */
export const W = 86
export const NARROW = 78

/** A receipt's or a worked node's counts, the rest zero. */
export const counts = (c: Partial<TurnCounts>): TurnCounts => ({
  state: 'done',
  durationMs: 0,
  steps: 0,
  fixed: 0,
  open: 0,
  blocked: 0,
  files: 0,
  sources: 0,
  cited: 0,
  agents: 0,
  kinds: {},
  shipped: '',
  levels: [],
  ...c
})

/** Turn 7's receipt trace, as the screens draw it. */
export const TRACE_7 = [0, 2, 3, 4, 6, 4, 2, 3, 6, 5, 2, 0]

/** Turn 7's answer, as Claude wrote it (screens 01, 23, 28, 29, 33). */
export const ANSWER_7 = [
  'CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.',
  'The tests and the code were right; the runner was old.',
  '',
  '## What changed',
  '- .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally',
  '- hooks/runtime.ts fails fast when Bun is older than the pin',
  '',
  '```diff .github/workflows/ci.yml',
  '@@ -14,2 +14,2 @@',
  ' - uses: oven-sh/setup-bun@v2',
  '-  with: { bun-version: latest }',
  '+  with: { bun-version-file: mise.toml }',
  '```',
  '',
  '| Runner | Bun | Width tests |',
  '| --- | ---: | --- |',
  '| CI before | 1.4.1 | × 2 of 14 fail |',
  '| CI after | 1.4.4 | ✓ 14 pass |',
  '| Local | 1.4.4 | ✓ 14 pass |',
  '',
  'Note: The first CI run after this rebuilds the Bun cache, about a minute longer.'
].join('\n')

const turn7Head = (width: number): Part[][] => [
  turnHeader({ at: at(10, 14, 2), turnNo: 7, isLive: false }, width),
  ...messageCard('the width tests fail on CI but pass locally, find out why and fix it', 'typed', width),
  spineOnly()
]

/** Screen 01's left: turn 7, finished, docked. */
export function screen01(): Part[][] {
  return [
    ...turn7Head(W),
    thoughtRow(6_000),
    spineOnly(),
    ...answerRows(ANSWER_7, { width: W, hasLead: true }),
    spineOnly(),
    ...footnoteRows(
      [
        { n: 1, url: 'https://bun.sh/blog/bun-v1.4.2' },
        { n: 2, url: 'https://github.com/oven-sh/setup-bun' }
      ],
      W
    ),
    spineOnly(),
    receiptRow(counts({ durationMs: 164_000, steps: 23, fixed: 1, files: 3, sources: 2, cited: 2, shipped: 'a1f3c2e', levels: TRACE_7 }), W)
  ]
}

/** Screen 03's left from turn 8's header: the failed turn, its failure card and receipt. */
export function screen03(): Part[][] {
  return [
    turnHeader({ at: at(10, 31, 7), turnNo: 8, isLive: false }, W),
    ...messageCard('make the width tests run on Windows too', 'typed', W),
    spineOnly(),
    thoughtRow(4_000),
    spineOnly(),
    ...answerRows(
      'I couldn’t finish this. Two tests depend on a POSIX locale that Windows runners don’t set, so width("e\\u0301") still splits the accent there.',
      {
        width: W,
        hasLead: true
      }
    ),
    spineOnly(),
    ...failureCard(
      2,
      'windows-latest',
      [
        { where: 'tests/width.test.tsx:41', said: 'expected 1, received 2' },
        { where: 'tests/width.test.tsx:58', said: 'expected 1, received 2' }
      ],
      'set LANG=C.UTF-8 in ci.yml, or skip these two on Windows. Tell me which.',
      8,
      W
    ),
    spineOnly(),
    receiptRow(counts({ state: 'failed', durationMs: 192_000, steps: 12, open: 2, files: 1, levels: [0, 2, 4, 6, 5, 4, 6, 2, 0] }), W)
  ]
}

/** Screen 04's left from turn 9's header to its `NEEDS YOU` row; the engine's dialog follows. */
export function screen04(): Part[][] {
  return [
    turnHeader({ at: at(10, 40, 12), turnNo: 9, isLive: true }, W),
    ...messageCard('clean the build output and rebuild from scratch', 'typed', W),
    spineOnly(),
    thoughtRow(3_000),
    spineOnly(),
    ...answerRows('I’ll remove dist/ and rebuild. Removing it needs your permission.', { width: W, hasLead: true }),
    spineOnly(),
    needsYouRow(41_000, { kind: 'shell', subject: 'rm -rf dist' }, W)
  ]
}

/** Screen 13's left from turn 23's header: a memory notice, a blocked commit, a context warning. */
export function screen13(): Part[][] {
  return [
    turnHeader({ at: at(16, 20, 40), turnNo: 23, isLive: false }, W),
    ...messageCard('format everything and commit', 'typed', W),
    spineOnly(),
    noticeRow('notice', 'Memory saved · prefers squash merges', W, '16:20:44'),
    spineOnly(),
    blockedRow(12_000, 'by a hook · PreToolUse · guard-main.sh · commits to main are not allowed', W),
    detailRow('Claude switched to a branch instead.', W),
    shippedRow(15_000, 'committed', 'b72d0aa', 'style: format · on chore/format', W),
    spineOnly(),
    noticeRow('warning', 'Context 82% · compaction will run automatically at 95%', W),
    spineOnly(),
    receiptRow(counts({ durationMs: 18_000, steps: 5, files: 38, blocked: 1, shipped: 'b72d0aa', levels: [0, 2, 4, 2, 4, 0] }), W)
  ]
}

/** Screen 16's left from turn 18's header: no prose, the worked node, a commit, the receipt. */
export function screen16(): Part[][] {
  const trace = [0, 2, 4, 6, 4, 2, 0]

  return [
    turnHeader({ at: at(14, 31, 0), turnNo: 18, isLive: false }, W),
    ...messageCard('bump all dev dependencies and commit', 'typed', W),
    spineOnly(),
    // The `↗` row draws as its call returns; the node draws with the receipt, so below it (7.13).
    shippedRow(48_000, 'committed', '9f3e2b1', 'chore(deps): bump dev dependencies', W),
    workedRow(counts({ durationMs: 48_000, steps: 7, kinds: { shell: 6, edit: 1 }, levels: trace }), W),
    spineOnly(),
    receiptRow(counts({ durationMs: 48_000, steps: 7, files: 2, shipped: '9f3e2b1', levels: trace }), W)
  ]
}

/** Turn 7's steps as `/steps 7 all` and ctrl+o print them (screens 22, 30). */
export const STEPS_7: Record<string, StepLine> = {
  red: { kind: 'test', subject: 'bun test hooks/width', result: '2 of 14 fail', tone: 'err', ms: 3_000 },
  version: { kind: 'shell', subject: 'bun --version', result: '1.4.4', tone: 'dim', ms: 400 },
  agents: { kind: 'agent', subject: '3 launched', result: '2 done · 1 failed', tone: 'dim', ms: 70_000 },
  ci: { kind: 'edit', subject: '.github/workflows/ci.yml', result: '+1 −1', tone: 'dim', ms: 200 },
  runtime: { kind: 'edit', subject: 'hooks/runtime.ts', result: '+12', tone: 'dim', ms: 300 },
  green: { kind: 'test', subject: 'bun test hooks/width', result: '14 pass', tone: 'ok', ms: 3_000 },
  push: { kind: 'shell', subject: 'git push', result: 'a1f3c2e', tone: 'bright', ms: 2_000 }
}

const stepsOf = (...keys: string[]): StepLine[] => keys.flatMap(k => (STEPS_7[k] === undefined ? [] : [STEPS_7[k]]))

/** Screen 22's left from the first command: `/steps 7 all`, `/copy code 1`, `/copy code 9`, `/cockpit`. */
export function screen22(): Part[][] {
  return [
    ...stepsAllRows('16:31:02', 7, 23, stepsOf('red', 'version', 'agents', 'ci', 'runtime', 'green', 'push')),
    spineOnly(),
    slashRow('16:31:20', '/copy code 1'),
    slashOutputRow(true, 'Copied code block 1 · 3 lines · yaml'),
    spineOnly(),
    slashRow('16:31:34', '/copy code 9'),
    slashOutputRow(false, 'There is no code block 9 · the last answer has 1'),
    spineOnly(),
    slashRow('16:31:50', '/cockpit'),
    slashOutputRow(true, 'Pane docked at 72 columns')
  ]
}

/** Screen 30: ctrl+o, the full record of turn 7 at 200 columns. */
export function screen30(): Part[][] {
  const step = (k: string) => stepsOf(k).map(s => stepLineRow(s))

  return [
    ...turn7Head(W),
    ...sentenceRows('10:14:06', 'Reproducing the failure first.', W),
    ...step('red'),
    ...sentenceRows('10:14:21', 'CI and local disagree on Bun. Auditing tests, CI and dependencies in parallel.', W),
    ...step('version'),
    ...step('agents'),
    ...sentenceRows('10:15:33', 'Pinning Bun in CI to the version in mise.toml.', W),
    ...step('ci'),
    ...diffCard(['@@ -15,1 +15,1 @@', '-  with: { bun-version: latest }', '+  with: { bun-version-file: mise.toml }'], '.github/workflows/ci.yml', W),
    ...step('runtime'),
    ...step('green'),
    ...step('push'),
    spineOnly(),
    receiptRow(counts({ durationMs: 164_000, steps: 23, fixed: 1, files: 3, levels: TRACE_7 }), W)
  ]
}

/** Screen 31's left at 100 columns, no pane: turn 7 finished in fallback, turn 8 live with a failure. */
export function screen31(): { turn7: Part[][]; turn8: Part[][]; live: Part[][] } {
  return {
    turn7: [
      ...turn7Head(NARROW),
      workedRow(counts({ durationMs: 164_000, steps: 23, agents: 3, fixed: 1, levels: [0, 2, 3, 4, 6, 4, 2, 3, 6, 5] }), NARROW),
      spineOnly(),
      ...answerRows(
        [
          'CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme. The tests and the code were right; the runner was old.',
          '',
          '- .github/workflows/ci.yml installs Bun from mise.toml',
          '- hooks/runtime.ts fails fast when Bun is older than the pin'
        ].join('\n'),
        { width: NARROW, hasLead: true }
      ),
      spineOnly(),
      receiptRow(counts({ durationMs: 164_000, steps: 23, fixed: 1, files: 3, levels: TRACE_7 }), NARROW)
    ],
    turn8: [
      turnHeader({ at: at(10, 31, 7), turnNo: 8, isLive: false }, NARROW),
      ...messageCard('make the width tests run on Windows too', 'typed', NARROW),
      spineOnly(),
      failureRow('Width tests on Windows', '2 of 14 fail', 84_000, NARROW),
      detailRow('width("e\\u0301") · expected 1, received 2', NARROW),
      spineOnly()
    ],
    live: [
      ...liveRows({ elapsedMs: 111_000, frame: 9, sentence: 'Retrying with LANG set', agents: 0, steps: 9 }, NARROW),
      branchRow('shell', 'bun test hooks/width', 'running', false, NARROW),
      branchRow('todo', 'Writing up the options', '3 of 4', true, NARROW)
    ]
  }
}

/** A row with no spine and nothing on it: the gap the engine leaves between a turn and the live area. */
export const EMPTY: Part[] = [{ ...NO_SPINE, t: '' }]

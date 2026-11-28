// The scripted Cockpit session for the live demo, as data. Edit this file to change what plays.
// Source: docs/design/cockpit.md, screen 12.1 "Idle after a turn" and 12.23 "The Files tab".
// Playback: steps land in order, 40 ms apart, each easing in over 180 ms (motion.css). `at` is the step's
// position on the pane's time axis in cells from the axis start; `len` is its bar length in cells.

export type Glyph = '×' | '✓' | '◇' | '↗'
export interface Step {
  glyph: Glyph
  kind: 'fail' | 'ok' | 'agent' | 'push'
  title: string
  at: number
  len: number
  result: string
  detail?: string
}

export const session = {
  turn: 7,
  startedAt: '10:14:02',
  endedAt: '10:16:46',
  duration: '2m 44s',
  prompt: 'the width tests fail on CI but pass locally, find out why and fix it',
  thought: { duration: '6s', hint: 'ctrl+o expand' },
  answer: {
    lead: 'CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.',
    rest: 'The tests and the code were right; the runner was old.',
    heading: 'What changed',
    bullets: ['.github/workflows/ci.yml installs Bun from mise.toml', 'hooks/runtime.ts fails fast when Bun is older than the pin'],
    diff: {
      lang: 'YAML',
      folder: '.github/workflows/',
      file: 'ci.yml',
      added: 1,
      removed: 1,
      lines: [
        { old: 14, new: 14, text: '- uses: oven-sh/setup-bun@v2' },
        { old: 15, sign: '−', text: '  with: { bun-version: latest }' },
        { new: 15, sign: '+', text: '  with: { bun-version-file: mise.toml }' }
      ]
    },
    table: {
      head: ['Runner', 'Bun', 'Width tests'],
      rows: [
        ['CI before', '1.4.1', '× 2 of 14 fail'],
        ['CI after', '1.4.4', '✓ 14 pass']
      ]
    }
  },
  receipt: { state: 'DONE', counts: '23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e' },
  pane: {
    tabs: [
      { id: 'timeline', label: 'TIMELINE' },
      { id: 'files', label: 'FILES', count: '3' },
      { id: 'sources', label: 'SOURCES', count: '2' },
      { id: 'todo', label: 'TODO', count: '5/5' },
      { id: 'agents', label: 'AGENTS', count: '3' }
    ],
    head: { state: 'DONE', summary: 'Width tests fixed; CI now reads Bun from mise.toml', counts: ['23 steps', '1 fixed', '3 agents', '3 files'] },
    axis: ['10:14', '10:17'],
    steps: [
      { glyph: '×', kind: 'fail', title: 'Reproducing the failure', at: 0, len: 3, result: '2 of 14', detail: 'width("e\\u0301") · expected 1, received 2' },
      { glyph: '✓', kind: 'ok', title: 'Comparing Bun versions', at: 2, len: 2, result: '1.4.1 · 1.4.4' },
      { glyph: '◇', kind: 'agent', title: 'Audit tests', at: 4, len: 6, result: 'clean' },
      { glyph: '◇', kind: 'agent', title: 'Audit CI setup', at: 4, len: 6, result: 'no pin' },
      { glyph: '◇', kind: 'agent', title: 'Audit dependencies', at: 4, len: 5, result: '1 high' },
      { glyph: '✓', kind: 'ok', title: 'Pinning Bun in ci.yml', at: 10, len: 4, result: '+1 −1' },
      { glyph: '✓', kind: 'ok', title: 'Failing fast on old Bun', at: 13, len: 4, result: '+12' },
      { glyph: '✓', kind: 'ok', title: 'Running the width tests', at: 16, len: 3, result: '14 pass' },
      { glyph: '↗', kind: 'push', title: 'Pushing the fix', at: 18, len: 2, result: 'a1f3c2e' }
    ] as Step[],
    files: {
      total: '3 files changed',
      added: 14,
      removed: 1,
      note: 'turn 7 · against the start of the turn',
      rows: [
        { folder: '.github/workflows/', file: 'ci.yml', added: 1, removed: 1 },
        { folder: 'hooks/', file: 'runtime.ts', added: 12 },
        { folder: 'tests/', file: 'width.test.tsx', added: 1, byAgent: true }
      ]
    }
  },
  statusLine: { context: 47, fiveHour: 36, week: 8 } // ticks up from the hero's 41 / 34 / 8 while the turn plays
  // Sources, Todo and Agents tabs: build from docs/design/cockpit.md screens 12.24, 12.25 and 12.26. Their counts above are fixed by this turn.
}

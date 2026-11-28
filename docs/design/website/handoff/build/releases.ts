// Release notes as data, for /releases. This file is a snapshot of main at df9ab55 (28 Nov 2026), written from the repository.
// In the build it is generated, not hand-edited: site/tools/read-releases.ts (HANDOFF.md, section 16) rebuilds it from
// CHANGELOG.md and docs/development/releases/<version>.md, or from `git log` while a version is not tagged yet.

export type Section = 'Features' | 'Fixes' | 'Performance' | 'Docs' | 'Internal'
export interface Change {
  scope: string
  text: string
  pr: number | null
  commit: string
  date: string
}
export interface Group {
  name: Section
  open: boolean
  changes: Change[]
}
export interface Highlight {
  title: string
  text: string
  visual: 'conversation' | 'timeline' | 'files' | 'status-line'
}
export interface Also {
  tag: 'default' | 'engine' | 'install' | 'security'
  title: string
  text: string
}
export interface Release {
  version: string
  /** ISO date of the tag, or null while the version is on main and not tagged yet. */
  date: string | null
  label: string
  title: string
  summary: string
  compare: { from: string; to: string }
  commits: number
  highlights: Highlight[]
  also: Also[]
  groups: Group[]
  requirements: string[]
  limits: string[]
  install: string[]
}

export const page = {
  label: 'releases · {n} version',
  h1: ['Every change,', 'on the record.'],
  lede: 'What shipped in each version of ghostframe, newest first. The notes are written from the commits on main.',
  links: [
    { icon: 'feed', label: 'Atom feed' },
    { icon: 'repo', label: 'Releases on GitHub' }
  ],
  states: { untagged: 'on main · not tagged yet', latest: 'latest' },
  filters: ['All', 'Features', 'Fixes', 'Docs', 'Internal'],
  filterHint: 'press f to filter',
  road: {
    title: 'The road to 1.0.0',
    text: 'Commits per day on main, 18 to 28 November 2026. Gold is the release week.',
    total: 36,
    days: [
      { day: 18, commits: 5 },
      { day: 19, commits: 0 },
      { day: 20, commits: 0 },
      { day: 21, commits: 6 },
      { day: 22, commits: 9 },
      { day: 23, commits: 2 },
      { day: 24, commits: 0 },
      { day: 25, commits: 2 },
      { day: 26, commits: 0 },
      { day: 27, commits: 9 },
      { day: 28, commits: 3 }
    ]
  },
  origin: { date: '18 Nov 2026', subject: 'chore: import ghostframe theme', commit: '22234d3' }
}

export const releases: Release[] = [
  {
    version: '1.0.0',
    date: null,
    label: 'first release',
    title: 'ghostframe 1.0.0',
    summary:
      'A Claude Code plugin with two parts. Cockpit is a redesigned chat UI: the conversation on the left, and the work of each turn on the right, in a pane with its timeline, files, sources, to-do and agents. The status line shows the model, the repository, your context and your 5-hour and weekly budgets in two rows, with a ghost whose eyes show the pressure.',
    compare: { from: '128622c', to: 'df9ab55' },
    commits: 34,
    highlights: [
      {
        title: 'The conversation on the left, the work on the right',
        text: 'Each turn opens with a header and your message, and ends with a receipt: how long it took, what it did, whether it passed.',
        visual: 'conversation'
      },
      { title: 'A live timeline', text: 'While Claude works, the pane shows every step on a time track, failures and fixes included.', visual: 'timeline' },
      { title: 'Every file the turn changed', text: 'With its counts, and its diff one key away.', visual: 'files' },
      {
        title: 'The status line',
        text: 'Installed with one command: model and effort, repository and branch, context, and the 5-hour and weekly budgets with their pace and reset times.',
        visual: 'status-line'
      }
    ],
    also: [
      {
        tag: 'default',
        title: 'Cockpit is on by default',
        text: 'It starts as soon as the plugin loads. Turn it off with Cockpit pane in /config, or for one session with GHOSTFRAME_COCKPIT=0.'
      },
      {
        tag: 'engine',
        title: 'It stays out of the way on untested versions',
        text: 'ghostframe declares the Claude Code versions it is tested with, >=2.1.329 <2.2.0. On any other version it goes dormant, hands every row back, and says so once.'
      },
      {
        tag: 'install',
        title: 'Install from the marketplace',
        text: 'The repository is its own plugin marketplace. Two commands install ghostframe, and Claude Code offers each new version as an update.'
      },
      {
        tag: 'security',
        title: 'Two security fixes in the status line',
        text: 'It now strips every control character from outside text, such as a folder or branch name. Its caches moved from the shared temp folder to your own cache folder, readable only by you.'
      }
    ],
    groups: [
      {
        name: 'Features',
        open: true,
        changes: [
          { scope: 'statusline', text: 'The ghostframe status line', pr: null, commit: '6def5fb', date: '2026-11-27' },
          { scope: 'cockpit', text: 'Cockpit v8, the redesigned chat UI', pr: null, commit: '6a07220', date: '2026-11-25' },
          { scope: 'hooks', text: "Cockpit phase 11, agents' work in the pane, open agents and sources", pr: 22, commit: 'd27d407', date: '2026-11-23' },
          { scope: 'hooks', text: 'Cockpit turn rule, one turn number everywhere', pr: 21, commit: 'd44eeb4', date: '2026-11-23' },
          { scope: 'hooks', text: 'Cockpit phase 10, ctrl+o, resizing, fullscreen switching and /copy', pr: 20, commit: '15614e5', date: '2026-11-22' },
          {
            scope: 'hooks',
            text: 'Cockpit phase 9, fallback: capsules, failure rows, the live area, the inspector',
            pr: 19,
            commit: 'ae0b11b',
            date: '2026-11-22'
          },
          { scope: 'hooks', text: 'Cockpit phase 8, history: every turn kept, past turns pinned', pr: 18, commit: 'dd9b7e8', date: '2026-11-22' },
          { scope: 'hooks', text: 'Cockpit phase 7, keys and views in the focused pane', pr: 17, commit: '5993146', date: '2026-11-22' },
          { scope: 'hooks', text: 'Cockpit phase 6, the to-do, files and sources sections', pr: 16, commit: '64573e9', date: '2026-11-22' },
          { scope: 'hooks', text: "Cockpit phase 5, the agents roster and the quiet left's agent rows", pr: 15, commit: '468ad05', date: '2026-11-22' },
          { scope: 'hooks', text: 'Keep the transcript quiet while the cockpit pane is docked', pr: 11, commit: '6cf8769', date: '2026-11-21' },
          { scope: 'hooks', text: 'Add the cockpit head and the one-row live area', pr: 10, commit: '0395327', date: '2026-11-21' },
          { scope: 'hooks', text: "Draw the turn's step log in the cockpit pane", pr: 8, commit: 'a4023b2', date: '2026-11-21' },
          { scope: 'hooks', text: 'Seat the cockpit pane with the width rule', pr: 7, commit: '8e8cfe4', date: '2026-11-21' }
        ]
      },
      {
        name: 'Fixes',
        open: true,
        changes: [
          {
            scope: 'cockpit',
            text: "Keep file reads in the project, find Git's root through links, and budget large diffs",
            pr: 37,
            commit: 'df9ab55',
            date: '2026-11-28'
          },
          {
            scope: 'statusline',
            text: 'Strip hostile names, shrink long names, and quote the command for the shell',
            pr: 36,
            commit: '05159fa',
            date: '2026-11-28'
          },
          { scope: 'hooks', text: 'Draw finished replies whole and break words wider than the row', pr: 35, commit: '3f5c9db', date: '2026-11-28' },
          {
            scope: 'hooks',
            text: 'Measure emoji at their real width and check the engine once for every first draw',
            pr: 34,
            commit: 'ef8a16f',
            date: '2026-11-27'
          },
          { scope: 'hooks', text: 'Keep the unfinished cockpit pane off by default', pr: 9, commit: '63d7610', date: '2026-11-21' },
          { scope: 'hooks', text: 'Rendering, parsing and session-state bugs', pr: 4, commit: '866f89f', date: '2026-11-18' }
        ]
      },
      {
        name: 'Docs',
        open: true,
        changes: [{ scope: 'repo', text: 'Add the cockpit v7 spec, amendments and feasibility report', pr: 6, commit: '77e1628', date: '2026-11-21' }]
      },
      {
        name: 'Internal',
        open: false,
        changes: [
          { scope: 'cockpit', text: "Read GHOSTFRAME_COCKPIT's words without the engine", pr: 33, commit: 'b4f1232', date: '2026-11-27' },
          { scope: 'tests', text: 'Check figure and table drawing without the engine', pr: 32, commit: '392ab1c', date: '2026-11-27' },
          { scope: 'tests', text: 'Pin six transcript tests to Cockpit off', pr: 31, commit: '4bdb79c', date: '2026-11-27' },
          { scope: 'tests', text: 'Give two heavy Cockpit tests the 15 s limit', pr: 30, commit: 'e53963e', date: '2026-11-27' },
          { scope: 'tests', text: 'Mirror the hooks layout in tests/ and document both', pr: 14, commit: '7f601e5', date: '2026-11-22' },
          { scope: 'hooks', text: 'Split the source into shared, cockpit and transcript', pr: 13, commit: 'b83e478', date: '2026-11-22' },
          { scope: 'tooling', text: 'Make the repo TypeScript-only, checked by tsrs', pr: 12, commit: '401d505', date: '2026-11-22' },
          { scope: 'tooling', text: 'Raise toolchain and ci to the house bar', pr: 3, commit: '2c4afb9', date: '2026-11-18' }
        ]
      }
    ],
    requirements: [
      'Claude Code 2.1.329 up to, not including, 2.2.0, in a terminal. Outside that range ghostframe stays dormant.',
      'Windows is tested live. Linux in CI and WSL. macOS in CI only.',
      "A Nerd Font for the status line's icons (optional), and Bun for the status line."
    ],
    limits: [
      "The Files tab keeps the counts tallied from the turn's steps. Only the selected file is diffed.",
      'Files outside the project are listed but never diffed.',
      "Cockpit draws in the terminal only, not in Claude Code's Desktop app or VS Code panel."
    ],
    install: ['/plugin marketplace add tashfiqul-islam/ghostframe', '/plugin install ghostframe@ghostframe', '/ghostframe-statusline install']
  }
]

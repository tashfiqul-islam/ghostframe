// ghostframe website content. Every string on the site lives here; markup holds none.
// Facts were checked against github.com/tashfiqul-islam/ghostframe at commit df9ab55 (28 Nov 2026); each carries its source.
// FROM_REPO marks the values the build reads from the plugin repo (HANDOFF.md, section 13). In `astro dev` an unresolved
// FROM_REPO renders <Redacted note="to confirm" />. In `astro build` it throws. Never ship a guess.

export const FROM_REPO = Symbol('FROM_REPO')
type Fact = string | typeof FROM_REPO

export const site = {
  name: 'ghostframe',
  tagline: 'The cockpit for Claude Code.',
  version: FROM_REPO as Fact, // .claude-plugin/plugin.json "version" (1.0.0 at df9ab55)
  repo: 'https://github.com/tashfiqul-islam/ghostframe',
  docs: 'https://github.com/tashfiqul-islam/ghostframe/tree/main/docs',
  releases: '/releases', // the release notes page
  releasesOnHost: 'https://github.com/tashfiqul-islam/ghostframe/releases',
  feed: 'https://github.com/tashfiqul-islam/ghostframe/releases.atom',
  licence: 'MIT', // LICENSE: MIT, Copyright (c) 2026-present Tashfiqul Islam
  disclaimer: 'Not affiliated with Anthropic.',
  origin: FROM_REPO as Fact // env SITE_URL at build (brand/head.html still says YOUR-DOMAIN); used for canonical and Open Graph URLs
}

// The nav: four numbered links in one track, then the version chip (to /releases), Docs and Source as icon buttons, and Install.
export const nav = {
  links: [
    { n: '01', label: 'Cockpit', href: '/#cockpit' },
    { n: '02', label: 'Status line', href: '/#status-line' },
    { n: '03', label: 'Install', href: '/#install' },
    { n: '04', label: 'Releases', href: '/releases' }
  ],
  icons: [
    { icon: 'docs', label: 'Docs', href: site.docs },
    { icon: 'repo', label: 'Source on GitHub', href: site.repo } // the host's official mark in the build
  ],
  install: { label: 'Install', href: '/#install' },
  versionLabel: 'Version {version}, release notes',
  menu: { open: 'Open the menu', close: 'Close the menu', title: 'menu · 4 sections', hint: 'esc closes · focus stays inside' }
}

export const hero = {
  h1: ['The cockpit', 'for Claude Code.'],
  lede: 'A redesigned chat UI and a live status line, in one plugin. It runs inside your own session.',
  primary: { label: 'Install', href: '#install' },
  secondary: { label: 'View source', icon: 'repo', href: site.repo },
  command: '/ghostframe-statusline install',
  rail: {
    model: 'Opus 5.5',
    effort: 2,
    effortWord: 'medium',
    repo: 'ghostframe',
    branch: 'main',
    dirty: true,
    added: '+9.3k',
    removed: '−524',
    cache: 'cache 52m',
    context: 41,
    fiveHour: 34,
    week: 8,
    fiveHourReset: '2h 10m',
    weekReset: 'Mon',
    fiveHourPace: 46,
    weekPace: 22,
    note: 'the frame docks here when you scroll · sample session'
  }
}

export const sections = {
  anatomy: {
    label: 'anatomy · 5 parts',
    h2: ['A ghost', 'in the frame.'],
    lede: 'A plugin that changes how Claude Code looks and feels in your terminal. Two parts, one window.',
    parts: [
      { key: 'A', name: 'timeline', text: 'every step, in order, with its timing' },
      { key: 'B', name: 'conversation', text: 'your messages and the answers, nothing else' },
      { key: 'C', name: 'pane', text: 'timeline, files, sources, todo, agents' },
      { key: 'D', name: 'status line', text: 'context, 5-hour and week, in two rows' },
      { key: 'E', name: 'ghost', text: 'six cells; its eyes show the pressure' }
    ],
    schematic: { cols: 144, rows: 40, gutterCols: 13, paneCols: 72, statusRows: 2, ghostCols: 6, pxPerCol: 5, pxPerRow: 9 }
  },
  demo: {
    label: 'live session · scripted',
    h2: ['Watch one turn.'],
    lede: 'A scripted session on the real cell grid. The tabs respond.',
    controls: ['Pause', 'Replay', 'Read as text']
  },
  cockpit: {
    label: 'cockpit · 5 parts',
    h2: ['Cockpit, piece by piece.'],
    features: [
      { name: 'The turn timeline', keys: ['turn header: clock time, number', 'thinking, collapsed', 'receipt'] },
      { name: 'The docked pane', keys: ['five tabs; this one is Files', 'totals for the turn', 'changed by an agent'] },
      { name: 'Receipts and failure cards', keys: ['receipt, done', 'receipt, failed', 'what is still failing, and where', "next step, in Claude's words"] },
      { name: 'Rewind', keys: ['the turn you land on is labelled'] },
      { name: 'Fallback', keys: ['the whole turn as one node', 'failure row', 'live step, with its tree'] }
    ]
  },
  status: {
    label: 'status line · 2 rows',
    h2: ['Three budgets.', 'One glance.'],
    lede: 'Drag the handle. Tile, ghost and mascot change at the same two thresholds.',
    sliderLabel: 'context usage · set by the handle',
    initial: 72,
    thresholds: [
      { range: 'under 60', text: 'calm. Teal meter, green eyes.', max: 59 },
      { range: '60 to 84', text: 'busy. Amber meter and tile.', max: 84 },
      { range: 'from 85', text: 'hot. The tile says what happens next.', max: 100 }
    ],
    tileNote: 'edge and surface = status · white block = even pace',
    pressure: { context: 88, fiveHour: 91, week: 76, pr: 'PR #23', prState: 'changes requested', notes: ['at 95%', 'ahead', ''], resets: ['', '37m', 'Mon'] }
  },
  ghost: {
    label: 'mascot to ghost · 3 stages',
    h2: ['The terminal can only draw text.', 'So the ghost becomes text.'],
    stages: [
      { name: 'vector', size: 'viewBox 1000 × 1241' },
      { name: 'text', size: '140 × 87 cells' },
      { name: 'ghost', size: '6 × 2 cells · 6 × 4 pixels' }
    ],
    arrows: ['quantise', 'reduce']
  },
  install: {
    label: 'install · 3 steps',
    h2: ['Install.'],
    steps: [
      { title: 'Add the plugin', commands: ['/plugin marketplace add tashfiqul-islam/ghostframe', '/plugin install ghostframe@ghostframe'] }, // README.md, "02 Install"
      { title: 'Install the status line', commands: ['/ghostframe-statusline install'], chain: ['shows the diff', 'asks first', 'backs up', 'writes one key'] },
      {
        title: 'Set the line height to 1.5',
        tabs: [
          // docs/design/statusline.md, "Terminal setup"
          { id: 'windows-terminal', label: 'Windows Terminal', lines: ['Settings › your profile › Appearance › Line height 1.5', 'stored as font.cellHeight'] },
          { id: 'vs-code', label: 'VS Code', lines: ['Settings › terminal.integrated.lineHeight', 'set it to 1.5'] },
          { id: 'other', label: 'Other', lines: ["Set the terminal's line height, or cell height, to 1.5.", 'Drawn and checked in GeistMono Nerd Font 11.5.'] }
        ]
      }
    ],
    needs: [
      { key: 'Claude Code', value: '2.1.329 up to 2.2.0 · dormant outside it' }, // plugin.json engines: ">=2.1.329 <2.2.0"; README requirements
      { key: 'Bun', value: 'on your PATH · status line only' },
      { key: 'Font', value: 'a Nerd Font for icons · or GF_ICONS=0' },
      { key: 'Colour', value: '24-bit · falls back to 256 · honours NO_COLOR' }
    ],
    width: [
      { range: 'under 90', text: 'one plain line', flex: 90, on: false },
      { range: '90 to 139', text: 'narrow', flex: 50, on: true },
      { range: '140 and up', text: 'the full line', flex: 70, on: true }
    ],
    undo: { command: '/ghostframe-statusline uninstall', note: 'restores the entry you had before' },
    after: 'after the copy, the meters draw in segment by segment'
  },
  compat: {
    label: 'compatibility · 7 environments',
    h2: ['Where it runs.'],
    lede: 'Wherever the official Claude Code CLI runs. The marks say how far each has been checked.',
    rows: [
      { env: 'Windows 11 · Windows Terminal', status: 'TESTED', note: 'Developed and checked live here.' },
      { env: 'Windows 11 · Git Bash', status: 'TESTED', note: 'Where the timings were measured.' },
      { env: 'macOS', status: 'CI ONLY', note: 'Tests run in CI. No live check yet.' },
      { env: 'Linux · Ubuntu', status: 'CI ONLY', note: 'Tests run in CI. Checked live in WSL only.' }, // docs/guide/compatibility.md
      { env: 'VS Code, Cursor and JetBrains terminals', status: 'UNTESTED', note: 'No live check yet.' }, // statusline.md: "the live checks ran on Windows only"
      { env: 'Orca and other terminal-hosting IDEs', status: 'UNTESTED', note: 'No live check yet.' },
      { env: 'OpenCode, Codex and other agent harnesses', status: 'DOES NOT RUN', note: 'It needs the official Claude Code CLI.' }
    ],
    footnote: "Labels are taken from the status line's test notes. Cockpit's own tests run in CI on Ubuntu." // ci.yml: `claude plugin test .` on ubuntu-24.04; status line specs on ubuntu, windows, macos
  },
  how: {
    label: 'architecture · 2 paths',
    h2: ['How it works.'],
    lede: 'Two paths out of one session.',
    checked: 'checked against the code · hooks/ and statusline/',
    paths: [
      [
        ['claude code', 'your session'],
        ['engine hooks', 'what the agent did'],
        ['store', 'one record per turn'],
        ['renderers', 'text on the cell grid'],
        ['timeline · pane', 'Cockpit']
      ],
      [
        ['claude code', 'the same session'],
        ['statusLine command', 'bundled, run by Bun'],
        ['status line', 'under the prompt']
      ]
    ]
  },
  privacy: {
    label: 'privacy · 1 statement',
    h2: ['Privacy.'],
    // Checked at df9ab55: no fetch, socket or HTTP code anywhere in hooks/ or statusline/; README: "It makes no network requests". The status line runs one local
    // `git status`; the installer writes ~/.claude/settings.json (one key) and its own files under ~/.claude/ghostframe/.
    // tools/check-privacy.ts (HANDOFF.md, section 13) keeps this claim true on every build.
    statement: 'ghostframe runs locally inside your Claude Code session and changes only how it is displayed. It makes no network requests.',
    checked: 'checked against the code · no network calls',
    diagram: ['your machine', 'claude code session', 'ghostframe', 'draws · does not send']
  },
  faq: {
    label: 'faq · 7 questions',
    h2: ['Questions.'],
    items: [
      {
        q: 'Does it change my Claude Code settings?',
        a: 'The status line installer writes one key, statusLine, in your user settings. It shows the diff first, waits for you, and keeps a backup. Every other key, its order and the formatting stay as they were.'
      },
      {
        q: "Why isn't the mascot in my terminal?",
        a: 'Claude Code keeps only colour codes and links from a status line and drops everything else, images included. So inside the terminal the ghost is drawn in half blocks.'
      },
      {
        q: 'How do I remove it?',
        a: 'Run /ghostframe-statusline uninstall. It puts back the status line entry you had before, or removes the entry if there was none. A personal script the old entry pointed at is never touched.'
      },
      { q: 'Do I need a Nerd Font?', a: 'Only for the branch, PR and cache icons. Without one, set GF_ICONS=0. The layout is identical.' },
      {
        q: 'How narrow can my terminal be?',
        a: 'The full status line needs 140 columns. From 90 to 139 it switches to a narrow layout, and below 90 it prints one plain line. Cockpit docks its pane from 144 columns and falls back to the timeline alone below that.'
      },
      { q: 'Does it work in OpenCode or Codex?', a: 'No. ghostframe runs only where the official Claude Code CLI runs.' },
      {
        q: 'Does it slow the prompt down?',
        a: 'A status line frame takes about 55 ms back to back and about 123 ms after an idle gap, measured on Windows 11 with Bun 1.4.4. Most of the idle cost is Bun starting; the renderer itself takes under 2 ms.'
      }
    ]
  },
  footer: {
    label: 'colophon',
    columns: { project: ['Source', 'Docs', 'Release notes'], page: ['Cockpit', 'Status line', 'Install'] },
    motionSwitch: 'ambient motion',
    caption: 'lattice · 16 px cell · lit by the cursor',
    mobileCaption: 'the light follows your thumb'
  }
}

export const notFound = {
  h1: ['Nothing in', 'this frame.'],
  command: 'cd /that-page',
  error: '× no such page',
  code: '404',
  text: 'The ghost wandered off the grid. Move the frame to find it, or pick a way out.',
  exits: [
    { label: 'Home', href: '/' },
    { label: 'Install', href: '/#install' },
    { label: 'Release notes', href: '/releases' },
    { label: 'Source', href: site.repo }
  ],
  found: 'found. take me home',
  rail: 'the slot is empty · nothing to report'
}

export const boot = {
  header: 'ghostframe 1.0.0 · tty 180 × 56',
  command: 'ghostframe --attach',
  lines: [
    { t: 420, text: 'reading the grid' },
    { t: 630, text: 'resolving 12180 cells' },
    { t: 840, text: 'docking the frame' },
    { t: 1050, text: 'waking the ghost' }
  ],
  marks: [
    [0, 'attach'],
    [420, 'read'],
    [630, 'resolve'],
    [1300, 'dock'],
    [1500, 'wake'],
    [1650, 'cut']
  ] as const,
  hexdumpSource: 'ghostframe: the cockpit for Claude Code. /ghostframe-statusline install. runs inside your own session. ',
  scramble: ['Tx3 c0#kp1t', 'f0r C|4ud3 C0d3.']
}

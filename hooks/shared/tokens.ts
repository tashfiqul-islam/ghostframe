// ─── Tokens: the one source of every colour (DESIGN.md §2) ───────────────────
// The theme (~/.claude/themes/ghostframe.json) and the status line
// (~/.claude/statusline.sh) use these same hex values; each names its token in a
// comment. Change a value here, then there.
export const C = {
  bg: '#0b0b0e', // the terminal's ground (theme: inverseText, composer sidebar)
  surface: '#1e1e26', // code chips, the language pill, message backgrounds
  hairline: '#2c2c36', // ┄ ┆ frame edges, table hairline, bar tracks, the activity rule
  rule: '#3a3a48', // figure spine and loop bracket, mode and status-line dividers, prompt border
  ruleStrong: '#545462', // `+` corners and grid marks
  dim: '#4e4e5a', // narration, detail lines, notes, folded output
  muted: '#686874', // verbs, labels, metadata, time, URL labels, icons
  text: '#b2b2bc', // body prose, bar fill
  textBright: '#ececf1', // targets, numbers, bold, headings
  accent: '#fab387', // the single accent: titles, `claude`, running, the `▎` rail
  link: '#8fb8de', // footnote markers and Sources numbers; plan mode, questions
  agent: '#b4a0de', // agent names and their `◇` (Cockpit's lavender, used for nothing else)
  ok: '#96d292', // done, pass, `ok`
  warn: '#e8b98a', // needs you, interrupted, budgets nearing a limit
  err: '#ec84a0', // failed, denied, exit codes
  add: '#96d292', // `+N`, added diff lines (the same green as `ok`, named for diffs)
  del: '#ec84a0' // `−N`, removed diff lines (the same red as `err`, named for diffs)
} as const

# Compatibility

ghostframe is part of Claude Code itself: a plugin that the `claude` CLI loads into your session. It runs wherever the
CLI runs in a terminal, and nowhere else.

## Claude Code versions

ghostframe 1.0 is tested with Claude Code from 2.1.329 up to, not including, 2.2.0. On any other version it stays
dormant and says so once ([Configuration](configuration.md#the-claude-code-range)). CI tests 2.1.329; a weekly job
tests the latest release.

## Systems

| System  | Cockpit                                                                                                                 | Status line                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Windows | Tested live (Windows Terminal), and in CI                                                                               | Tested live, and in CI                        |
| Linux   | In CI. Live in WSL (Ubuntu): Claude Code starts and Cockpit draws its pane; the scripted turns have not run through yet | In CI. Live in WSL: step 13 passes (44 of 44) |
| macOS   | In CI only, untested live                                                                                               | In CI only, untested live                     |

"In CI" means the plugin's tests and the status line's specs pass there, with the pinned Claude Code. They check the
rows ghostframe builds, not how a terminal draws them.

## Claude Code surfaces

| Surface                                 | ghostframe                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The terminal CLI                        | Yes. Cockpit, the transcript's look and the status line.                                                    |
| The VS Code extension's graphical panel | No. Claude Code runs plugins there too, but ghostframe draws only in the terminal and hands every row back. |
| The Desktop app                         | No, for the same reason.                                                                                    |
| Claude Code on the web                  | No. The plugin docs list the CLI, Desktop and the VS Code extension as the surfaces that run plugin code.   |

The pane docks only in [fullscreen rendering](https://code.claude.com/docs/en/fullscreen), the default for most new
setups. Run `/tui fullscreen` to switch; in the classic renderer Cockpit uses its fallback on the left.

## Terminals

ghostframe runs in any terminal the `claude` CLI runs in. What to check in each:

| Where                                   | True colour                               | Nerd Font icons                      | Width         | Notes                                                                                                                  |
| --------------------------------------- | ----------------------------------------- | ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Windows Terminal (PowerShell, cmd)      | Yes, detected (`WT_SESSION`)              | Set a Nerd Font in the profile       | Pane from 144 | Tested live. Fragments after a fast redraw: set `CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1`.                               |
| macOS Terminal.app                      | No: the status line uses 256 colours      | Set a Nerd Font in the profile       | Pane from 144 | Untested. `Fn`-drag for a native selection.                                                                            |
| iTerm2, WezTerm, Ghostty, kitty         | Yes, detected                             | Set a Nerd Font                      | Pane from 144 | Untested. iTerm2: turn on mouse reporting; not in `tmux -CC`.                                                          |
| Linux terminals (GNOME, Konsole, foot…) | Where `COLORTERM=truecolor` is set        | Set a Nerd Font                      | Pane from 144 | Untested live, apart from the WSL checks.                                                                              |
| VS Code and Cursor integrated terminals | Yes, detected (`TERM_PROGRAM=vscode`)     | Set `terminal.integrated.fontFamily` | Pane from 144 | Untested. The editor may take `ctrl+x` (Cut) and other chords before the terminal sees them.                           |
| JetBrains IDE terminals                 | Varies; the status line falls back to 256 | Set the terminal font                | Pane from 144 | Untested. Claude Code handles this terminal's scrolling itself.                                                        |
| Terminal-hosting tools such as Orca     | Depends on the host's terminal            | Depends on the host's terminal       | Pane from 144 | Untested. They run the real `claude` binary in their own terminal panes, so ghostframe loads as it does anywhere else. |

- **Width.** The pane docks by itself from 144 columns in fullscreen, from 110 after `/cockpit`; narrower, Cockpit uses
  its fallback. The status line draws two rows from 90 columns, one plain line below.
- **Icons.** Without a Nerd Font the status line's icons draw as empty boxes. Turn **Status line icons** off in
  `/config`: the layout stays.
- **Emoji and wide characters.** ghostframe measures text by grapheme, with emoji and wide characters as two cells,
  as Windows Terminal draws them. A terminal that draws an emoji one cell wide shifts that row by a cell.
- **Mouse.** Clicking a pane row or a code card needs fullscreen rendering's mouse capture; `CLAUDE_CODE_DISABLE_MOUSE=1`
  turns it off and the keys still work.
- **Key chords.** Cockpit's own keys are single keys that work only while the pane has the keyboard. Giving it the
  keyboard is Claude Code's `ctrl+x` then `tab`. If a host takes `ctrl+x` for itself, change that host's keybinding
  so the terminal receives it; this is untested in each host above. `ctrl+o` is Claude Code's full record.

## Other agent tools

ghostframe does not run in other agent tools such as OpenCode, Codex, Cline, OpenClaw or Goose: they have their own
interface and don't load Claude Code plugins.

## Subscriptions

ghostframe doesn't change how you sign in. It works with whatever Claude Code is signed in with: a Claude
subscription, an API key, or a cloud provider. Running the unmodified `claude` binary inside a host such as Orca is
still Claude Code. Signing a third-party harness in with your subscription is a different matter, and not something
ghostframe does or needs. See Claude Code's [legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
page for the terms.

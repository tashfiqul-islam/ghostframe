# Troubleshooting

## The pane does not show

- **The terminal is narrower than 144 columns.** The pane docks by itself from 144. From 110 to 143, run `/cockpit`.
  Narrower, Cockpit uses fallback on the left instead ([Usage](usage.md#fallback)).
- **Claude Code is not in fullscreen.** The pane docks only in fullscreen; outside it, Cockpit uses fallback.
- **You closed it.** A pane you closed stays closed when the terminal widens. `/cockpit` brings it back.
- **Cockpit is off.** `/cockpit` then says `cockpit is off`. Check the **Cockpit pane** option in `/config`, and that
  `GHOSTFRAME_COCKPIT` is not set to `0`, `false`, `off` or `no` in your environment or your settings' `env`.

## ghostframe draws nothing, and the session says it is tested with another Claude Code

Your Claude Code is outside ghostframe's tested range (`>=2.1.329 <2.2.0` for 1.0), so ghostframe stays out of the
way rather than draw a broken UI. `claude --version` says which you run. Update ghostframe
(`claude plugin update ghostframe@ghostframe`) for a newer range, or set `GHOSTFRAME_ENGINE_CHECK=0` to try it anyway.
[Configuration](configuration.md#the-claude-code-range) has the details.

## The status line shows empty boxes

Its icons need a Nerd Font. Set your terminal's font to one, such as JetBrainsMono Nerd Font, or turn **Status line
icons** off in `/config`. The layout stays the same without them.

## The status line does not show

1. Run `/ghostframe-statusline status`. It says whether your user settings run ghostframe's status line, another one,
   or none, and whether the built script is missing.
2. A project's `.claude/settings.json` that sets `statusLine` wins over your user settings.
3. The status line runs on Bun. If `bun` is not on your `PATH`, the installer says so and changes nothing.
4. After updating the plugin, run `/ghostframe-statusline install` again to rebuild it.

To see what it does, set `GF_DEBUG=1` in your settings' `env`. It then writes `debug.log` in its cache folder:
`%LOCALAPPDATA%\ghostframe\cache` on Windows, `~/Library/Caches/ghostframe` on macOS, `$XDG_CACHE_HOME/ghostframe` (or `~/.cache/ghostframe`) on Linux. It never writes to the terminal's error output, so it never breaks the status line.

## The status line is cut with "…"

Claude Code cuts a status line longer than the space it gives. The installer sets `padding: 0`, and the status line
sizes itself to that. If you changed `padding`, set `GF_PADDING` to the same number.

## The status line has no colour

`NO_COLOR` is set to a non-empty value somewhere in your environment. The status line honours it.

## Still stuck

Open an issue with your OS, terminal, Claude Code version (`claude --version`), ghostframe version (the pane's last
row says it), the terminal's width, whether the pane was docked, and a screenshot.

# Configuration

## Options

Set them in `/config`, or from your shell with `claude plugin configure ghostframe@ghostframe`.

| Option            | In `/config`          | Default | Does                                                                              |
| ----------------- | --------------------- | ------- | --------------------------------------------------------------------------------- |
| `cockpit`         | **Cockpit pane**      | on      | Cockpit: the left's new look and the pane. Off, every row draws as Claude Code's. |
| `statuslineIcons` | **Status line icons** | on      | The status line's Nerd Font icons. Off, it draws the same layout without them.    |

The status line reads `statuslineIcons` on every update, so a change shows at once.

## `GHOSTFRAME_COCKPIT`

Turns Cockpit on or off for one session, whatever the option says.

| Value                     | Cockpit                      |
| ------------------------- | ---------------------------- |
| `1`, `true`, `on`, `yes`  | on                           |
| `0`, `false`, `off`, `no` | off                          |
| unset, or anything else   | the `cockpit` option decides |

Case does not matter. For example, in PowerShell:

```powershell
$env:GHOSTFRAME_COCKPIT = '0'; claude
```

## The Claude Code range

ghostframe 1.0 is tested with Claude Code from 2.1.329 up to, not including, 2.2.0: `plugin.json`'s
`engines["claude-code"]` is `>=2.1.329 <2.2.0`. On a Claude Code outside that range ghostframe is dormant: it draws
nothing, Claude Code looks as it does without it, and the session says so once. The status line keeps working.

| Variable                    | Effect                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GHOSTFRAME_ENGINE_CHECK=0` | Skips the check: ghostframe runs on any Claude Code. Its look may break on one it was not tested with. |

[ADR 0012](../decisions/0012-engine-range.md) explains the range.

## The status line's variables

Set these in the `env` of your settings, or in the environment Claude Code starts in.

| Variable           | Effect                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `GF_ICONS=0` / `1` | Icons off or on, over the `statuslineIcons` option.                   |
| `GF_SLAB=1`        | A dark slab behind the status line, with a 2-cell margin.             |
| `GF_MAXW`          | The widest the status line draws (default 210 columns).               |
| `GF_PADDING`       | The `padding` your `statusLine` entry sets, when it is not 0.         |
| `GF_DEBUG=1`       | A log in the system's temp folder: `ghostframe-statusline-debug.log`. |
| `NO_COLOR`         | Any non-empty value: no colour at all.                                |

The status line draws 24-bit colour where the terminal says it can (`COLORTERM=truecolor`, Windows Terminal, iTerm2,
WezTerm, VS Code, Ghostty and others), and the nearest of 256 colours elsewhere.

## The `statusLine` entry

The installer writes this entry, with the path of the script it built:

```json
{ "type": "command", "command": "bun <config>/ghostframe/statusline.js", "padding": 0, "refreshInterval": 10 }
```

`padding: 0` lines the ghost up with the footer below it, and `refreshInterval: 10` keeps the reset timers current
while you are idle.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/design/brand/readme/readme-hero-dark.png">
    <img alt="ghostframe: the cockpit for Claude Code" src="docs/design/brand/readme/readme-hero-light.png">
  </picture>
</p>

<h3 align="center">See what Claude is doing while it does it.</h3>

<p align="center">
  A redesigned chat UI for Claude Code, with every step of the turn on a live timeline,<br>
  and a status line that shows what your session is costing you.
</p>

<p align="center">
  <a href="https://github.com/tashfiqul-islam/ghostframe/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/tashfiqul-islam/ghostframe/actions/workflows/ci.yml/badge.svg?branch=main"></a>
</p>

<!-- The version is the only semver on its line: release-please's marker rewrites the first one it finds. -->
<!-- tools/scripts/engines.ts --check fails if the Claude Code range here disagrees with plugin.json's engines. -->
<p align="center">
  v1.0.0 <!-- x-release-please-version -->
  · <a href="LICENSE">MIT</a> · Claude Code 2.1.329 to 2.1.x · <a href="docs/guide/compatibility.md">Windows, macOS, Linux</a>
</p>

<p align="center">
  <a href="#02-install">Install</a> ·
  <a href="#01-features">Features</a> ·
  <a href="#03-keys">Keys</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="https://github.com/tashfiqul-islam/ghostframe/releases">Changelog</a>
</p>

<p align="center">
  <img src="docs/assets/readme-hero.png" width="960" alt="Cockpit at 200 columns after a turn: the commit, Claude's answer with its diff and the DONE receipt on the left; the turn's timeline with its fixed failure in the pane; the status line at the bottom">
</p>

ghostframe is a plugin for Claude Code's terminal. **Cockpit** keeps the conversation on the left and puts the work on
the right: each step of the turn on a timeline, the files it changed, the pages it read, its to-do list and its agents.
**The status line** gives you the model, the repository, your context and your 5-hour and weekly budgets in two rows.
It changes how your session looks, never what Claude does.

> [!NOTE]
> **Private by design.** ghostframe runs inside your own Claude Code session. It makes no network requests and never
> reads, stores or sends your credentials. The [security policy](SECURITY.md) has the threat model.

```text
+-------------------------- [ SPEC ] --------------------------+
|                                                              |
| plugin       a Claude Code hooks module, nothing to install  |
| cockpit      the conversation left, the turn's work right    |
| status line  model, repo, context, 5-hour and weekly budgets |
| network      none: no requests, no telemetry, no credentials |
| engine       Claude Code >=2.1.329 <2.2.0, dormant outside   |
| systems      Windows, Linux, macOS                           |
| license      MIT                                             |
|                                                              |
+--------------------------------------------------------------+
```

## `01` Features

<table>
<tr>
<td width="44%" valign="middle">

### A live timeline

Every step of the turn on a time track, grouped as Claude works. A failure gets a row that stays, with its first
decisive line; the fix shows as its own step.

[Usage →](docs/guide/usage.md#the-pane)

</td>
<td width="56%"><img src="docs/assets/readme-live.png" alt="The pane while a turn runs: LIVE, the failed test with its decisive line, and the next step running"></td>
</tr>
<tr>
<td width="44%" valign="middle">

### Every file, one key from its diff

The files the turn changed, with their counts and a change bar. `enter` opens the diff against the start of the
turn.

[Keys →](docs/guide/keys.md)

</td>
<td width="56%"><img src="docs/assets/readme-files.png" alt="The Files tab: one file changed, +10 −2, its change bar"></td>
</tr>
</table>

### The status line

<p align="center">
  <img src="docs/assets/readme-statusline.png" width="960" alt="The status line: the ghost, Opus 5.5 at medium effort, the repository and branch, the changes, and the context, 5-hour and weekly budgets with their meters and reset times">
</p>

The model and its effort, the repository and branch, your changes or the pull request that needs you, then context and
the 5-hour and weekly budgets, each with its pace and reset time. The ghost's eyes show the highest of the three:
green under 60%, amber from 60%, red from 85%. [The design →](docs/design/statusline.md)

**And the details.** The left stays quiet: a header for each turn, your message, Claude's answer, a row for anything
that left the machine, and a receipt with how long the turn took and whether it passed. Narrow terminals get a
fallback without the pane. The pane follows Claude's agents into their own work, steps back through earlier turns, and
knows when you rewind. [The spec →](docs/design/cockpit.md)

## `02` Install

In a Claude Code session:

```text
/plugin marketplace add tashfiqul-islam/ghostframe
/plugin install ghostframe@ghostframe
```

Cockpit is on as soon as the plugin loads. The status line is a one-time step of its own, because Claude Code reads its
status line only from your settings:

```text
/ghostframe-statusline install
```

It shows the change to your `settings.json`, asks first, and keeps a backup. `uninstall` restores what you had.

<details>
<summary><b>From your shell, updates, and uninstalling</b></summary>

```sh
claude plugin marketplace add tashfiqul-islam/ghostframe
claude plugin install ghostframe@ghostframe
claude plugin update ghostframe@ghostframe       # then /ghostframe-statusline install again
claude plugin uninstall ghostframe@ghostframe    # after /ghostframe-statusline uninstall
```

The [install guide](docs/guide/install.md) has every step.

</details>

| Requirement | Detail                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Claude Code | The terminal CLI, 2.1.329 up to (not including) 2.2.0. On any other version ghostframe stays dormant.     |
| Terminal    | True colour is best; the status line falls back to 256 colours and honours `NO_COLOR`.                    |
| Width       | The pane docks from 144 columns, or from 110 after `/cockpit`. The status line draws two rows from 90.    |
| Font        | A [Nerd Font](https://www.nerdfonts.com/) for the status line's icons, or turn **Status line icons** off. |
| Bun         | [Bun](https://bun.sh), for the status line only.                                                          |

## `03` Keys

Cockpit's keys work only while the pane has the keyboard, so they never take one from your prompt.

```text
+-------------------------- [ KEYS ] --------------------------+
|                                                              |
| [ctrl][x] then [tab]  give the pane the keyboard             |
| [1] … [5]             timeline, files, sources, todo, agents |
| [enter]               open the row: output, diff, agent, url |
| [p] [n]               the previous or next turn, [l] live    |
| [ctrl][o]             Claude Code's full record of the turn  |
| [esc]                 back to the prompt                     |
|                                                              |
+--------------------------------------------------------------+
```

`/cockpit` opens or closes the pane, and `/steps 3` pins turn 3 into it. [Every key →](docs/guide/keys.md)

## `04` How it works

ghostframe is a hooks module that Claude Code loads into your session. It listens to the engine's events, keeps what
each turn did, and draws through the engine's own render sites, so it never writes to your terminal behind Claude
Code's back.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/architecture-dark.png">
    <img src="docs/assets/diagrams/architecture-light.png" width="960" alt="How a turn is drawn: Claude Code raises events; ghostframe's ledger records them in turn state; when Claude Code asks a render site to draw, pure renderers return element trees, and Claude Code draws them to your terminal">
  </picture>
</p>

Outside the Claude Code versions it is tested with, ghostframe goes dormant and hands every row back to Claude Code.
[Architecture →](docs/architecture.md) · [Decisions →](docs/decisions/README.md)

## `05` Where it runs

```text
+--------------------- [ WHERE IT RUNS ] ----------------------+
|                                                              |
| Where                       | Cockpit      | Status line     |
| ----------------------------+--------------+-------------    |
| Systems                                                      |
| Windows                     | tested live  | tested live     |
| Linux                       | CI           | CI, WSL         |
| macOS                       | CI           | CI              |
| ----------------------------+--------------+-------------    |
| Claude Code                                                  |
| terminal CLI                | yes          | yes             |
| Desktop app, VS Code panel  | hands back   | —               |
| web                         | —            | —               |
|                                                              |
+--------------------------------------------------------------+
```

ghostframe runs wherever the `claude` CLI runs in a terminal: editors' integrated terminals included, and hosts that
run the real `claude` binary. Other agent tools, such as OpenCode or Codex, don't load Claude Code plugins, so it
doesn't run there.
[Compatibility →](docs/guide/compatibility.md)

## `06` FAQ

```text
+-------------------------- [ FAQ ] ---------------------------+
|                                                              |
| ?  Does it change what Claude does?                          |
|    No. Prompts, tools, permissions and answers stay          |
|    Claude Code's. ghostframe changes how they are drawn.     |
|                                                              |
| ?  How do I turn Cockpit off?                                |
|    Cockpit pane off in /config, or one session with          |
|    GHOSTFRAME_COCKPIT=0.                                     |
|                                                              |
| ?  The status line shows empty boxes.                        |
|    Its icons need a Nerd Font. Set one in your terminal,     |
|    or turn Status line icons off; the layout stays.          |
|                                                              |
| ?  Can I keep my own status line?                            |
|    Yes. It is opt-in, and uninstall puts yours back.         |
|                                                              |
+--------------------------------------------------------------+
```

[Configuration →](docs/guide/configuration.md) · [Troubleshooting →](docs/guide/troubleshooting.md) ·
[Nerd Fonts →](https://www.nerdfonts.com/)

## `07` Docs

| Use it                                           | Understand it                                 | Work on it                                     |
| ------------------------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| [Install](docs/guide/install.md)                 | [Architecture](docs/architecture.md)          | [Contributing](CONTRIBUTING.md)                |
| [Usage](docs/guide/usage.md)                     | [Decisions](docs/decisions/README.md)         | [Testing](docs/development/testing.md)         |
| [Keys](docs/guide/keys.md)                       | [Cockpit spec](docs/design/cockpit.md)        | [Live checks](docs/development/live-checks.md) |
| [Configuration](docs/guide/configuration.md)     | [Status line spec](docs/design/statusline.md) | [Releasing](docs/development/releasing.md)     |
| [Troubleshooting](docs/guide/troubleshooting.md) | [Security](SECURITY.md)                       | [Brand kit](docs/design/brand/README.md)       |
| [Compatibility](docs/guide/compatibility.md)     |                                               | [All docs](docs/README.md)                     |

## `08` Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the checks and how a change
ships; everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md).

```sh
mise install && mise run setup    # the toolchain and the git hooks
mise run check                    # types, lint, format, tests, workflows, docs
```

<br>

<p align="center">
  <img src="docs/design/brand/ghostframe-mark-small-amber.svg" width="44" alt="">
  <br>
  <sub><code>ghostframe</code> haunts your terminal, never your code.</sub>
  <br>
  <sub><a href="LICENSE">MIT</a> · Made for Claude Code. Not affiliated with or endorsed by Anthropic.</sub>
</p>

# Install

## The plugin

This repository is its own plugin marketplace. In a Claude Code session:

```text
/plugin marketplace add tashfiqul-islam/ghostframe
/plugin install ghostframe@ghostframe
```

`/plugin install` opens the plugin's details in the `/plugin` panel, where you install it. From your shell instead:

```sh
claude plugin marketplace add tashfiqul-islam/ghostframe
claude plugin install ghostframe@ghostframe
```

Cockpit is on as soon as the plugin loads. [Configuration](configuration.md) says how to turn it off.

## The status line

Claude Code reads its status line only from settings, so it has its own one-time step:

```text
/ghostframe-statusline install
```

It needs [Bun](https://bun.sh) on your `PATH`; without it, it says so and changes nothing. Otherwise it:

1. shows the change to your user `settings.json` as a diff and asks before writing;
2. on **Cancel** or `esc`, changes nothing;
3. builds the status line with `bun build` into `ghostframe/statusline.js` in your Claude Code config folder
   (`~/.claude`, or `CLAUDE_CONFIG_DIR`);
4. backs up `settings.json` beside it (`settings.json.bak-<time>`) and changes only its `statusLine` entry.

If you had a status line before, it keeps that entry so you can go back to it.

| Command                            | Does                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `/ghostframe-statusline install`   | Installs it, or builds it again when it is already installed.                  |
| `/ghostframe-statusline uninstall` | Restores the status line you had before, or removes the entry if you had none. |
| `/ghostframe-statusline status`    | Says which status line your user settings run.                                 |

A `statusLine` in a project's `.claude/settings.json` wins over your user settings, so a project can show another
status line.

## Update

The marketplace does not update by itself unless you turn auto-update on for it under **Marketplaces** in `/plugin`.
To update by hand:

```sh
claude plugin update ghostframe@ghostframe
```

After an update, run `/ghostframe-statusline install` again to rebuild the status line from the new version.

## Uninstall

Run `/ghostframe-statusline uninstall` first if you installed the status line, then:

```sh
claude plugin uninstall ghostframe@ghostframe
claude plugin marketplace remove ghostframe
```

## Requirements

| What        | Needs                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Claude Code | The terminal CLI. Tested with 2.1.329 in CI and 2.1.332 live. Older versions are untested.            |
| System      | Windows is tested live; macOS and Linux run the tests in CI.                                          |
| Font        | A Nerd Font for the status line's icons, or turn the icons off ([Configuration](configuration.md)).   |
| Width       | The pane docks from 144 columns, or from 110 after `/cockpit`. The status line needs 90 for two rows. |
| Bun         | For the status line only.                                                                             |

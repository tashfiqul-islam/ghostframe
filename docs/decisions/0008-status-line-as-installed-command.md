# 0008. The status line ships as an installed command

Status: accepted.

## Context

Claude Code reads `statusLine` only from settings; a plugin cannot set it. A plugin's `ui.render` hook on the
`StatusLine` site draws in the same slot, but the plugin API has none of the effort level, lines changed, pull
request or rate-limit fields the design shows ([statusline.md](../design/statusline.md), Decisions).

## Decision

`/ghostframe-statusline install` writes the `statusLine` entry to the user's settings. It shows the diff and asks
first, writes nothing before the person says so (Cancel or `esc` change nothing), keeps a backup of `settings.json`,
changes only the `statusLine` entry, and keeps the entry it replaced. `uninstall` restores that entry.

## Consequences

- The status line has every field the design needs.
- It is a separate, explicit step after installing the plugin, and an update needs `install` again to rebuild it.
- A project's own `statusLine` wins over the user's.

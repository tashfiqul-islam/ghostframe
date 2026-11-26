# 0012. ghostframe is dormant outside a tested range of Claude Code

Status: accepted.

## Context

ghostframe draws through Claude Code's plugin API and its render sites, which change with the engine. Claude Code ships
releases most days: 2.1.329 to 2.1.332 in one week. A change that breaks a render site would show a broken UI in
every session until a ghostframe release fixes it. Three range policies were weighed:

- **floor only** (`>=2.1.329`): no engine is ever refused; a breaking update shows a broken UI until a release;
- **the exact tested window** (`>=2.1.329 <=2.1.332`): most days the engine would be newer than the window, and
  ghostframe would be off;
- **a floor and the next minor** (`>=2.1.329 <2.2.0`): patch releases keep working, and a minor release, where API
  changes are likelier, waits for a ghostframe release that widens the range.

## Decision

The range is `>=2.1.329 <2.2.0`, in one place: `plugin.json`'s `engines["claude-code"]`. Claude Code 2.1.323 and later
read the field; its docs do not say what an engine outside the range does with it, so ghostframe checks for itself.

At session start ghostframe compares `$.session.version()` with the range (`hooks/shared/engine.ts`, the comparison in
`hooks/shared/range.ts`). Outside it, ghostframe is dormant: every render site hands its row back to the engine,
Cockpit's pane does not open, the session gets one notice in the transcript and a line in the debug log, and `/cockpit`
and `/steps` say why. `GHOSTFRAME_ENGINE_CHECK=0` turns the check off. A range or version that cannot be read leaves
ghostframe awake and says so in the debug log. The status line is a separate program that reads documented JSON, so it
is not gated.

## Consequences

- An engine with a new minor version gets Claude Code's own UI until a ghostframe release widens the range.
- `tools/scripts/engines.ts --check` fails the gate when the Claude Code version CI pins is outside the range, so the
  tested version and the declared range cannot drift apart.
- The weekly canary (`.github/workflows/canary.yml`) tests the latest Claude Code and says whether it is inside the
  range. When it passes on a newer engine, raise the pin; when a new minor passes, widen the range in a release.
- Claude Code 2.0.15 to 2.1.75 reject a manifest that has `engines`. Those versions are far older than the floor.

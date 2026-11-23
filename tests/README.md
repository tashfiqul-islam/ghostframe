# tests/

The plugin's tests, run by the engine's own harness: `claude plugin test .` from the repository root (or
`bun run --cwd tools test`). It finds every `*.test.ts` and `*.test.tsx` under this folder.

## Layout

`tests/` mirrors [`hooks/`](../hooks/README.md): a test lives at the path of the module it exercises, as
`<module>.test.ts(x)`. A test of `hooks/transcript/table/parse.ts` is in `tests/transcript/table/parse.test.ts`; a
test that mounts a render site is beside that site's module (`AssistantMessage` under `transcript/sites/reply/`,
`ToolGroup` in `transcript/sites/tools/group.test.tsx`, the `Pane` in `cockpit/pane.test.tsx`). A module with many
tests may have several files, each named for what it covers (`reply/tables`, `reply/streaming`).

- `shared/`, `cockpit/`, `transcript/`: as in `hooks/`.
- `plugin/`: tests of the whole plugin rather than one module: a turn drawn across every site, every site at
  narrow widths, the specimen render, what `register.tsx` leaves to the engine.
- `fixtures/`: recorded data a test replays, each file saying where it came from: `session-flood` is a real turn's
  455 tool calls, for the failure rules (spec 13.1); `live` is the live checks' session, turn by turn.
- `support/`: helpers more than one test file uses, each defined in exactly one file and imported from it (no
  barrels): `respond` (a stored response), `view` (viewport sizes), `engine` (an engine stub that draws a marker),
  `text` (the text a tree draws), `cockpit` and `docked` (Cockpit on, its pane docked, a fixed-on-the-second-run
  turn), `fallback` (Cockpit on, no pane docked, a turn of every kind of step), and fixtures for figures, sources,
  states and narrow widths.

## Adding a test

Put it in the file for the module it exercises, creating the file if needed. Reuse a helper from `support/`; add one
there only when a second test file needs it. A test drives the engine as it does at run time: mount a site with
`$.ui.mount`, raise events (`$.turn.start`, `$.tool.call`, …), and answer the engine's calls with `on(...)`.
Cockpit is off by default, so a Cockpit test passes `{ options: { cockpit: true } }` (`ON` in `support/cockpit`).

`tests/tsconfig.json` type-checks these files with the plugin's settings, without `isolatedDeclarations`.

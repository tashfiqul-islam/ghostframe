# hooks/

The plugin's code. The engine loads one hooks module per plugin, named in `hooks.json`: `register.tsx`, which only
composes the two features. Everything else sits in three layers: `shared/` (helpers both features use), `cockpit/`
(the pane beside the transcript, off by default) and `transcript/` (how the conversation itself is drawn). The
engine runs these `.ts` files as they are; there is no build step.

## Layout

The folders are the index. Each folder below holds files of one responsibility, under about 300 lines each.

- `shared/`: colour tokens, the grid and layout math, text width and clipping, the rule, time formats, `Part` helpers,
  the LRU and turn caps, URL and path labels, and the flow (Claude's blocks and calls in stored order, with what
  narration is), which both features read.
- `shared/look/`: Cockpit v8's shared rules (spec sections 2, 4, 5, 13.2 to 13.6): the palette (every hex Cockpit
  draws with), the glyphs, the formats (clock, day, duration, counts, state words), the one path formatter and the
  cuts from the middle, the `cd` prefix, kind words and short result words.
- `shared/calls/`: what a tool call was and what it returned: its verb and target, result summaries, test-run
  counts, commits, pushes and pull requests.
- `cockpit/`: the pane's seat and width rule, the off switch, the step log's atoms and timers, the turn's work
  (to-dos, files, pages), the pane render and the left's routing, docked or in fallback, and its mode (in fullscreen
  the mode now, with docked or full kept from a row's first draw; on the main screen each row's first draw), the
  ctrl+o view's flag (E.4), and the `/copy` forms and `/steps n all`.
- `cockpit/steps/`: the step log itself: kinds and subjects, results, failure keys, the log's updates and verdict.
- `cockpit/agents/`: the roster of agents (launch, steps, report, resume).
- `cockpit/sections/`: the to-do list, the files and the pages: what each call adds to them.
- `cockpit/history/`: every turn kept (E.45): its record, the store's budget and trimming, the pinned turn, each
  file's snapshot at the turn's start and the line diff that compares it with the file now.
- `cockpit/keys/`: the focused pane (E.44): its keys and views (a step's detail, a diff, every step, the tabs), and
  the steps' kept details.
- `cockpit/fallback/`: the left with no pane docked (E.3, E.5, E.33, E.46): the capsule and where each stretch of
  work ends (worked out from the turn's flow and steps at every draw, amendment 10), failure rows, the live area, and
  the inline inspector's size.
- `cockpit/v8/`: Cockpit v8's renderers (spec sections 7 to 9), pure: each returns the rows the pane or the left
  draws, built on `shared/look/`. The left's rows Cockpit owns (event rows, the receipt, the worked node, the live
  line, slash command rows) and the pane's components (tabs, head card, timeline, drawer, the other views, the keys).
- `transcript/`: prose, citations, claims, notices and frames, outcome cards, the browser frame, the caps line.
- `transcript/v8/`: Cockpit v8's left (spec section 7), pure: the turn header, your message as a card, the thought
  row, the answer's markdown (headings, lists, quotes, task items, footnotes), code and diff cards, tables, the note
  and the plan card, built on `shared/look/`.
- `transcript/activity/`: the folded activity rows: step model, rule, fold, row layout, diff data.
- `transcript/blocks/`: splitting a reply into blocks: headings, lists, fences.
- `transcript/table/`: Markdown tables: parse, column layout, cells.
- `transcript/figure/`: fenced figures: lists and timelines, tones, drawing.
- `transcript/research/`: footnotes and `[ SOURCES ]`: citations, source lists, labels.
- `transcript/ledger/`: the transcript's state: its atoms and the engine events that feed them.
- `transcript/draw/`: the draw kit: cells, the gutter grid, step rows, diff cards, parts.
- `transcript/sites/`: one module per render site the transcript restyles.
- `transcript/sites/reply/`: the reply (`AssistantMessage`): blocks, lines, tables, summaries, narration.
- `transcript/sites/tools/`: tool rows: `ToolUse`, `ToolGroup`, `ToolResult`, and what each draws when quiet.

## Rules

- `shared/` imports only `shared/`, the repo-root `types/` and `claude-code`. It never imports a feature.
- `cockpit/` imports `cockpit/`, `shared/`, `types/` and `claude-code`. It never imports `transcript/`.
- `transcript/` imports `transcript/`, `shared/`, `types/`, `claude-code`, and from the cockpit only its public
  modules: `cockpit/feature`, `cockpit/left`, `cockpit/log`, `cockpit/switch`.
- Only `register.tsx` composes both features.
- Import from the module that defines a name: no `index.ts` barrels, no `export … from`.
- The engine's own rules: `$` is passed only to top-level function declarations (never through an object or
  closure), and each engine event is hooked once per plugin. An atom is read and written in the file that declares
  it; other files call that file's functions.

`tools/scripts/boundaries.ts` enforces the import rules, and checks that every folder this README names exists
and that every folder under `hooks/` is named here. Run it with `bun run --cwd tools boundaries`. It also runs in
`bun run --cwd tools check`, the pre-commit hook and CI.

## Wiring

`register.tsx` calls `registerCockpit(on, options)`, `registerLedger(on)` and each site's `register…(on)`. The
transcript's ledger owns the engine events and calls the cockpit's log functions where the cockpit needs the main
loop. Render sites are hooked by the folder that draws them.

| Folder                    | Engine events                                                                                                                                                             | Render sites                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `cockpit/`                | `command.run` (`/cockpit`, `/steps`), `ui.close`, `ui.focus`, `agent.spawn`, `agent.report`                                                                               | `Pane`, `PromptHint`                                                                               |
| `transcript/ledger/`      | `session.start`, `session.append`, `session.compact`, `turn.start`, `turn.step`, `turn.complete`, `prompt.submit`, `tool.call`, `tool.check`, `skill.prompt`, `classic.*` |                                                                                                    |
| `transcript/sites/`       |                                                                                                                                                                           | `UserMessage`, `SessionMode`, `TurnDuration`, `Spinner`, `CommandOutput`, `InfoNotice`, `AgentRow` |
| `transcript/sites/reply/` |                                                                                                                                                                           | `AssistantMessage`                                                                                 |
| `transcript/sites/tools/` |                                                                                                                                                                           | `ToolUse`, `ToolGroup`, `ToolResult`                                                               |

While the cockpit is on, `Spinner`, `ToolGroup`, `ToolUse`, `TurnDuration`, `UserMessage` and `AssistantMessage` ask
`cockpit/left` first: the quiet left, docked or in fallback (no pane docked: a worked node per stretch of work, a row
per failure, the whole live area; `cockpit/fallback/`), each row drawn by `cockpit/v8/` and `transcript/v8/`. In fullscreen a row drawn again after the pane leaves or comes
back takes the mode now (amendment 10); on the main screen it keeps its first draw's. In the ctrl+o view each call is a
step line with its diff card, and narration a sentence row. Narration draws nothing, and each turn's receipt ends its last answer block, keyed by the engine's turn id;
`TurnDuration` draws nothing, since the turns an agent's reports start share one footer, or have none. Docked, the engine's agent rows draw nothing: an agent's `UserMessage` (its
message or its finished notice), the `ToolUse` of an `Agent` call, and each `AgentRow`. A subagent's `tool.call`
(the ledger's) feeds its row in the agents tab.

## Adding things

- **A render site:** a module under `transcript/sites/` that exports `register…(on)` with its
  `on('ui.render', { component }, …)` hook; call it from `register.tsx`. Pure layout goes in the matching
  `transcript/` folder, drawing helpers in `transcript/draw/`.
- **A cockpit view:** its pure updates in `cockpit/sections/` (or a folder of its own, like `agents/`, if it needs
  several files), its state in `cockpit/log.ts` or `cockpit/work.ts`, its rows in `cockpit/v8/views.ts`, assembled into
  the pane by `cockpit/v8/assemble.ts`. Anything the transcript must call goes in one of the cockpit's public modules.
- **A shared helper:** only when both features use it; it goes in `shared/` (or `shared/calls/` for tool-call
  parsing) and imports nothing from a feature.
- **An engine event:** add it to the ledger module that owns its kind (session, turns, calls, capabilities); an
  event already hooked there gets the new work in the same hook.

## See also

- [The Cockpit design](../docs/design/cockpit-v7.md), its
  [amendments](../docs/design/cockpit-v7-amendments.md) and its
  [feasibility report and phase plan](../docs/design/cockpit-v7-feasibility.md).
- [How the tests are laid out](../tests/README.md).

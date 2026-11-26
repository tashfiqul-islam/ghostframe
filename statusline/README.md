# statusline/

ghostframe's status line: the program Claude Code runs as its `statusLine` command. The design and how to install
it: [docs/design/statusline.md](../docs/design/statusline.md). The install command is `hooks/statusline/`.

It runs on Bun, outside the plugin's hooks: `/ghostframe-statusline install` bundles `main.ts` into one file.

## Files

- `main.ts`: the entry. Reads the JSON on stdin, gathers git and the caches, renders, prints. It never throws and never
  prints an error: on any failure it draws what it has.
- `facts.ts`: the JSON (any shape), git's answer and the cached limits to the facts one render shows. Pure.
- `render.ts`: the layout, pure, from facts, width and options to two rows of styled segments (or the one plain line
  below 90 cells), and the mark in its fixed 6 × 2 slot.
- `ansi.ts`: segments to terminal text, 24-bit or the nearest 256 colours.
- `io.ts`: the width W, git (cached 5 s per folder), the rate-limit cache, the icons setting, the debug log.
- `samples.ts`: the design board's two states as facts, for the specs.

## Options (environment)

| Variable           | Effect                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| `GF_ICONS=0` / `1` | Icons off or on, over ghostframe's `statuslineIcons` option                |
| `GF_SLAB=1`        | The #111117 slab and its 2-cell margin                                     |
| `GF_MAXW`          | The widest W draws at (default 210)                                        |
| `GF_PADDING`       | The `padding` the statusLine entry sets, when it is not 0                  |
| `GF_DEBUG=1`       | A log in the per-user cache folder, `debug.log` (never stderr)             |
| `GF_FIXTURE`       | For the live checks: a JSON file laid over Claude Code's, to force a state |

## Checks

- `bun run --cwd tools test:statusline` (`bun test ./statusline`): the `*.spec.ts` files, on Ubuntu, Windows and
  macOS in CI. They are `.spec.ts` because `claude plugin test` owns every `*.test.ts`.
- `reference.spec.ts` compares the renderer with `docs/design/statusline-preview.ts` cell for cell at 200 and 100.
- `tools/live` step 13 runs it in a real session at 200 and 100 columns.

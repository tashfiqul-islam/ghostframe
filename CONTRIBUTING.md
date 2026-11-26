# Contributing to ghostframe

Thank you for helping. Bug reports, fixes, docs and ideas are all welcome, and so is a question that starts with "is
this a bug?". This page gets you from a fresh clone to a merged change.

- [Before you start](#before-you-start)
- [Set up](#set-up)
- [Make a change](#make-a-change)
- [The checks](#the-checks)
- [Commits and pull requests](#commits-and-pull-requests)
- [How a change ships](#how-a-change-ships)

## Before you start

- **Bugs:** open an issue with the bug form. A screenshot, or a capture from the [live checks](docs/development/live-checks.md),
  shows in one look what a paragraph can't.
- **Anything bigger than a fix:** open an issue first, so we agree on the shape before you build it. Cockpit has a spec,
  and a change to what it draws starts there.
- **Security problems:** never in a public issue. [SECURITY.md](SECURITY.md) says how to report one privately.

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need [mise](https://mise.jdx.dev), which installs the pinned toolchain (Bun and the linters), and the `claude` CLI
on your `PATH`, which runs the plugin's tests.

```sh
git clone https://github.com/tashfiqul-islam/ghostframe && cd ghostframe
mise install && mise run setup     # the toolchain, the dev tools in tools/, the git hooks
claude --plugin-dir .              # try your copy in a real session
```

```text
+----------------------- [ REPOSITORY ] -----------------------+
|                                                              |
| ghostframe                                                   |
| ├─ hooks            the plugin, loaded into the session      |
| │  ├─ cockpit       the pane, the left, fallback             |
| │  ├─ transcript    the conversation's sites and rows        |
| │  ├─ shared        palette, glyphs, formats, engine check   |
| │  └─ statusline    /ghostframe-statusline                   |
| ├─ statusline       the status line program, on bun          |
| ├─ tests            mirrors hooks/, claude plugin test       |
| ├─ tools            the gate; live/ drives a real session    |
| └─ docs             guide, architecture, decisions, design   |
|                                                              |
+--------------------------------------------------------------+
```

`hooks/README.md` has the full layout and the import rules the gate enforces.

## Make a change

```text
+---------------------- [ FIRST CHANGE ] ----------------------+
|                                                              |
| 1  Open an issue                                             |
|    anything bigger than a fix: agree on the shape first      |
| │                                                            |
| 2  Write the test                                            |
|    it fails, for the reason you expect                       |
| │                                                            |
| 3  Make it pass                                              |
|    mise run check, the whole gate                            |
| │                                                            |
| 4  Look at it live                                           |
|    anything a user sees: 200 and 100 columns                 |
| │                                                            |
| 5  Open the pull request                                     |
|    a conventional title, written for the changelog           |
|                                                              |
+--------------------------------------------------------------+
```

- **Test first.** A test lives at the path of the module it covers, under `tests/`. Write it, watch it fail for the
  right reason, then make it pass. The engine fills the manifest's defaults into every test, so Cockpit is on unless a
  test passes `OFF` from `tests/support/cockpit.ts`.
- **One source for each fact.** Colours live in `hooks/shared/look/palette.ts` and glyphs in `glyphs.ts`; the version
  lives in `plugin.json`, and the tested Claude Code range in its `engines`. The gate refuses a colour or a status glyph
  written anywhere else, and a CI pin outside the range.
- **Changes users see.** Update the [Cockpit spec](docs/design/cockpit.md) or the
  [status line spec](docs/design/statusline.md) in the same pull request, look at it in a real session at 200 and 100
  columns, and attach a screenshot.
- **Docs.** Plain, specific, short sentences. Say what a thing does and how to use it, and check every command you
  write down.

## The checks

`mise run check` runs all of them, the same as CI. One at a time:

| Command                               | Checks                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `bun run --cwd tools test`            | The plugin's tests, in Claude Code's own harness                                |
| `bun run --cwd tools test:statusline` | The status line's specs                                                         |
| `bun run --cwd tools typecheck`       | Types, with tsrs                                                                |
| `bun run --cwd tools lint`            | oxlint, type-aware                                                              |
| `bun run --cwd tools fmt`             | oxfmt, which formats in place (`fmt:check` only checks)                         |
| `bun run --cwd tools boundaries`      | The import rules, the spec's screens, and that CI's Claude Code is in the range |
| `mise run lint-docs`                  | Markdown lint and every link and anchor in the docs                             |
| `mise run lint-actions`               | The workflows, with actionlint and zizmor                                       |

CI also runs the tests on Ubuntu, Windows and macOS. [Testing](docs/development/testing.md) has the details.

## Commits and pull requests

Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`. The git hook and CI check them against `tools/commitlint.config.ts`.

| Type                        | Use it for                | In the changelog |
| --------------------------- | ------------------------- | ---------------- |
| `feat`                      | Something new a user sees | Features         |
| `fix`, `security`, `revert` | Something that was wrong  | Fixes            |
| `perf`                      | Faster, same behaviour    | Performance      |
| `docs`                      | Documentation             | Docs             |
| `refactor`, `test`, `build` | Code users don't see      | Internal         |
| `chore`, `ci`, `style`      | Upkeep                    | Not shown        |

Scopes: `cockpit`, `statusline`, `hooks`, `tests`, `docs`, `release`, `tooling`, `ci`, `actions`, `deps`, `theme`.

`main` takes squash merges only, so a pull request's title becomes its commit and its changelog line: write it for a
user. The pull request template has the checklist.

## How a change ships

Nobody bumps a version or edits the changelog by hand. When a change lands on `main`, release-please adds it to the
open release pull request; merging that pull request tags the release and publishes its notes.
[Releasing](docs/development/releasing.md) has the details.

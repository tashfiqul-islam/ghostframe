# Phase 13: release-ready repo (README, About, releases, docs, tooling, compatibility)

> History: the brief for phase 13 (README, releases, docs, tooling), kept as written. The repository as it now stands supersedes it.

You are working in the ghostframe repo (D:\Projects\ghostframe, GitHub tashfiqul-islam/ghostframe). ghostframe is a Claude Code plugin with two features:

- **Cockpit**, the redesigned chat UI (merged in PR #23). Its design spec is currently docs/design/cockpit-v8.md.
- **The status line**, a two-row status line with an installer command, `/ghostframe-statusline install | uninstall | status` (merged in PR #25, squash title `feat(statusline): the ghostframe status line`). Its spec is docs/design/statusline.md, with screenshots in docs/design/statusline/. The status line's mark is a half-block ghost whose eyes turn green, amber and red with usage.

There is also a finished **brand kit** in docs/design/brand/, not yet committed. It's the source for every image in this phase; don't redraw or regenerate any of it. Read docs/design/brand/README.md first: it lists every file and how to use it. Highlights:

- the mascot (a hooded skull with gold eyes) and lockups with the "ghostframe" wordmark, for dark and light backgrounds;
- README headers: readme/readme-hero-dark.png and readme-hero-light.png;
- social/github-social-preview.png (1280×640), social/og-image.png and social/twitter-card.png;
- icons/ (favicons, app icons, site.webmanifest), avatar-1024.png and head.html for a future website.
  The tagline is "The cockpit for Claude Code." The mascot is the brand everywhere outside the terminal; inside Claude Code the status line keeps the half-block ghost.

The goal of this phase: make the repo look and run like a top-tier 2026 open-source project. That means a sharp README, a complete About section, an automated release pipeline with real tags and release notes, organized docs, light but useful repo tooling, and an honest compatibility story.

Naming and version, decided:

- This is ghostframe's first public release: **1.0.0**. There is no 0.x history for users. Any 0.x numbers in the repo (package.json, the plugin manifest, the "ghostframe v0.2.0" in the pane) were never released properly and become 1.0.0.
- The feature is **Cockpit**, with no version in its name. "v7", "v8" and similar were our internal design rounds. They must not appear anywhere a user can see them: UI strings, settings keys, commands, log and error messages, README, docs, release notes, the plugin manifest, the marketplace listing.
- Internal history stays honest: the spec keeps a short "Design history" note saying Cockpit went through several design rounds, and the older round documents move to docs/design/history/.

Rules for the whole phase:

- Work on a new branch, `chore/release-polish`, in a worktree. One PR. Conventional commit titles, as the CI already enforces.
- Do not create tags, GitHub Releases, or change repo settings (description, topics, rulesets, Discussions) until I approve. Prepare them, show me the exact commands, and wait.
- Do not add a dependency or service without telling me why. Prefer what is already in the repo.
- Verify every claim you put in the docs: commands, versions, keys, file paths, Claude Code behaviour. If you can't verify something, leave it out or mark it untested. Check current Claude Code docs (code.claude.com/docs) for anything about plugins, marketplaces, hooks or the status line. Don't rely on memory.
- Writing style for all docs: plain, specific, short sentences, no hype words, no emoji walls. Say what a thing does and how to use it.

## Stage 0: audit first, then report and wait

Inventory what exists, then report gaps before writing anything:

- README.md, LICENSE, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- docs/ (design/, superpowers/ and anything else) and which files are current, superseded (cockpit v7 docs) or working notes
- .claude-plugin/ manifests (plugin.json, marketplace.json): name, version, description, keywords
- package.json scripts and version, and where else a version number lives
- .github/: workflows, actions, templates, CODEOWNERS, dependabot/renovate config
- existing git tags and GitHub Releases (`git tag`, `gh release list`), and the repo About (`gh repo view --json description,homepageUrl,repositoryTopics`)
- tools/live (the harness): how to run it, what it outputs
- untracked files: run `git status --short` and list every untracked file, especially in docs/design/. Expect the brand kit plus working files from the status line and brand work: statusline-preview.ts (the reference renderer), statusline-live.ts (a copy of the user's personal status line script, which still holds dead Sixel code), statusline-prompt.md, mark-test.ts, sixel-test.ts, and any older prompt files. For each, propose: commit as is, move to docs/design/history/, or delete. Delete nothing until I approve, and never delete the brand kit.

Report this as a short table: item, exists?, state, proposed action. Also propose:

- every place "v7", "v8" or a 0.x version shows up, as a list: file, line, user-facing or internal, proposed new name. Include code identifiers, file names, settings keys, test names and the harness. User-facing ones must change. For internal ones, propose renames where they're cheap and safe, and keep anything that would break a user's existing settings (list those separately with a migration plan: read the old key, write the new one).
- whether any tags or GitHub Releases already exist. If 0.x tags exist, leave them in place (never delete or move a published tag) and tell me; the 1.0.0 changelog starts fresh either way.

Stop and wait for my go-ahead after the report.

## Stage 1: versioning and release pipeline

- One version, everywhere: package.json, .claude-plugin/plugin.json, the marketplace entry, and the version Cockpit shows in the pane (currently "ghostframe v0.2.0", which becomes 1.0.0). Make it read from one place, or keep them in sync automatically.
- Do the naming cleanup from the Stage 0 list here, in its own commits: user-facing strings first, then internal renames, then any settings migration with a test.
- Automate releases with release-please (googleapis/release-please-action), driven by the conventional commits we already use:
  - a release PR that bumps every version file and updates CHANGELOG.md;
  - merging it creates the tag `vX.Y.Z` and the GitHub Release.
  - Configure changelog sections (Features, Fixes, Performance, Docs, Internal), and hide chore/ci noise.
- Release notes: generated notes are the floor, not the ceiling. For 1.0.0, write a human summary on top: what ghostframe and Cockpit are, three to five highlights with one screenshot each, requirements, how to install, and known limits (link to the spec's known-limits section). It's a first release, so no upgrade or breaking-changes section.
- Add a `release:dry` script or documented command that shows what the next release would be.
- The first release must come out as 1.0.0: set it with release-please's `release-as: 1.0.0` (or a `Release-As: 1.0.0` commit footer), then remove that setting after the release so later versions follow the commits.
- PR #23 was squash-merged with a title that mentions "v8". Don't rewrite main or force-push to fix it. Instead, check what release-please would write for that commit. If "v8" would appear, add a `BEGIN_COMMIT_OVERRIDE` / `END_COMMIT_OVERRIDE` block to PR #23's description with the entry `feat(cockpit): Cockpit, the redesigned chat UI`. Then confirm with the dry run that the changelog uses it. Do the same for any other commit since the last tag whose changelog line would show a design-round number. Show me the override text before you edit the PR.
- Prepare, but don't run: the 1.0.0 release.

## Stage 2: README

Rewrite README.md as the front door. Structure:

1. Wordmark/hero image (dark and light variants with a `<picture>` element), a one-line description, and a small badge row: CI, latest release, license, the Claude Code version it's tested with. No more than five badges.
   Use the brand kit's README header for this: docs/design/brand/readme/readme-hero-dark.png and readme-hero-light.png in a `<picture>` element. The snippet is in docs/design/brand/README.md. Don't make a new wordmark image.
2. A hero screenshot of Cockpit at 200 columns, docked pane, mid-turn, with the new status line visible at the bottom. Make screenshots from the harness: render its HTML captures to PNG with Playwright at 2x. Keep the source captures and a script under docs/assets/ so the images can be regenerated. The status line has landed, so the shots must show it as it ships, installed with `/ghostframe-statusline install`.
3. What it is, in three or four sentences.
4. Features, grouped:
   - Cockpit: the turn timeline on the left, the pane and its tabs (Timeline, Files, Sources, Todo, Agents), receipts and failure cards, fallback mode without the pane, rewind.
   - The status line: model and effort, repo and branch, changes or the PR that needs you, context, 5-hour and week budgets with pace and reset times, and the ghost whose eyes show the pressure. Include one screenshot from docs/design/statusline/.

   One line each, with a link to the guide.

5. Install: the exact marketplace and plugin commands, verified against current Claude Code docs. Then the status line, which needs its own one-time step: `/ghostframe-statusline install`, and how to undo it. Include requirements: Claude Code version, OS, terminal, font (a Nerd Font for the status line's icons, which can be turned off), minimum width, and Bun for the status line.
6. Quick start: the five keys someone needs in the first minute.
7. Compatibility: a short summary linking to docs/guide/compatibility.md (Stage 5).
8. How it works: a short architecture overview with a Mermaid diagram (engine hooks → store → renderers → left/pane/band). Link to docs/architecture.md.
9. Docs index, Development (bun install, test, the live harness), Contributing, License.

Also state plainly: ghostframe never reads, stores or sends your credentials or tokens. It runs inside your own Claude Code session and changes how it's displayed. Check that this is true in the code before writing it.

## Stage 3: About section and repo presentation (prepare, then wait for approval)

Prepare the exact `gh repo edit` commands for:

- the description (one line, under 120 characters);
- the homepage (the docs index or the latest release);
- 8 to 12 topics, for example claude-code, claude-code-plugin, terminal-ui, tui, developer-tools, ai-agents, bun, typescript.

Also:

- The social preview already exists: docs/design/brand/social/github-social-preview.png. Don't make another one. I'll upload it myself, since the API can't set it. Remind me where it is in your report, and remind me to set avatar-1024.png as the profile picture.
- Propose whether to enable Discussions (Q&A and Show and tell) and whether to pin the release.

## Stage 4: docs/

Reorganize into a structure someone can navigate:

```
docs/
  README.md             index: what's where
  guide/                install, usage, keys, configuration, troubleshooting, compatibility
  architecture.md       data flow, the engine boundary, renderers, the store, performance budgets
  decisions/            short ADRs (context, decision, consequences) for decisions already made
  design/               cockpit.md (the spec, renamed from cockpit-v8.md, with a short "Design history" note); statusline.md and statusline/ (as merged); brand/ (the brand kit, unchanged); older round documents and the working files I approve from Stage 0 moved to design/history/, each with a one-line note at the top saying what it was and what superseded it
  development/          testing, the live harness (tools/live), release process
  assets/               images and the screenshot script
```

- ADRs: write one each for decisions we already made. Keep each under a page.
  - New renderers on the same engine layer.
  - Waiting on agents: shown in the pane head when docked, in the band only in fallback.
  - NEEDS YOU removed from the left.
  - The hint row on the pane's second-to-last row.
  - Files counts as a known limit.
  - Sources titles: never invent a page title.
  - Outside-project files are listed but never diffed.
  - The status line ships as an installed command, not as part of the plugin, because Claude Code reads statusLine only from settings. The installer asks before writing, keeps a backup, and Cancel changes nothing.
  - The status line's mark is a half-block ghost, not the mascot image: Claude Code's status line parser keeps only colour and link escapes, so Sixel and cursor codes never reach the terminal (statusline.md has the evidence). The eyes show the highest budget: green under 60%, amber 60 to 84%, red from 85%.
  - The status line runs on Bun, not compiled executables (same speed, 115 MB each); it respects NO_COLOR.
  - The brand: the mascot outside the terminal, the ghost inside it.
- docs/superpowers/ holds working plans. Move them to docs/development/plans/ or an archive, and say which in the index. Don't delete anything.
- Fix every internal link, and add a link checker to CI (Stage 5).

## Stage 5: repo tooling (light, useful, no bloat)

Add only what's missing. Keep everything that already works.

- CONTRIBUTING.md: setup, tests, the harness, commit style, how releases happen.
- SECURITY.md: how to report a vulnerability.
- Issue templates (GitHub issue forms):
  - bug: OS, terminal, Claude Code version, ghostframe version, terminal width, a screenshot or harness capture, and whether fallback or docked;
  - feature request.

  Plus a config.yml that points questions to Discussions, if those are enabled.

- A PR template with a short checklist: tests, harness at 200/100, spec updated, screenshots.
- CODEOWNERS, .editorconfig, .gitattributes (line endings for .sh and .ps1).
- CI additions:
  - markdown lint and a link check (lychee) on docs;
  - a scheduled weekly job that installs the latest Claude Code and runs the unit tests plus whatever part of the harness can run headless.

  ghostframe depends on engine internals, so we want to hear about an engine change from CI, not from a broken session.

- Cross-platform CI: run the unit tests on ubuntu-latest, macos-latest and windows-latest. ghostframe has only been run live on Windows so far. Also run the live harness once on macOS or Linux (node-pty works on both), and fix or document what differs: paths, shell command parsing (bash/zsh as well as PowerShell), key chords, and terminals without true colour (macOS Terminal.app).
- Engine drift guard: if there's no startup check yet, propose one. At startup, compare the running Claude Code version with the tested range. Outside the range, log it and fall back to the plain UI instead of drawing a broken one. Show me the design before building it.
- Dependency updates: check whether Dependabot or Renovate is configured. If neither is, propose Dependabot for npm and GitHub Actions, grouped weekly. Don't add Renovate.
- Branch protection: propose a ruleset for main (require the CI checks, linear history, no force-push). Show me the `gh api` call, and don't apply it.

## Stage 6: compatibility guide (docs/guide/compatibility.md)

Be precise about where ghostframe runs. Verify each claim, and mark anything you couldn't test as untested.

- **Platforms:** mark Windows, macOS and Linux each as tested, CI-only or untested, honestly. For the status line, Windows is live-tested and macOS and Linux are CI-only (the specs pass there). Say so.
- **ghostframe is part of Claude Code itself.** It runs wherever the official `claude` CLI runs in a terminal:
  - Windows Terminal, PowerShell and cmd;
  - macOS and Linux terminals;
  - the integrated terminals of VS Code, Cursor and JetBrains IDEs;
  - terminal-hosting agent IDEs like Orca (onorca.dev), which run the real `claude` binary in their own terminal panes.

  For each, note what to check:
  - true colour;
  - font and icon glyphs: harness captures show the status line's icons as empty boxes without a Nerd Font, so document the font requirement and check the fallback;
  - emoji and grapheme width;
  - minimum columns;
  - mouse;
  - key chords the host may intercept (ctrl+x chords, ctrl+o, tab), with a workaround or a remap if one exists.

- **It does not run in other agent harnesses** such as OpenCode, Codex, Cline, OpenClaw or Goose. They have their own UI and don't load Claude Code plugins. Say this in one sentence; don't attempt a port.
- **Claude Code surfaces:** check which ones load plugins and draw this UI:
  - the terminal CLI;
  - the VS Code extension's graphical panel;
  - the desktop and web apps.

  Document only what's true.

- **Subscriptions:** add a short, factual note.
  - ghostframe doesn't change how you sign in. It works with whatever Claude Code is signed in with: a Claude subscription, an API key, or a cloud provider.
  - Anthropic's terms allow Claude subscription sign-in only in Claude Code and Anthropic's own apps, so running Claude Code inside a host like Orca is fine. Signing a third-party harness in with your subscription is a different matter and isn't something ghostframe does or needs. Link to code.claude.com/docs/en/legal-and-compliance rather than paraphrasing the policy at length.

## Stage 7: verify and report

- Search the whole repo once more for user-visible "v7", "v8" and "0.2" and confirm none are left (list any you kept on purpose, with the reason). hooks/README.md says "Cockpit v8" today; it must change.
- Run the unit tests and the link check. Render the README with `gh markdown-preview` or by pushing the branch and opening it on GitHub. Check that every image loads in dark and light themes.
- Run the release-please dry run and show me the changelog it would produce. It should have one clean entry each for Cockpit and the status line.
- Open the PR and wait for CI.
- Report:
  - a table of files added, changed and moved;
  - the PR link;
  - the prepared commands still waiting on my approval (tags, release, gh repo edit, ruleset, Discussions);
  - anything you couldn't verify.

Don't merge.

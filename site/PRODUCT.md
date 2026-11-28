# Product

<!-- impeccable:product-schema 1 -->

<!-- Written by /impeccable init from docs/development/website-brief.md, docs/design/website/stack.md, its GLOSSARY.md
     and handoff/HANDOFF.md. The owner confirms or corrects it in review. It holds no numbers on purpose: every fact
     (version, Claude Code range, commands, thresholds) comes from the repository through build/site-data. -->

## Platform

web

## Users

Developers who live in the terminal with Claude Code all day. They are sharp, allergic to marketing, and impressed by
craft, speed and honesty. They arrive from the README, a shared screenshot or a search, want to see what ghostframe
does to their terminal, and leave with the install command. Coding agents reading `/llms.txt` and the Markdown copies
are a second audience.

## Product Purpose

The website for ghostframe, an open-source plugin that changes how Claude Code looks and feels in the terminal. It runs
inside the user's own Claude Code session and has two parts: Cockpit, a redesigned chat UI (a turn timeline, a docked
side pane with five tabs, receipts and failure cards, rewind, a fallback for narrow terminals), and the status line
(two rows: model and repo, then three budget tiles with meters, and a pixel ghost whose eyes change colour with
pressure). The site succeeds when a visitor understands both parts from the real output and copies the install
command.

## Positioning

The site shows the product's own output, rebuilt as live text on the terminal's cell grid, not screenshots or
illustrations. Its concept is "the ghost in the frame": the mascot outside the terminal, the pixel ghost inside it,
and one frame that travels down the page from the lens over the mascot to the slot that holds the ghost.

## Operating Context

- Read on desktop at 1440 and on phones at 390, with every width from 320 to 1920 working.
- A static site on Cloudflare Workers static assets; no server, no analytics script, no third-party request.
- One landing page, the release notes at `/releases/` with an Atom feed, and a 404.

## Capabilities and Constraints

- Facts on the page come from the repository at build time; a wrong fact fails the build.
- Release notes come from release-please only. Internal names (spec versions, phases, spec section numbers) never
  appear on the site.
- ghostframe runs wherever the official Claude Code CLI runs, and not in other agent harnesses.
- Undecided: the domain (the Workers default address stands in, in `src/site.ts`).

## Brand Commitments

- The brand assets in `docs/design/brand` are final and ship as exported: the mascot (and its green, amber and red
  eye-state files), the lockups, the wordmark, the icons and the social cards.
- Wordmark: "ghostframe", all lowercase. Tagline: "The cockpit for Claude Code."
- Voice: plain, specific, short sentences, active voice, sentence case, numerals for counts. No hype words, no emoji.
- Dark only for 1.0.0.

## Evidence on Hand

- The product's real output: `docs/design/cockpit.md`, `docs/design/statusline.md`, the scripted session in
  `docs/design/website/handoff/build/session.ts`.
- The release notes: release-please's `CHANGELOG.md`; commit counts from git.
- None of: testimonials, customer logos, download counts, star counts, benchmarks beyond the repository's own. Never
  fabricate them.

## Product Principles

1. Show the real thing. Every visual is the product's own output or the brand's own art.
2. Every fact is provable from the repository, and the build checks it.
3. Craft and speed over spectacle: nothing slows the headline, and every animation explains or rewards something.
4. Talk to engineers: say what a thing does, then stop.

## Accessibility & Inclusion

WCAG 2.2 AA on every page: axe clean, full keyboard use with the gold focus ring, a pause control and a text version
for the demo, labelled meters, and the whole story intact under reduced motion or with ambient motion off.

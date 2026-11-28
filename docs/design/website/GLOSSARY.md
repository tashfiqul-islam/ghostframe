# ghostframe website

The words the website's design, code and tests use for its parts, named as the design names them. Each section is a
folder in `site/src/`. Terms that belong to the product itself (session, turn, step, pane, status line) mean what they
mean in Cockpit and the status line; here they name the site's rebuilt copies. Values (sizes, timings, thresholds) live
in the design and in `tokens.css`, not here.

## The page

**Landing page**:
The one long page at `/`, a run of sections from the hero to the footer.
_Avoid_: home, index, marketing page

**Section**:
One numbered part of the landing page, opened by a title block: the hero, the demo, Cockpit features, the status
line, install, compatibility, how it works, privacy and the FAQ.

**Cockpit features**:
The section that shows each part of Cockpit with a cropped piece of its real output.

**Compatibility matrix**:
The section that says where ghostframe runs, marked tested, CI only, untested or does not run.

**How it works**:
The section with the diagram of the path from the engine's hooks to the timeline, the pane and the status line.

**Privacy statement**:
The section that says what ghostframe does and does not do with a session.

**FAQ**:
The section of questions and answers, each answer opening under its question.

**Title block**:
The band that opens a section, with its file number, name and count on the left and its row range on the right.

**Section label**:
The small uppercase mono label above a heading.
_Avoid_: eyebrow, kicker

**Heading echo**:
Two thin bands of a heading that slide in and settle from time to time while it is in view.

**Cell grid**:
The terminal character grid everything on the site sits on.
_Avoid_: baseline grid

**Ruler**:
The column scale under the nav and the row scale down the left edge.

**Readout**:
A live mono figure that reports a position: the pointer's column and row, the frame's cell, or the page's row.

**Words**:
The site's own sentences and labels, each with an optional shorter form for phones.
_Avoid_: copy (the copy button owns that word), strings

## Navigation

**Nav**:
The bar at the top with the numbered section links, the version chip, Install and the icon links.

**Nav frame**:
The small frame with four gold corners that slides to the link under the pointer or focus.
_Avoid_: indicator, highlight

**Docked bar**:
The nav gathered into one framed strip fixed near the top once the page has scrolled. The design says "docks" for this
and for the frame coming to rest in the slot; the glossary keeps the two apart.
_Avoid_: dock, sticky header

**Progress line**:
The thin gold line along the docked bar that shows how far down the page you are.

**Menu sheet**:
The full-screen menu on phones.
_Avoid_: drawer, dropdown

**Label decode**:
Characters of a label resolving left to right from a fixed glyph set, once.

## The frame

**Frame**:
The one rectangle with four gold corner brackets that the page is built around. It is the lens in the hero, the
border of the terminal in the demo, the outline of the context tile in the status section, and the slot at the end.

**Lens**:
The frame in the hero, following the pointer cell by cell over the mascot.

**Crosshair**:
The two hairlines that follow the pointer over the hero.

**Journey**:
The frame's travel down the page as you scroll: lens, terminal, context tile, slot.

**Slot**:
The place in the status rail that holds the ghost, where the frame comes to rest.

## The mascot and the ghost

**Mascot**:
The hooded skull with gold eyes, the brand outside the terminal.

**Ghost**:
The tiny half-block pixel ghost the status line draws inside the terminal.
_Avoid_: pixel mascot, small mascot

**Eyes**:
The mascot's and the ghost's eyes, whose colour is the eye state.

**Eye state**:
The colour the eyes and the status tiles share: gold (the brand, at rest), calm, busy or hot.
_Avoid_: theme, mood

**Threshold**:
One of the two usages where the eye state changes, as the status line defines them.

**Eye slip**:
The eyes' brief dip to the hot state, now and then, on their own.

**Glyph field**:
The mascot drawn in terminal characters behind the hero.

**Scan band**:
The soft cold band that drifts down the glyph field.

## The demo

**Demo**:
The live Cockpit terminal on the landing page, playing a scripted session.
_Avoid_: video, player, screenshot

**Session**:
The scripted Claude Code turn the demo plays.

**Turn**:
One prompt and everything the agent did for it.

**Step**:
One line of the turn's timeline: a glyph, a title, a time bar and a result.

**Pane**:
The right half of the terminal, with its tabs.

**Receipt**:
The one-line summary that lands when the turn ends.

**Text version**:
The plain HTML version of the turn that "Read as text" shows.
_Avoid_: transcript, alt text

## The status line

**Status line**:
The two rows at the bottom of the terminal: model, repo and lines on top, three budget tiles below.

**Status rail**:
The status line drawn along the bottom of the hero and docked under the page, with the slot. The design says "rail"
for this and for the release notes' sticky column; the glossary keeps the two apart.
_Avoid_: rail (on its own)

**Tile**:
One budget in the status line: context, 5-hour or week, with its meter.

**Meter**:
The row of segments inside a tile, filled to the budget's percentage.

**Pace marker**:
The block in a meter that marks an even pace.

**Usage slider**:
The control in the status section that sets the context usage, so visitors watch the tile and the eyes change.

## Install

**Command block**:
A copyable command in a well, with its copy button.

**Copy button**:
The button in a command block, in one of three copy states: idle, copied, or blocked (the clipboard refused, so the
command is selected for the visitor to copy).

**Terminal tabs**:
The tabs over the install commands, one per terminal.

**Meters boot**:
The meters drawing in segment by segment after a copy in the install section.

## Motion

**Boot curtain**:
The sequence played over the hero stage on a visitor's first page view in a session.
_Avoid_: loader, splash, intro

**Ambient motion**:
The looping accents that run without being asked: eye slip, heading echo, scan band, carets. The visitor can turn
them off.

## Release notes

**Release notes**:
The page at `/releases/` with one entry per version, newest first, and its Atom feed.
_Avoid_: changelog page, releases page

**Release**:
One version's entry: its state, title, summary, highlights, groups of changes, requirements and known limits.

**Release state**:
Whether a release is tagged: on main and not tagged yet, the latest, or a plain date.

**Group**:
One kind of change in a release, as release-please names it: Features, Fixes, Performance, Docs or Internal.
_Avoid_: section, category

**Change row**:
One change: its scope, its sentence, its pull request and its commit.

**Highlight**:
One of a release's headline changes, shown with a cropped piece of real output.

**Filter chip**:
A toggle in the filter bar that shows one group.

**Release rail**:
The sticky column beside a release with one link per part, and its marker.
_Avoid_: rail (on its own), sidebar, table of contents

**Road to 1.0.0**:
The per-day bar chart of commits before the first release.

## 404

**Search frame**:
The frame on the 404 that shows the grid and the ghost only inside it, following the pointer until it finds the
ghost.

## Footer

**Footer**:
The end of every page: the large wordmark, the links, the licence, the ambient motion switch and the watching mascot.

**Footer light**:
The two radial lights that follow the pointer over the footer.

## Facts

**Fact**:
Something the site states about ghostframe that the repository can prove: the version, the install commands, the
supported Claude Code range, the requirements, the thresholds, where it is tested.
_Avoid_: claim, copy

**Site input**:
A file in the repository the site reads its facts and release notes from.
_Avoid_: source, dependency

**Internal name**:
A name used inside the project that must never appear on the site: spec versions, phases, spec section numbers.

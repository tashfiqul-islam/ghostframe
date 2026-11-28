# Design reviews

Three skills, one role each, as the brief asked. This file records what each pass ran, what it flagged and what
changed. Everything was run against the pages in `reference/`.

## Impeccable: critique and audit

The skill's launcher would not execute in the design environment (permission denied), so its detector and screenshot
commands did not run. Its playbooks (`critique`, `audit`, `craft-floor`, `polish`) were read and followed by hand,
with Playwright, axe-core and a custom contrast script standing in for the detector.

| Step                      | Flagged                                                                                          | Changed                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Critique, hierarchy       | Early landing page read as a wall of text                                                        | Copy cut by about half; schematics, callouts, meters and diagrams carry the explanation                    |
| Critique, distinctiveness | Directions A to C read as familiar developer-tool pages                                          | Replaced by The Frame: one object that is lens, terminal, meter and slot                                   |
| Critique, motion quality  | The first eye jitter read as cheap                                                               | Rebuilt as one eased slip: dip, crossfade, 1.2% swell, one sweep line                                      |
| Audit, contrast           | Brief's muted `#6E6A7A` is 3.7:1; terminal dims below 4.5:1; two storyboard tiles at 30% opacity | Labels `#8C8899`, ruler numerals `#7F7B8B`, terminal dims lifted, storyboard tiles redrawn without opacity |
| Audit, ARIA               | A meter with no value; a hidden link in the tab order; tabs without roving focus or a panel      | `role="img"` with a label for the unknown meter; `tabindex="-1"`; roving `tabindex`, `role="tabpanel"`     |
| Audit, touch targets      | Nav links 16 px tall, footer links 21 px, the 390 version chip 22 px, the 404 link 19 px         | All at least 24 px at 1440 and 44 px at 390                                                                |
| Audit, performance        | Two 600 KB noise images; CSS-blurred duplicates of a 430 KB field image competing for LCP        | 18 KB tiles; the field drawn on canvas from 6.7 KB of data                                                 |
| Audit, performance        | The boot curtain's copy of the mascot sometimes became a late LCP entry at about 1.8 s           | That copy is now a canvas; two heavy curtain layers stay out of the first paint                            |
| Audit, images             | Lazy images without dimensions never loaded inside positioned boxes                              | Every image has `width` and `height`                                                                       |
| Audit, motion sensitivity | Looping accents run longer than 5 s with no way to stop them                                     | The ambient motion switch in the footer                                                                    |
| Audit, clipping           | Token strip, schematic labels, headings near edge lines, mobile title bands wrapping             | Each fixed and re-rendered                                                                                 |
| Polish, truth             | Placeholders for facts that could be checked                                                     | Checked against the repository at `6def5fb` and filled; one remains because it does not exist yet          |

Not run: the launcher's own detector (`impeccable detect`) and its `shot` command.

## Emil Kowalski: motion review

| Before                                                       | After                                                               | Why                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Eye jitter: quick stepped jumps                              | One slip: 65 ms crossfade in, `scale(1.012)` held, 250 ms ease back | A shake reads as an error; one eased move reads as intent           |
| Loader hid the page until the sequence ended                 | A curtain over a painted page; any input ends it; once per session  | The page must be usable at once; a repeated moment earns no delight |
| Accordion animated height                                    | The row opens at once; the answer fades in and rises 4 px           | Only `transform` and `opacity` animate                              |
| `a:hover` applied on every device                            | Inside `@media (hover: hover) and (pointer: fine)`                  | Touch devices fire hover on tap                                     |
| Curtain layers animated from `opacity: 0` in the first frame | `visibility: hidden` until each layer's first visible moment        | An invisible animated layer still costs a first paint               |

Checked and kept as they were:

- Pointer-driven motion (lens, pupils, footer lights, 404 frame) is a CSS transition on `transform`, written by
  script on the element itself, so it can be interrupted and retargeted. No CSS variables on a parent.
- The crosshair has no easing. It is an instrument and reports where the pointer is.
- Buttons scale to 0.97 over 140 ms on `:active`.
- Two custom curves, no `ease-in`, no `transition: all`, nothing from `scale(0)`.
- Durations: 140 ms press, 240 ms state, 320 to 520 ms for the frame, lights and pupils (decorative tracking, not UI).
- Tabs and the accordion do not animate when driven from the keyboard.
- Ambient accents are rare: 13 s, 24 s and 9 s cycles.
- Reduced motion turns every keyframe off; the frame jumps to its cell; every state stays reachable.

## Vercel Web Interface Guidelines: audit of the built reference

Run against the eight page-level files in `reference/`. Findings, then status.

```text
## reference/*.html (shared shell)

- missing color-scheme: dark on <html>                          fixed
- missing <meta name="theme-color">                             fixed
- headings without text-wrap: balance                           fixed
- numbers without tabular-nums                                  fixed
- no skip link on 6 of 8 pages                                  fixed
- a:hover not gated to hover-capable pointers                   fixed
- buttons without a hover state                                 fixed
- no touch-action: manipulation, tap highlight unset            fixed
- brand name and terminal text without translate="no"           fixed (on <pre>; brand name in the build)
- hero image without fetchpriority="high"                       fixed
- below-fold images without loading="lazy"                      fixed
- images without width and height                               fixed
- autoplay motion over 5 s without a pause control              fixed (ambient motion switch)
- font preload missing                                          build only: preload fails from file:// so the reference omits it
- scroll-margin-top on heading anchors                          rule present; anchors are wired in the build
- safe-area insets on full-bleed bands                          build only (HANDOFF.md, section 9)
- URL reflects state (install tab, demo tab)                    build: ?terminal= and ?pane= query params, replaceState

## reference/Page-1440-a.html, Page-390-a.html

- slider: role, value, label present                            pass
- tabs: no roving tabindex, no tabpanel                         fixed

## reference/Boot.html

- "........" leader dots                                        pass: decorative, inside aria-hidden
- animates clip-path and visibility                             accepted: curtain only, documented in HANDOFF.md section 10

## reference/NotFound.html, Footer.html, D-hero.html

✓ pass

Anti-patterns: no transition: all, no outline: none, no zoom lock, no div click handlers, no images without dimensions.
```

Title Case for headings and buttons is the one guideline the brief overrides: the brand voice is sentence case.

## Second pass: nav, release notes, icons

Research first: current changelog pages converge on a visible summary line per entry, a date or version anchor, a
sticky rail, category filters and New, Improved, Fixed style groups; current headers run open at the top and gather
into a floating bar on scroll, with one indicator that follows the pointer and then the section in view. Both were
rebuilt in The Frame's language instead of copied: square, on the cell grid, gold corners, no rounded pill.

| Skill pass          | Flagged                                                                           | Changed                                                                                      |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Impeccable critique | The old nav was a row of five text links, one of them a host's name               | Four numbered links in a track, icon buttons, a version chip that leads to the release notes |
| Impeccable critique | Release notes on a single version could read as empty                             | The entry carries highlights, the grouped commits and the eleven-day build history           |
| Impeccable audit    | Mobile filter chips overflowed the viewport; pull request links blended into text | Chips wrap to two rows; links are underlined                                                 |
| Impeccable audit    | The rail did not stick: the page root clipped with `overflow: hidden`             | `overflow: clip`                                                                             |
| Emil, motion        | A sliding indicator must not animate `left` or `width`                            | One element moved by `transform`; its width snaps; duration 0 from the keyboard              |
| Emil, motion        | A decode on every hover could feel slow                                           | Four frames, 120 ms, fine pointers only, off with reduced or ambient motion                  |
| Emil, motion        | Row readout and progress line easing behind the scroll                            | No easing; written once a frame                                                              |
| Vercel guidelines   | Icon-only buttons need names; the docked bar must not take focus while hidden     | `aria-label` on each; `inert` until shown                                                    |
| Vercel guidelines   | Filter state not in the URL                                                       | `?show=` in the build (HANDOFF.md, section 16)                                               |

The GitHub mark is not redrawn in the reference. A neutral branch glyph holds its place, and the build uses the
official asset.

## What the tests say

On the final reference: 0 console errors, 0 overflowing or clipped text, 0 axe violations across 17 pages, 0 contrast
failures, 30 of 30 behaviour checks.

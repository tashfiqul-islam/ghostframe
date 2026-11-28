---
name: ghostframe
description: The cockpit for Claude Code.
colors:
  bg: '#0b0b0e'
  bg-deep: '#060608'
  surface-1: '#111117'
  surface-2: '#17171f'
  line-1: '#1e1d24'
  line-2: '#2a2a34'
  line-3: '#3a3a47'
  text: '#eceaf2'
  text-2: '#8c8899'
  text-3: '#7f7b8b'
  gold: '#ffc83d'
  gold-hi: '#fff3c9'
  gold-lo: '#ffa21a'
  calm: '#7ec8be'
  calm-eye: '#5beba6'
  busy: '#e8b98a'
  busy-eye: '#fab387'
  hot: '#ec84a0'
  hot-eye: '#d7263d'
typography:
  display:
    fontFamily: 'Hanken Grotesk, Hanken Fallback, system-ui, sans-serif'
    fontSize: '64px'
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: '-0.04em'
  title:
    fontFamily: 'Hanken Grotesk, Hanken Fallback, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: '-0.015em'
  lead:
    fontFamily: 'Hanken Grotesk, Hanken Fallback, system-ui, sans-serif'
    fontSize: '22px'
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: 'Hanken Grotesk, Hanken Fallback, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: 'JetBrains Mono, Julia Glyphs, Mono Fallback, ui-monospace, monospace'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'JetBrains Mono, Julia Glyphs, Mono Fallback, ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 400
    letterSpacing: '0.13em'
rounded:
  frame: '0px'
  chip: '4px'
  button: '6px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '16px'
  '4': '24px'
  '5': '32px'
  '6': '48px'
  '7': '64px'
  '8': '96px'
components:
  button-primary:
    backgroundColor: '{colors.gold}'
    textColor: '{colors.bg}'
    rounded: '{rounded.button}'
  button-secondary:
    backgroundColor: '{colors.surface-1}'
    textColor: '{colors.text}'
    rounded: '{rounded.button}'
  command-block:
    backgroundColor: '{colors.bg-deep}'
    textColor: '{colors.text}'
    typography: '{typography.mono}'
    rounded: '{rounded.button}'
  version-chip:
    backgroundColor: '{colors.surface-1}'
    textColor: '{colors.text}'
    typography: '{typography.label}'
    rounded: '{rounded.chip}'
  tile:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.text}'
    rounded: '{rounded.frame}'
---

<!-- Written by /impeccable document from src/styles/tokens.css, the Components artboard
     (docs/design/website/Components.dc.html, files 11 to 14), docs/design/website/handoff/HANDOFF.md and
     docs/design/website/stack.md. This file describes that system; it is not a second source. src/styles/tokens.css
     is the only token source, and build/tokens holds the colours above to it. Where this file and the artboards,
     stack.md or the ADRs differ, they win. -->

# Design System: ghostframe

## Overview

**Creative North Star: "The ghost in the frame"**

One frame is the page's subject. A rectangle with four gold corner brackets is the lens over the mascot in the hero,
the border of the live terminal in the demo, the outline of the context tile in the status line, and the slot that
holds the pixel ghost at the end. Everything else is quiet around it: obsidian and graphite surfaces, hairline
structure, monospace detail, and one warm light, the gold eyes.

The feel is a high-end instrument panel, not a cyberpunk poster. Atmosphere comes from detail: a terminal cell grid
under everything, rulers and readouts that report real positions, scanlines at about 3% white, a glyph field behind
the mascot. Density is editorial: large display type, generous negative space, asymmetric layouts on a 12-column grid.

**Key Characteristics:**

- Every position sits on the terminal cell grid, `--cell-w` (8 px) wide and `--cell-h` (16 px) tall.
- Gold is rare and means something; the status colours mean a state.
- Real product output is the imagery: the terminal is live text, never a screenshot.
- Flat: depth is surface steps and hairlines, with one shadow, under the frame.
- Motion explains or answers; one object travels, the frame.

## Colors

A near-black, slightly violet neutral ramp, one gold light, and three status pairs borrowed from the product's meters.

### Primary

- **Eye Gold** (`gold`): the eyes, the primary button, focus rings, the frame's corners and the prompt mark. Nothing
  else.
- **Light Core** (`gold-hi`): the brightest centre of the eyes and the footer light.
- **Ember** (`gold-lo`): the depth under gold, in gradients only.

### Secondary

- **Calm** (`calm`, meters under the first threshold) and **Calm Eye** (`calm-eye`, the eyes, and "tested").
- **Busy** (`busy`, meters between the thresholds) and **Busy Eye** (`busy-eye`, the eyes, and "live").
- **Hot** (`hot`, meters past the second threshold, and failures) and **Hot Eye** (`hot-eye`, the eyes when hot).

### Neutral

- **Obsidian** (`bg`): the page. **Abyss** (`bg-deep`): wells, the rail.
- **Graphite** (`surface-1`): raised surfaces. **Slate** (`surface-2`): tiles and code.
- **Hairline** (`line-1`): hairlines. **Border** (`line-2`): borders and minor ticks. **Schematic** (`line-3`): major
  ticks and schematic lines.
- **Bone** (`text`): primary text. **Ash** (`text-2`): secondary text and labels. **Ruler Ash** (`text-3`): ruler
  numerals only.

### Named Rules

**The Five Golds Rule.** Gold is for the eyes, the primary button, focus rings, the frame's corners and the prompt
mark. A sixth use is a design change.

**The Meaning Rule.** Calm, busy and hot appear only where they report a state: a meter, an eye, a compatibility mark,
a release state.

## Typography

**Display Font:** Hanken Grotesk (with a metric-matched fallback)
**Body Font:** Hanken Grotesk
**Label/Mono Font:** JetBrains Mono (with Courier New metrics as the fallback, so the 0.6 em cell holds)

**Character:** a precise grotesk for what people say, a monospace for everything the machine says.

### Hierarchy

Each value below is written as its token name followed by the value in parentheses, and build/tokens holds every such
pair to `src/styles/tokens.css`.

- **Display**: weight `--weight-display` (800), size `--type-display` (64 px) at 1440 and `--type-display-phone` (40
  px) at 390, line height `--leading-display` (0.98), tracking `--track-display` (-0.04em). Section headlines. The
  hero headline is `--type-hero` (60 px) and `--type-hero-phone` (44 px).
- **Title**: weight `--weight-title` (700), size `--type-title` (24 px), line height `--leading-title` (1.15),
  tracking `--track-title` (-0.015em). Parts inside a section.
- **Lead**: weight `--weight-lead` (400), size `--type-lead` (22 px), line height `--leading-lead` (1.55). The
  sentence under a headline.
- **Body**: weight `--weight-body` (400), size `--type-body` (18 px), line height `--leading-body` (1.55). Prose, 60
  to 72 characters a line.
- **Mono**: weight `--weight-mono` (400) and `--weight-mono-medium` (500), size `--type-mono` (14 px), line height
  `--leading-mono` (1.6). Commands, terminal text, code. The terminal itself is 13.333 px, a `--cell-w` (8 px) advance.
- **Label**: mono, weight `--weight-label` (400), size `--type-label` (11 px), uppercase, tracking `--track-label`
  (0.13em). Section labels, chips, readouts.

### Named Rules

**The Machine Voice Rule.** If the terminal would print it (a command, a path, a number it reports), it is mono.

**The Tabular Rule.** Numbers use tabular figures; headings use balanced wrapping.

## Layout

The cell grid is `--cell-w` (8 px) by `--cell-h` (16 px). At 1440 the content is 160 columns, 1280 px inside 80 px margins, on 12 columns with `--space-4` (24 px)
gutters; the page edge lines run at x = 56 and x = 1383. Each section opens with a 36 px title block: its file
number, name and count on the left, its row range on the right. A column ruler runs under the nav and a row ruler down
the left edge.

Responsive rules (HANDOFF.md section 9): 1440 and up keeps the 1440 design centred; 1024 to 1439 scales the hero stage
and the demo by `width / 1440` and keeps the layout; 600 to 1023 is the 390 layout capped at 560 px; under 600 is the
390 design, fluid, with 20 px margins. No sideways page scroll from 320 up.

Three breakpoint tokens record these in `src/styles/tokens.css`, since a media query cannot read a custom property:
`--bp-narrow` (1023 px) is where the 390 layout starts below, `--bp-fluid` (599 px) is where 20 px margins start below,
and `--bp-pair` (768 px) is where two-column groups start from.

Spacing steps: `--space-1` (4 px), `--space-2` (8 px), `--space-3` (16 px), `--space-4` (24 px), `--space-5` (32 px),
`--space-6` (48 px), `--space-7` (64 px) and `--space-8` (96 px).

## Elevation & Depth

Flat. Surfaces step from Obsidian to Graphite to Slate, separated by hairlines. The one shadow sits under the frame.

**The Hairline Rule.** Separate with a 1 px line or a surface step, never a shadow.

## Shapes

**The Square Frame Rule.** Frames, tiles and title blocks are square, `--radius-frame` (0). Controls (buttons, wells) are
`--radius-button` (6 px), chips and keys `--radius-chip` (4 px). Nothing is a pill.

The frame: a 1 px inner outline at 18% white and four `--corner-frame` (16 px) gold corner brackets, `--corner-weight` (2 px) thick, 2 px outside the
rectangle. The brackets never scale with the frame.

## Components

### Buttons

- **Shape:** gently rounded, `--radius-button` (6 px).
- **Primary:** Eye Gold with Obsidian text. One per view: Install.
- **Secondary:** Graphite with a hairline outline and Bone text; ghost buttons drop the fill.
- **Hover / Focus:** hover styles only on fine pointers; a 2 px gold outline 3 px out on `:focus-visible`; presses
  scale to 0.97 in `--press` (140 ms).

### Chips

- **Style:** `--radius-chip` (4 px) radius, Graphite, mono label. The version chip carries a calm dot.
- **State:** filter chips are toggle buttons; one is always on.

### Command block

A well on Abyss with `--radius-button` (6 px), the gold prompt mark, the command in mono, and a COPY button in one of three copy states: idle,
copied (COPIED with a tick for 1.2 s), and blocked (the command selected, "SELECTED", announced).

### Navigation

An 80 px band: the lockup, four numbered links in one outlined 40 px track, the version chip, icon links and a quiet
outlined Install. The nav frame (40 px, Graphite, four `--corner-nav` (6 px) gold corners) slides to the link under the pointer in
`--move` (240 ms) and jumps from the keyboard. After 96 px of scroll the docked bar appears: 1088 by 56 px, fixed 12 px from the top, with four `--corner-dock` (12 px) gold corners,
with a progress line in gold. At 390 a menu button opens the menu sheet.

### Status tile

A square tile on Slate: a label, a percentage and a meter of 5 px segments with 3 px gaps, filled to the budget and
coloured by the eye state, with a pace marker.

## Do's and Don'ts

### Do:

- **Do** take every colour, space, radius, motion value and breakpoint from `src/styles/tokens.css`.
- **Do** snap every position the script sets to a multiple of `--cell-w` (8 px) horizontally and `--cell-h` (16 px) vertically.
- **Do** animate only `transform` and `opacity`, ease out with `--ease-out` (cubic-bezier(0.2, 0.8, 0.2, 1)), and keep anything the
  pointer drives a transition.
- **Do** keep a pause, a text version and a reduced-motion state that tells the whole story.

### Don't:

- **Don't** redraw, recolour or filter the brand art; the eye-state mascots are separate files.
- **Don't** use purple, blue or pink gradients, glassmorphism, icon-card grids, bento grids, orbs or blobs.
- **Don't** show testimonials, logos, download or star counts, or any number the repository cannot prove.
- **Don't** use `ease-in`, `transition: all`, bounce or elastic curves, or animate an action started from the keyboard.

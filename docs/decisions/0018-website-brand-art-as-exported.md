# 0018. The website ships brand art as exported, and inlines the hero mascot

Status: proposed.

## Context

The designer's acceptance list requires brand assets byte-identical to `docs/design/brand`. svgo would halve the
mascot (21 KB to 10.5 KB), but it rewrites the file, and the eye slip depends on the SVG's ids.

The hard constraint asks for the hero's LCP on text, not an image. Measured on spike A
([stack.md, spikes](../design/website/stack.md#spikes)): with the mascot as an `<img>`, mobile LCP was the mascot at
1,655 ms; with the same SVG inline in the HTML, LCP moved to the hero's lede at 757 ms, Lighthouse stayed 100 in all
four categories, and the page's HTML grew by 4.9 KB gzipped.

## Decision

Brand files are copied from `docs/design/brand` unchanged; no optimiser touches them, and a test compares their bytes.
The hero's mascot is inlined into the landing page's HTML, with its accessible name; every other copy is an `<img>`
with explicit size, lazy below the fold.

## Consequences

- The landing page's HTML carries the mascot (about 5 KB gzipped) on every visit; it cannot be cached apart from the
  page.
- A brand update is a copy, and the byte test proves nothing drifted.

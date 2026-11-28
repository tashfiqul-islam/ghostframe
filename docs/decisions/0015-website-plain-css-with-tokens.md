# 0015. The website is styled with plain CSS and one tokens file, not Tailwind

Status: proposed.

## Context

The brief suggested Tailwind v4 for shadcn/ui. With no component library (ADR 0014), Tailwind's main reason is gone.
The artboards carry 935 unique inline declarations, mostly raw pixel values on the 8 × 16 cell grid, so most utilities
would be arbitrary values (`left-[432px]`). Measured on the landing page's declarations
([styling research](../design/website/research/04-styling-fonts-and-images.md)): Tailwind 4.3.5 output 9.5 KB
gzipped, the same declarations hand-written 7.3 KB. Vite already minifies CSS with Lightning CSS.

## Decision

Styles are plain modern CSS: one `tokens.css` holding every design token from the Components artboard as custom
properties, cascade layers for order, nesting, and each component's CSS next to its markup. TypeScript reads a token
it needs with `getComputedStyle`; nothing duplicates the values.

## Consequences

- A diff against an artboard reads as the same numbers the artboard uses.
- No Tailwind upgrade path to follow; CSS features follow Baseline instead.
- If a component library returns, Tailwind returns with it; that is a new decision.

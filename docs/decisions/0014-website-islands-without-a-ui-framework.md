# 0014. The website's interactive pieces are plain TypeScript, with no UI framework

Status: proposed.

## Context

The brief suggested React islands with shadcn/ui. The design has 51 moving or interactive pieces
([inventory](../design/website/research/13-design-inventory.md)). Every one is CSS alone, a pointer handler that writes
`style.transform`, an `IntersectionObserver` that sets an attribute, or a button that toggles `hidden` or `aria-*`. The
largest, the demo, holds one integer, one pause flag and one tab id.

Measured on the same page ([stack.md, spikes](../design/website/stack.md#spikes)):

- plain TypeScript modules: 3.1 KB gzipped for the nav, hero, copy button and demo together;
- the demo as a React 19 island: 71.9 KB gzipped once the demo is in view, for the same behaviour;
- React with Base UI for tabs, accordion, slider, tooltip and dialog: 127.4 KB gzipped, over the 120 KB ceiling.

Native HTML covers the controls: `<details name>` for the accordion, `<dialog>` for the menu sheet,
`<input type="range">` for the usage slider, `popover` where it fits. Tabs need about 1 KB of TypeScript.

## Decision

No UI runtime ships. Each interactive piece is a TypeScript module loaded by the page that uses it, over markup the
build renders in its finished state. No shadcn/ui, no Base UI.

## Consequences

- Without JavaScript or with reduced motion, every piece shows its finished, readable state, because that is the HTML.
- If a piece later needs real client state (a demo that renders other sessions, a scrubbable timeline), Preact is the
  runner-up at 5.5 KB gzipped for a hello island; adding it is an island-level change, not a rewrite.
- Accessible patterns that a component library would supply (roving tabindex, focus return) are ours to test. The
  test strategy in stack.md covers them with Playwright and axe.

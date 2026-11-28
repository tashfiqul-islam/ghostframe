# Acceptance checklist

The site is done when every line here is true. Each line names how to check it.

## Looks like the design

- [ ] At 1440 the landing page matches `screenshots/landing-1440-part-1.png` and `part-2.png` section for section.
- [ ] At 390 it matches `screenshots/landing-390-part-1.png` and `part-2.png`.
- [ ] At 1024 and 768 it follows the rules in `HANDOFF.md`, section 9, with no clipped or overlapping text.
- [ ] `/releases` matches `screenshots/releases-1440.png` and `releases-390.png`.
- [ ] The nav matches `screenshots/nav-states.png` in all five states.
- [ ] The 404 matches `screenshots/404-1440.png`, and the ghost appears only inside the frame (`404-found.png`).
- [ ] Brand assets are byte-identical to `docs/design/brand`. Nothing is redrawn, tinted or filtered.
- [ ] Gold appears only on the eyes, the primary button, focus rings, the frame's corners and the prompt mark.
- [ ] Every frame position set by script is a multiple of 8 px across and 16 px down.
- [ ] Title-block row ranges are computed from real offsets at every breakpoint.

## Behaves like the design

- [ ] Nav: the frame indicator slides to the hovered link and back; it jumps from the keyboard; the bar docks after
      96 px, tracks the section in view and counts rows; the 390 menu traps focus and closes on `Esc`.
- [ ] Release notes: filters show one group; Internal opens; the rail sticks and its marker follows the heading in
      view; `f` reaches the filter.
- [ ] Hero: the frame follows the pointer cell by cell and returns on leave; the mascot does not move; pupils follow.
- [ ] The eye slip matches `filmstrips/slip-1..7`.
- [ ] The boot curtain matches `filmstrips/boot-01..14`, plays once per session, ends on any key, click, touch or
      wheel, and is absent under reduced motion and with ambient motion off.
- [ ] The demo plays `session.ts`, pauses, replays, and has a plain-text version. Its tabs work by pointer and keys.
- [ ] The slider changes numeral, tile, corners, ghost and mascot together at 60 and at 85.
- [ ] Copy buttons copy, say COPIED for 1.2 s, and announce it.
- [ ] The footer lights follow the pointer; the motion switch stops every loop and remembers the choice.
- [ ] Nothing animates in response to a keyboard action.
- [ ] Only `transform` and `opacity` animate outside the boot curtain.

## Accessibility: WCAG 2.2 AA

- [ ] axe-core: 0 violations on `/`, `/releases` and `/404` at 1440 and 390.
- [ ] Every text node passes contrast (`tools/contrast.py` logic, or axe with the overlays hidden).
- [ ] Keyboard: every control reachable in visual order; the focus ring is always visible; the skip link works.
- [ ] One `h1`; headings in order; `header`, `nav`, `main`, `footer` present.
- [ ] Touch targets: 44 x 44 px below 1024, 24 x 24 px above.
- [ ] `prefers-reduced-motion`: no loops, no curtain, no scroll-scrubbed motion; every state is still reachable.
- [ ] 200% zoom and 320 px width: no horizontal page scroll, nothing lost.
- [ ] A screen reader reads each heading once and the demo as text.

## Performance

- [ ] Lighthouse 95 or more in all four categories, desktop and mobile, on `/`, `/releases/` and `/404.html` (`lighthouserc.json`).
- [ ] LCP under 1.8 s. The LCP element is the hero mascot or the headline, never the curtain.
- [ ] CLS is 0.
- [ ] First-load JavaScript is 120 KB or less. No React before the demo scrolls into view.
- [ ] No third-party requests. Two font files.

## Truth

- [ ] `astro build` fails while any `FROM_REPO` value is unresolved.
- [ ] The install commands on the page are the ones in the repository's `README.md`.
- [ ] `/releases` is generated from `CHANGELOG.md` and `docs/development/releases/`, never typed by hand.
- [ ] No link is labelled only with a host's name; the Source link uses the host's official mark.
- [ ] The version on the page is the one in `.claude-plugin/plugin.json`.
- [ ] `check-privacy.ts` passes.
- [ ] The launch gate passes: plugin version 1.0.0 or later, Cockpit on by default.
- [ ] No testimonial, logo wall, star count or download count anywhere.

## Repository hygiene

- [ ] No tracked `.js` file. `oxfmt --check` and `oxlint` pass with the repository's configs.
- [ ] The site has its own folder and `package.json`; the plugin root has none.

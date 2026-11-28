# 0016. The website's motion uses the platform, with no animation library

Status: accepted.

## Context

The brief allowed Motion or GSAP for orchestration. The Motion artboard specifies 29 moments, all on `transform` and
`opacity`. Mapped one by one ([motion research](../design/website/research/03-platform-css-and-motion.md)): 15 are CSS
transitions, 7 CSS keyframes, 3 scroll-driven animations and 4 small TypeScript loops. The "spring in the build" for
the lens and the pupils is a CSS `linear()` easing (Baseline widely available since 2026-06-11). Measured: Motion
14.14.0 mini 3.5 KB, hybrid 27.7 KB; GSAP 3.15.1 with ScrollTrigger 45.5 KB, under Webflow's proprietary licence.

Scroll-driven animations have been Baseline newly available since 2026-10-27 (Firefox 159).

## Decision

Motion is CSS transitions, CSS keyframes, scroll-driven animations and the Web Animations API, with no library. Each
section renders its own frame in its final state; the frame's journey down the page is an enhancement inside
`@supports (animation-timeline: view())`. Browsers without it, and reduced motion, see the static frames.

## Consequences

- A CSS transition drops the lens's velocity when it retargets mid-move. The lens moves only when the pointer
  crosses into a new cell, so this is small; if it shows, Motion's mini build is the upgrade.
- Every looping accent is gated on an attribute the head script sets, so the ambient motion switch and reduced motion
  stop them all.

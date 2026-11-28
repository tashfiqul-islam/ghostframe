# 0025. The boot curtain covers the hero stage only

Status: proposed.

## Context

The design's boot curtain plays for 1.8 s over the already-painted page on a visitor's first page view in a session.
Lighthouse starts every run in a fresh session, so the curtain always plays there. Measured on spike A
([stack.md, spikes](../design/website/stack.md#spikes)): a full-page curtain kept LCP on the hero but moved mobile
Speed Index from 759 ms to 3,451 ms and Performance from 100 to 99, on mobile and desktop. A curtain over the mascot
stage only scored 100 on both, with mobile Speed Index at 1,808 ms.

## Decision

The curtain covers the hero stage (the mascot and the frame). The headline, the lede, the buttons and the install
command are visible and usable from the first frame.

## Consequences

- The boot moment keeps its sequence inside the stage; the headline's unscramble is not part of the curtain.
- Lighthouse 100 holds on a first visit, which is what every Lighthouse run is.

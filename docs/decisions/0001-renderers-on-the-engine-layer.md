# 0001. New renderers on the same engine layer

Status: accepted.

## Context

Cockpit's look was redesigned after its first spec was built: new turn headers, receipts, a pane with tabs and a
timeline. The first build already had a working engine layer: the ledger of engine events, the step log, the roster,
the turn's work, the history store and the render sites, each checked against the engine by probes.

## Decision

The redesign replaced the renderers only. The new rows live in `hooks/cockpit/rows/` and
`hooks/transcript/rows/`, pure functions from data to rows, built on `hooks/shared/look/`. The engine layer stayed as
it was: the spec keeps "every fact the first spec records about the engine: the corrections A–M, the probes, the
render sites, the store budget, the switching thresholds" ([cockpit.md](../design/cockpit.md), Precedence).

## Consequences

- The engine-facing code kept its tests and its probe-backed behaviour through the redesign.
- A renderer can be tested without the engine: the screen tests feed it a screen's data and compare its rows with the
  spec's screens.
- A future look is again a renderer change, as long as it needs no new engine facts.

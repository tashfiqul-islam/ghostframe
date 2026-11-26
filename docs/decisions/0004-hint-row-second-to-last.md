# 0004. The hint row on the pane's second-to-last row

Status: accepted.

## Context

The pane ends with a row of key hints and the `ghostframe v…` wordmark. The engine gives the pane `scroll.bodyRows`
rows (42 at 200 × 50) and keeps the dock's last row, under its close mark, for itself.

## Decision

The hint row and the wordmark are the body's last row, the dock's second-to-last
([cockpit.md](../design/cockpit.md) 8.12 and section 14, the owner's decision C). Hints that do not fit drop whole from
the end, never cut, and leave at least 4 cells before the wordmark.

## Consequences

- Nothing Cockpit draws is hidden under the engine's row.
- The live checks check the 4-cell gap on every hint row.

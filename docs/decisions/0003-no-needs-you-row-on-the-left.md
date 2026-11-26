# 0003. No NEEDS YOU row on the left

Status: accepted.

## Context

When Claude waits for a permission or an answer, the engine draws its dialog or question card in the left region.
An earlier design also drew a `NEEDS YOU` row on the left.

## Decision

The left draws no row of its own for it. The dialog is its own signal; the pane's pill says `! NEEDS YOU` and
selects the waiting step with a one-line drawer ([cockpit.md](../design/cockpit.md) 9.3 and section 14, the owner's
decision B).

## Consequences

- The engine's dialog is never doubled by a row that would stay in the transcript after the answer.
- With no pane docked, the dialog alone says the turn waits.

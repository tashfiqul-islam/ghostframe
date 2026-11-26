# 0005. Files counts are a known limit

Status: accepted.

## Context

The Files tab shows each file the turn changed with its `+`/`−` counts. Exact counts need the file's diff, which
means reading the file and running git.

## Decision

Only the selected file's row and its full diff take their counts from the diff. Every other row, and the summary's
total, keeps the counts tallied from the turn's steps. A file something outside the turn also changed can show the
steps' counts on its row and the diff's once selected; the baseline line says `· changed outside it too` then
([cockpit.md](../design/cockpit.md) 8.5 and section 14).

## Consequences

- No file read or git run per row per frame: diffing every file at each redraw is more than the pane can afford, and
  a test counts the file reads.
- The turn's history keeps each file's diff at its end.
- Upgrade if a row's counts are seen to mislead in practice.

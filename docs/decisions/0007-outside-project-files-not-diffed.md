# 0007. Files outside the project are listed but never diffed

Status: accepted.

## Context

A turn can write files outside the project: under the home folder, on another drive, in a temp or scratchpad
folder.

## Decision

Such a file is listed as the call wrote it, with no counts and an empty change bar, and is never diffed: no read,
no git call. Its full diff says `no diff · outside the project` ([cockpit.md](../design/cockpit.md) 8.5).

## Consequences

- Cockpit never reads a file outside the project the session works in.
- The turn still shows that it touched the file.

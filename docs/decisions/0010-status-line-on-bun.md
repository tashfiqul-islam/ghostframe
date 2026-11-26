# 0010. The status line runs on Bun, not compiled executables

Status: accepted.

## Context

The status line runs on every refresh, so its start time matters. Compiled executables (`bun build --compile`)
were the other option.

## Decision

It runs as `bun <config>/ghostframe/statusline.js`, a bundle the installer builds. Measured through Git Bash over 30
runs: `bun script.ts` 72.5 ms, a compiled executable 69.5 ms at 115 MB each, the old bash script 345.9 ms
([statusline.md](../design/statusline.md), Decisions and Measured). It honours `NO_COLOR`.

## Consequences

- Nothing to download per platform; the same bundle runs everywhere Bun does.
- The status line needs Bun on `PATH`; the installer checks and says so.
- About 55 ms a frame warm; after an idle gap most of the cost is Bun's own start.

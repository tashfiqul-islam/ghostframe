# 0009. The status line mark is the half-block ghost

Status: accepted.

## Context

The brand's mascot is an image. A status line could only show it as an inline image (Sixel and similar).

## Decision

The mark is a 6 × 2 half-block ghost drawn in text. Claude Code keeps only SGR colour and OSC 8 link escapes from a
status line command's output and drops every other escape before the line is measured, Sixel and cursor codes
included; a plugin's `Text` refuses control characters and its `Image` draws pixels only in kitty, Ghostty and iTerm2.
The evidence, checked in 2.1.332, is in [statusline.md](../design/statusline.md#why-the-mascot-image-cannot-be-the-mark-checked-in-21332).
The eyes show the highest budget: green under 60%, amber from 60 to 84%, red from 85%.

## Consequences

- The mark draws in every terminal that draws text.
- The mascot stays the brand outside the terminal ([ADR 0011](0011-mascot-outside-ghost-inside.md)).

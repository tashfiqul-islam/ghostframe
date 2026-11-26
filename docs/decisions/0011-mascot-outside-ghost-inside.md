# 0011. The mascot outside the terminal, the ghost inside it

Status: accepted.

## Context

ghostframe has a mascot (a hooded skull with gold eyes) and the status line's half-block ghost.

## Decision

The mascot is the brand everywhere outside the terminal: the README, GitHub, the docs, the website and social
cards. Inside Claude Code the status line keeps the half-block ghost, because Claude Code can only draw text there
([brand kit](../design/brand/README.md), [ADR 0009](0009-half-block-ghost-mark.md)). The mascot's three eye states match
the ghost's thresholds.

## Consequences

- One brand with two forms, each where it can be drawn.
- No image of the mascot is ever drawn in the terminal.

# 0002. Waiting on agents: the pane head when docked, the band in fallback

Status: accepted.

## Context

After Claude answers, background agents may still run. The engine draws no spinner row then, so the left has no
live line to say the turn is still going.

## Decision

Docked, the pane head says `Waiting on n agents` and the left stays quiet. With no pane docked, the band above the
prompt (`AbovePrompt`) draws `◇◇◇  Waiting on 3 agents`, one `◇` per running agent. The turn stays `● LIVE` and gets
no receipt until its agents finish ([cockpit.md](../design/cockpit.md) 7.11, 9.2 and section 14, the owner's
decision A).

## Consequences

- One signal per mode, never two: the band draws nothing while the pane is docked.
- The `[-]` at the band's right end is the engine's collapse toggle, not Cockpit's, and no plugin can remove it.

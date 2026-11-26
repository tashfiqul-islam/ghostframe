# 0006. Sources: never invent a page title

Status: accepted.

## Context

The Sources tab lists the pages a turn read. Some fetches return no title.

## Decision

A page's title is the one its fetch returned, cut from the end. With none, the row shows its host and path
(`example.com/missing-page`), never a label made up from the URL ([cockpit.md](../design/cockpit.md) 8.7, and
principle 10: never invent).

## Consequences

- A title in the pane is always one the page gave.
- Some rows read as a path rather than a name.

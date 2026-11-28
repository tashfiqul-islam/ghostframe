# 0027. The 404 answers with a real 404 status, and Lighthouse audits its file

Status: proposed.

## Context

A missing page must answer with a 404 status; a 200 there would be the real SEO bug. The Lighthouse budget is 100 in
all four categories on every page, 404 included.

The SEO research said a correct 404 scores SEO 92, because Lighthouse's `http-status-code` audit fails on any 4xx, and
proposed exempting that one audit on that one page. That was wrong. Run in the walking skeleton on 2026-11-28,
Lighthouse 13.6.0 does not score a page that answers 404 at all: it stops with `ERRORED_DOCUMENT_REQUEST` ("unable to
reliably load the page"), and every category, `http-status-code` included, is null. The research read the audit's
documentation, not a run.

## Decision

The 404 page is checked in two parts, with no exemption anywhere:

- a browser test requests a missing URL and asserts the 404 status and the 404 page's heading;
- Lighthouse audits the same page at `/404.html`, where it is a file served with status 200, and holds it to 100 in
  all four categories like every other page.

## Consequences

- Workers static assets serves `/404.html` as a file and serves it with a 404 status for missing paths
  (`not_found_handling: "404-page"`); both behaviours are what the two checks rely on, and the first deploy confirms
  them with `curl`.
- If a later Lighthouse version scores 404 responses, the browser test still holds the status; nothing needs to
  change.

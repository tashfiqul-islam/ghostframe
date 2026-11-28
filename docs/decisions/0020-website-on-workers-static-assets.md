# 0020. The website is an assets-only Worker, with headers written at build

Status: proposed.

## Context

Cloudflare's Pages docs (updated 2026-11-28) say to start new static sites on Workers. An assets-only Worker needs no
script and no framework adapter: `assets.directory`, `not_found_handling: "404-page"` (the 404 page with a real 404
status) and `html_handling: "auto-trailing-slash"`. Asset requests are free and unlimited. Headers come from a
`_headers` file: at most 100 rules, 2,000 characters a line
([delivery research](../design/website/research/10-cloudflare-delivery-and-security.md)).

Astro's `security.csp` (stable since 6.0) emits a `<meta>` tag unless an adapter supports headers; a meta CSP cannot
set `frame-ancestors`.

## Decision

The site deploys as an assets-only Worker with Wrangler, no adapter. A post-build step writes `_headers`: a hash-based
CSP with no `'unsafe-inline'`, long immutable caching for hashed files, revalidation for HTML, and the other security
headers. HSTS is set on the zone, so it also covers the HTTP-to-HTTPS redirect: `max-age=31536000`, with no `preload` and no
`includeSubDomains` until the domain's subdomains are settled.

## Consequences

- The whole CSP must fit one 2,000-character line; the post-build step fails if it does not.
- Cloudflare joins the values of a header that two matching rules both set, so only `/_astro/*` sets `Cache-Control`
  (a year, immutable); everything else keeps the assets default, `public, max-age=0, must-revalidate`.
- The browser tests and Lighthouse run against a local server that applies the same `dist/_headers`, so they run under
  the CSP that ships; a CSP that blocks the site's own script fails them.
- Leaving Cloudflare means moving `_headers` and the 404 rule to the next host; the HTML is plain static output.

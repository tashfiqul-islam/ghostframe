# 0024. The website counts visits without a script

Status: accepted.

## Context

ghostframe's promise is privacy, and the site keeps it: no cookies, nothing that needs a consent banner, and no
runtime requests to third parties for scripts. Cloudflare Web Analytics is sold as privacy-first (the research reports
no cookies and no local storage; the two Cloudflare pages checked on 2026-11-28 do not say either way), but it loads
`https://static.cloudflareinsights.com/beacon.min.js` and reports to `cloudflareinsights.com`, and Cloudflare does not
support pinning the beacon's version (Web Analytics FAQ, modified 2026-07-14), so it cannot be served as a fixed copy
from the site's own origin ([delivery research](../design/website/research/10-cloudflare-delivery-and-security.md)).

## Decision

The site ships no analytics script and no CSP entry for one. Visits are read from Cloudflare's zone HTTP analytics,
which the edge records without any code on the page.

## Consequences

- The data is coarse: on the Free plan there are no per-page counts.
- If per-page counts are missed, the later option is a first-party beacon: a small Worker on the site's own origin
  (for example `/b`) that writes to Workers Analytics Engine, on the free tier, with no cookies. That adds a Worker to
  maintain and a `connect-src 'self'` use, so it waits until the need is real.

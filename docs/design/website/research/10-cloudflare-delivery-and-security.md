# 10 + 11: Cloudflare delivery, security headers, analytics

Researched 2026-11-28. Labels: **stable today** / **newly available** (needs fallback) / **coming** / **no evidence found**.
"Spike" = must be checked with `curl -sv` against a real deploy; the docs do not settle it.

## Versions (npm registry, checked today)

| Package                                 | Latest  | Published  |
| --------------------------------------- | ------- | ---------- |
| wrangler                                | 4.169.0 | 2026-11-27 |
| lighthouse                              | 13.6.0  | 2026-10-27 |
| astro                                   | 7.4.13  | 2026-11-18 |
| web-features (Baseline data used below) | 3.48.0  | 2026-11-26 |

`bunx wrangler@4.169.0 --version` works on this machine (runs on Node through its shebang). `bunx --bun wrangler` failed
here on Windows (bunx tried to `git clone` the CLI path). Cloudflare's install page says Wrangler needs Node.js
(Current/Active/Maintenance) and documents `bun add -d wrangler@latest`
(developers.cloudflare.com/workers/wrangler/install-and-update/). So: install with Bun, run with `bunx wrangler`, keep
Node on the machine and in CI (mise). **stable today**.

## Part 10: delivery

### Pages vs Workers static assets

Cloudflare Pages docs (dateModified 2026-11-28, developers.cloudflare.com/pages/): "For new static sites and full-stack
applications, start with Cloudflare Workers." Confirms the current choice. **stable today**.

### Config (assets-only Worker: no `main`)

From workers/static-assets/routing/static-site-generation/ and wrangler configuration docs (2026-11):

```jsonc
{
  "name": "ghostframe-site",
  "compatibility_date": "2026-11-28",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "404-page", // nearest 404.html, real 404 status
    "html_handling": "auto-trailing-slash" // default; /releases/ for releases/index.html
  }
}
```

- `html_handling`: `auto-trailing-slash` (default) | `force-trailing-slash` | `drop-trailing-slash` | `none`.
- `not_found_handling`: `none` (default) | `404-page` (404 status + nearest `404.html`) | `single-page-application`.
- No `main` = no script; asset requests are "free and unlimited" (workers/static-assets/billing-and-limitations/,
  2026-11-12) and do not invoke a Worker.

### Limits (workers/platform/limits/, 2026-11-25; static-assets headers/redirects pages)

| Item              | Free                                                                                               | Note                                         |
| ----------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Files per version | 20,000 (100,000 paid; needs wrangler >= 4.34.0)                                                    | site will be < 200                           |
| Max file size     | 25 MiB                                                                                             |                                              |
| `_headers`        | 100 rules, 2,000 chars per line                                                                    | a CSP header must fit on one 2,000-char line |
| `_redirects`      | 2,000 static + 100 dynamic, 1,000 chars per line; 301/302/303/307/308; 200 proxy to same site only |                                              |
| Range requests    | answered `200` full body, no `206`                                                                 | irrelevant unless we ship video              |
| Worker requests   | 100k/day                                                                                           | only if we ever add a script                 |

`_headers` and `_redirects` apply only to asset responses, never to Worker-generated ones (headers page, 2026-11-12).
Redirects win over headers when both match.

### Caching

Default on every asset (headers page, 2026-11-12): `Cache-Control: public, max-age=0, must-revalidate` + `ETag`
(file hash), so browsers revalidate with `If-None-Match` and get 304. Cloudflare also caches assets at the edge with
tiered cache, keyed to the deployed version's manifest (static-assets page, 2026-11-28).

- HTML: keep the default. It is revalidate-every-time, bfcache-safe (not `no-store`), and deploys show at once.
- Hashed build files (`/_astro/*` or whatever the framework emits) and self-hosted fonts:

```text
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

- Spike: confirm the `_headers` value replaces the default `Cache-Control` rather than being comma-joined with it
  (the docs only warn about joining when several `_headers` rules match). The `!` detach syntax removes headers set
  by earlier `_headers` rules; no doc says it removes the platform default, so check the real response.
- Never `no-transform` on HTML: it disables Web Analytics auto-injection and compression changes.

### Compression (speed/optimization/content/compression/, 2026-11-25)

- Free plan default to visitors: **Zstandard** when the browser sends `zstd`; Brotli and gzip otherwise. Pro/Business
  default Brotli. Compression Rules (10 on Free) can change the order.
- Browser zstd: Chrome/Edge 123, Firefox 126, Safari 26.3. Baseline **newly available** since 2026-02-11. Negotiated
  by `Accept-Encoding`, so older browsers get Brotli with no work. Nothing to build.
- Only `200`, `403`, `404` responses, >= 50 bytes, listed content types (HTML, CSS, JS, SVG, JSON, XML, `ld+json`,
  manifest; not woff2, which is already compressed).
- Spike: the page is zone-level; confirm assets-only Worker responses on the custom domain carry
  `content-encoding: zstd` (`curl -H 'Accept-Encoding: zstd, br' -sv`). No doc says otherwise; no doc confirms it.

### HTTP/3

Zone toggle, all plans, visitor-to-Cloudflare only (speed/optimization/protocol/http3/, 2026-08-14). Browser support
Baseline **newly available** (2024-09-16; Safari 18). Turn on in dashboard (wizard step). Zero code.

### 103 Early Hints

- Cache docs (cache/advanced-configuration/early-hints/, 2026-09-17): zone toggle, all plans. Cloudflare caches
  `Link: rel=preload|preconnect` headers from `200/301/302` responses for `.html`/no-extension URIs and replays them
  as 103 on later requests. HTTP/2 and HTTP/3 only. Chromium acts on them (Chrome 94+).
- Workers vs Pages matrix (migrate-from-pages, 2026-11-12): Workers = "workaround available": works when the zone
  setting is on and "your Worker must send the appropriate Link headers". For an assets-only Worker that means
  `Link` in `_headers`. **Pages' automatic Link generation from `<link>` tags is Pages-only**; no evidence it exists
  for Workers static assets.
- Same doc: Early Hints fire _less_ for cacheable content, because the cached main response often arrives first.
  Our HTML is edge-cached, so the gain is small and unmeasured.
- Verdict: optional. If the hero font is preloaded, put the same preload in `_headers` (the `Link` header alone already
  starts the fetch at header-parse time, 103 or not):
  `/` -> `Link: </fonts/x.woff2>; rel=preload; as=font; type=font/woff2; crossorigin`. Spike: look for `HTTP/2 103`.

### Speculation Rules

- Platform: `<script type="speculationrules">` Chrome/Edge 109+ only. Baseline: **not Baseline** (web-features
  3.48.0). Pure progressive enhancement; other browsers ignore it.
- Cloudflare Speed Brain (speed/optimization/content/speed-brain/, 2026-08-14): on by default on Free; adds a
  `Speculation-Rules` header pointing at Cloudflare's conservative prefetch config. Requirements: prefetched page
  "eligible for cache" and "does not invoke a Worker"; prefetch requests "never reach origin" and only serve from
  Cloudflare cache; still labelled beta. Whether an assets-only Worker counts as "invokes a Worker": **no evidence
  found**. Spike: check for the `Speculation-Rules` response header.
- Own rules: three pages, so the gain is one prefetch of /releases/ from the landing page. If wanted:
  `{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}` as an inline script, hashed in CSP
  (inline speculation rules _are_ subject to `script-src`). Prefer `prefetch` over `prerender`: prerender would run
  the boot curtain and the session flag in a hidden page (needs `document.prerendering` guards).

### bfcache (web.dev/articles/bfcache, updated 2026-10-16)

Blockers that matter here: `Cache-Control: no-store` on the HTML (Chrome still blocks; use the default
`max-age=0, must-revalidate`), `unload` listeners (use `pagehide`), in-flight `fetch`, `window.opener` (use
`rel="noopener"`, default for `target=_blank`). Default Cloudflare headers are bfcache-safe. The Web Analytics beacon
uses `sendBeacon` on hide (FAQ), which does not block bfcache by itself; no doc measures it.

### Render path and LCP

- One small stylesheet linked in `<head>` vs inlined critical CSS: with a single page of ~10-20 KB CSS (compressed
  ~4-6 KB), one external sheet costs one extra request on first visit but is immutable-cached after; inlining makes
  every HTML response heavier and needs `style-src` hashes. Recommendation: one `<link rel="stylesheet">` with hashed
  name; inline only if the spike shows LCP > 1.8 s on throttled mobile. **No evidence found** of a measured winner for
  this exact size; decide by spike.
- Keep LCP on hero text: font with `font-display: swap` or `optional`, preloaded, metric-matched fallback; no JS
  before first paint except the tiny inline motion/boot flag; module scripts are deferred by default. The 1.8 s boot
  curtain must paint over already-rendered text and must not delay or hide the LCP element from paint timing
  (opacity 0 on the hero text would move LCP to curtain end). That is a design-impl risk for the motion researcher.

## Part 11: security headers

### What Lighthouse 13.6.0 scores (core/config/default-config.js at tag v13.6.0)

Best Practices weights: `is-on-https` 5, `redirects-http` 1, `deprecations` 5, `third-party-cookies` 5,
`errors-in-console` 1, `inspector-issues` 1, `doctype` 1, `charset` 1, image audits, notifications/geolocation on
start. **Weight 0 (informational, never affect the score)**: `csp-xss`, `has-hsts`, `origin-isolation` (COOP),
`clickjacking-mitigation` (XFO / frame-ancestors), `trusted-types-xss`, `baseline`, `js-libraries`,
`valid-source-maps`.

So 100 needs HTTPS + HTTP redirect, no console errors, no DevTools Issues, no third-party cookies, no deprecated APIs.
Trap: **any CSP or Trusted Types violation logs a console error and an Issue, which costs points.** A strict policy is
free for the score only if nothing violates it. Also new in Lighthouse 13: an `agentic-browsing` category (llms.txt
etc.), outside the four we target; flag for the SEO/AEO researcher.

### CSP design

Facts:

- `<script type="application/ld+json">` is a data block. In the HTML spec's "prepare the script element", a
  non-JavaScript type returns before the CSP inline check, so JSON-LD needs no hash and is never blocked. **stable**.
- Module scripts from our origin pass with `script-src 'self'`. Inline motion/boot script needs a `'sha256-…'`.
- Inline `style="…"` attributes are governed by `style-src-attr` (falls back to `style-src`). Hashes for attributes
  need `'unsafe-hashes'`; easiest is to emit none (set custom properties from TS via `el.style.setProperty`, which
  CSSOM allows; CSP only blocks markup attributes and `setAttribute('style')`).
- Meta CSP ignores `frame-ancestors`, `report-uri`/`report-to`, `sandbox`. Lighthouse `csp-xss` also flags a
  meta-only policy. Policies stack: header + meta are both enforced (intersection), so a header without `default-src`
  can carry the frame/base/object rules while the meta carries hashes. Cleaner: everything in one header.

Astro 7 (configuration reference, docs.astro.build, fetched today): `security.csp` added in astro@6.0.0, not labelled
experimental (**stable today**). Hashes Astro's own emitted scripts and styles; extra hashes via
`scriptDirective.hashes`; `styleDirective` entries can target `-elem` / `-attr` (v7.1). Emits a `<meta>` per page.
Headers instead only through an adapter with the `staticHeaders` feature (Node, Netlify, Vercel documented);
**no evidence the Cloudflare adapter supports `staticHeaders`**, and a static site has no adapter. Not supported: dev
mode, `<ClientRouter />` view transitions, Shiki inline styles.

Recommended policy (one header via `_headers`, generated by a small postbuild Bun script that hashes the inline
scripts in `dist/**/*.html`; fits easily within 2,000 chars):

```text
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-<boot>'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'; trusted-types 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

Notes per line:

- `'self'` allowlist: `csp-xss` may still suggest hashes + `'strict-dynamic'` (weight 0). Astro's `strictDynamic`
  needs import-map integrity (Chrome 127, Firefox 138, Safari 18); not worth it with zero third-party scripts.
- Trusted Types: Baseline **newly available** 2026-02-24 (Chrome 83, Firefox 148, Safari 26). Practical only if our
  code never assigns `innerHTML`/`outerHTML`/`insertAdjacentHTML` or script `src` strings, and no framework runtime
  does. With vanilla TS: practical. With React/Preact islands or Astro island runtime: test; React DOM avoids sinks
  except `dangerouslySetInnerHTML`. Any violation = console error = lost points, so CI must run Lighthouse on built
  output.
- HSTS: set at the zone (SSL/TLS > Edge Certificates > HSTS, all plans, ssl docs 2026-10-15) so it also covers
  redirects, which `_headers` cannot. Preload criteria (hstspreload.org): valid cert, HTTP->HTTPS redirect on same host,
  every subdomain HTTPS, `max-age>=31536000; includeSubDomains; preload` on the apex, also on HTTPS redirects. Preload
  is near-irreversible and covers every subdomain of the zone: **user-owned decision** (domain scope).
- COOP `same-origin`: safe; no popups/OAuth. COEP/CORP: skip; no SharedArrayBuffer or high-res timers needed, and COEP
  `require-corp` would block the analytics beacon. CORP adds nothing for a public site.
- Referrer-Policy: the default value written explicitly; do not use `no-referrer` (Web Analytics needs Referer/Origin,
  FAQ).
- Permissions-Policy: **not Baseline** (Chrome/Edge 108 only). Low value; list only recognised feature names, because
  unknown names log console warnings (warning, not error; verify `inspector-issues` stays clean).
- 404 page: spike whether `/*` `_headers` rules apply to the `404-page` response; no evidence found.

## Analytics

Cloudflare Web Analytics, official docs:

- No cookies, no localStorage, no fingerprinting: "It does not use any client-side state, such as cookies or
  localStorage" (web-analytics/data-metrics/core-web-vitals/, 2026-10-13). No consent banner needed on that basis.
- Script: always `https://static.cloudflareinsights.com/beacon.min.js` (FAQ, 2026-07-14). Auto-injection reports to
  our own `/cdn-cgi/rum`; manual reports to `cloudflareinsights.com`. Version not pinnable; custom integrations with
  the endpoint "not supported", so **self-hosting the beacon is not an option**.
- **Conflicts with the hard constraint "no runtime third-party requests for scripts".** One cross-origin script per
  page, blocked by most ad-blockers (FAQ).
- Auto-injection needs a proxied (orange-cloud) hostname and valid HTML, breaks with `no-transform`. Whether it injects
  into assets-only Worker responses on a custom domain: **no evidence found**; spike. Cloudflare-injected tag carries
  SRI; manual tag cannot.
- CSP cost: `script-src https://static.cloudflareinsights.com/beacon.min.js` + `connect-src 'self'` (auto) or
  `cloudflareinsights.com` (manual). Auto-injection also adds a tag we did not hash; if CSP blocks it, console error
  -> Best Practices loses points. Trusted Types behaviour of the beacon: no evidence found.
- Lighthouse: third-party request in the trace; no cookies so `third-party-cookies` passes; small perf cost
  (size not documented). bfcache: no documented effect.

| Option                                                                                                  | Third-party script                  | Cookies | Data                                                                                                  | Cost                                                                                             | Fits constraints                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| A. Web Analytics, auto-inject                                                                           | yes (static.cloudflareinsights.com) | none    | page views, referrers, CWV RUM                                                                        | free                                                                                             | breaks "no third-party scripts"; CSP allowance; injection on Workers unverified |
| B. Web Analytics, manual tag                                                                            | yes                                 | none    | same                                                                                                  | free                                                                                             | same, plus no SRI                                                               |
| C. Zone HTTP Traffic analytics (no JS)                                                                  | no                                  | none    | Free: requests, bandwidth, unique visitors, top countries; per-URL only on Pro+ (zone-analytics docs) | free                                                                                             | fits; coarse; counts bots                                                       |
| D. Own beacon: `navigator.sendBeacon('/b')` + Worker with `run_worker_first: ["/b"]` + Analytics Engine | no (first-party)                    | none    | whatever we send (path, referrer host, CWV via PerformanceObserver)                                   | free tier: 100k Worker req/day, AE 100k writes/day (AE billing "coming months", docs 2026-04-23) | fits; adds a Worker script, ~1 KB client TS, SQL to read data; more to maintain |

## Lead's call

Delivery: assets-only Worker with `404-page` + `auto-trailing-slash`; default HTML caching, immutable for hashed
files; zstd/Brotli/HTTP/3 are free zone features; Early Hints and Speculation Rules optional extras, not load-bearing.
Security: one `_headers` CSP with hashes (generated postbuild), HSTS at the zone, COOP, nosniff, XFO, Trusted Types if
the island choice keeps DOM sinks out. Analytics ranking against 00-frame criteria (C2, C3, constraint fit):

1. **C (zone analytics, no JS)** now, zero code, zero CSP surface. Pair with Lighthouse CI for vitals.
2. **D (first-party beacon)** if per-page counts or field CWV are wanted; small, but adds a Worker and a dep on AE.
3. **A** only if the user waives "no third-party scripts" for analytics; it is the current choice and the simplest
   way to get field CWV.
4. B: worst of A.

## Open questions

- User-owned: drop Web Analytics (constraint says no third-party scripts) or grant it an exception? Recommend drop,
  use C, add D later if needed.
- User-owned: HSTS `preload` + `includeSubDomains` on the zone (affects every subdomain, hard to undo).
- Spikes on first deploy (one `curl -sv` script): custom `Cache-Control` replaces default; `content-encoding: zstd`;
  `HTTP/2 103`; `Speculation-Rules` header from Speed Brain; Web Analytics auto-inject on Worker; `_headers` on 404.
- Inline critical CSS vs one stylesheet: measure in the framework spike.

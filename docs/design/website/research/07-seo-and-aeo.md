# 07 SEO and AEO/GEO for the ghostframe site

Checked 2026-11-28. Every fact carries its source and that source's date. Labels: **stable today**, **newly
available**, **coming**. "No evidence found" means I searched and found none.

## TL;DR

- SEO and AEO here cost **0 KB of JS**. Everything is build-time HTML, plus a few text files, plus `_headers`. They
  don't separate the framework candidates on C6. Any SSG that gives full `<head>` control and can emit arbitrary files
  (`.xml`, `.txt`, `.md`, `_headers`) scores 5.
- **Lighthouse SEO 100 is impossible on the real 404.** `http-status-code` fails on any 4xx or 5xx, and a correct 404
  scores 92. The handoff's lhci check of `/404.html` from `staticDistDir` only passes because the local server returns 200. Change the "every page" constraint to: 100 on `/` and `/releases/`; on the 404, only `http-status-code` may fail.
  - **Correction (lead, 2026-11-28, measured):** wrong. Lighthouse 13.6.0 does not score a 404 response at all: the run
    stops with `ERRORED_DOCUMENT_REQUEST` and every category is null. The claim above came from the audit's documentation,
    not a run. The 404 is now audited at `/404.html` (a file, served 200) and its status is asserted by a browser test;
    see ADR 0027.
- **FAQ rich results are gone for everyone.** Google deprecated them on 2026-05-07 and removed the docs on 2026-06-15.
  SoftwareApplication rich results need `aggregateRating` or `review`, which ghostframe can't honestly supply. JSON-LD is
  therefore for site name (WebSite) and for other consumers, not for rich snippets.
- **llms.txt and Markdown twins:** Google says it ignores them, and neither harms nor helps (2026-06-15). Server-log
  studies show AI crawlers almost never fetch `/llms.txt`. But Lighthouse 13.2+ (2026-04-30) audits `llms.txt` in a new
  **Agentic Browsing** category, and coding agents (Claude Code, per Cloudflare) send `Accept: text/markdown`. For a
  developer tool whose users are coding agents, the cost is about 1 build step, so do it (details below).
- **Cloudflare:** new zones default to **Allow** for Search, Agent and Training AI traffic (docs 2026-11-02). Managed
  robots.txt / Bot Preference Sync only prepends anything when a policy is set to Block or Disallow. Markdown for Agents
  is **Pro+ only** (beta). On Free, ship our own `.md` files.

## 1. SEO facts

### Titles, descriptions, canonical, trailing slash

| Item                   | Fact                                                                                                                                                                                                                                                                                    | Source (date)                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Canonical              | Methods: redirects (strongest), `rel=canonical` in a link or a header, sitemap (weaker). Use consistent absolute URLs.                                                                                                                                                                  | developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls (2026-07-10)                   |
| Lighthouse `canonical` | Fails when the URL is not absolute, invalid, conflicting (several), points to another hreflang location, or points to the root from a non-root page.                                                                                                                                    | Lighthouse v13.6.0 `core/audits/seo/canonical.js`                                                             |
| `html_handling`        | `auto-trailing-slash` (default): `about/index.html` resolves to `/about/` (200), and `/about` 307s to `/about/`. `about.html` resolves to `/about`. `force-trailing-slash` gives `/x/` for both. `drop-trailing-slash` gives `/x` for both. `none` turns it off. Redirects are **307**. | developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/ (2026-04-23) **stable today** |
| `_headers`             | Works for static-asset responses. It is **not** applied to responses from Worker code (`run_worker_first`).                                                                                                                                                                             | developers.cloudflare.com/workers/static-assets/headers/ (2026-11-12)                                         |

Policy: emit directory-format pages (`releases/index.html`), keep `html_handling = "auto-trailing-slash"`, and use the
canonical `https://<site>/releases/` everywhere (canonical tag, `og:url`, sitemap, internal links, Atom alternate).
Root is `https://<site>/`. The 307 is temporary, but self-referencing canonicals plus consistent internal links make
that moot. Conflict to fix: ACCEPTANCE.md writes `/releases` and `/404`, while lighthouserc.json writes `/releases/` and
`/404.html`. Pick `/releases/`.

The `*.workers.dev` hostname duplicates the site. Set `workers_dev = false` once the custom domain is live, or rely on
the absolute canonical. The setting is better because nothing is left to index.

### sitemap.xml and robots.txt

- Google **ignores `<priority>` and `<changefreq>`**. It uses `<lastmod>` only "if it's consistently and verifiably
  accurate". "Significant" means main content, structured data or links, not a copyright year.
  (developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap, 2026-11-27.) Source lastmod for
  `/releases/` from the newest release date, and for `/` from the git date of the content files. If it can't be
  accurate, omit it. Sitemaps may be XML, RSS/Atom or text, so the Atom feed can also serve as a sitemap.
- Two URLs means a hand-written template (about 10 lines). `@astrojs/sitemap` 3.7.6 (2026-11-18) isn't needed.
- robots.txt: `User-agent: *` / `Allow: /` / `Sitemap: https://<site>/sitemap.xml`. Lighthouse `robots-txt` accepts
  `content-signal` as a known directive (v13.6.0 source). The audit fails on a 5xx or a 429 for robots.txt.

### Open Graph and X cards

| Tag                                                                       | Required?                                                                                                        | Source                                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `og:title`, `og:type`, `og:image`, `og:url`                               | Required (4)                                                                                                     | ogp.me (undated, stable)                                                                                                        |
| `og:description`, `og:site_name`, `og:image:width/height`, `og:image:alt` | Optional. ogp.me says to give `og:image:alt` whenever you give `og:image`.                                       | ogp.me                                                                                                                          |
| `twitter:card=summary_large_image`                                        | Required for the large card. X falls back to `og:` for title, description and image.                             | developer.x.com summary-card-with-large-image (the page returned 402 to my fetch; text verified via search snippets quoting it) |
| Image                                                                     | 2:1 ratio, min 300x157, max 4096x4096, <5 MB, JPG/PNG/WEBP/GIF, **no SVG**. X wants an image unique to the page. | same                                                                                                                            |

1200x630 (1.91:1) is the de facto Facebook/LinkedIn size. X crops it slightly to 2:1, so keep text inside a centred
1200x600 safe area. **Static versus build-time generation:** 2 pages means 2 hand-exported PNGs in `public/og/`, 0 deps.
Build-time generation (satori 0.63.2, 2026-10-20, plus @resvg/resvg-js 2.6.2, **2024-03-26: stale**, a native binary)
earns its 2 deps only if each release gets its own card. It doesn't (there is one releases page), so stay static.

### JSON-LD: what Google actually shows

| Type                    | Google says                                                                                                                                                                                                                                                                                             | Value here                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SoftwareApplication** | Required: `name`, `offers.price` (0 if free), **and one of `aggregateRating` or `review`**. Recommended: `applicationCategory`, `operatingSystem`. "You must include the required properties … to be eligible." (developers.google.com/search/docs/appearance/structured-data/software-app, 2026-09-08) | **No rich result possible** without ratings. Fake or self-serving reviews break Google's review-snippet guidelines. Still worth emitting for other parsers (Bing, AI engines that read schema): no evidence found of a measured effect either way. Expect Search Console to list it as an invalid "Software app" item. Cost if wrong: cosmetic noise in Search Console. |
| **WebSite**             | Site-name feature. `name` plus `url` (root with trailing slash), optional `alternateName`. **Home page only.** (…/appearance/site-names, 2025-12-10)                                                                                                                                                    | **Add.** It's the only markup with a visible Google effect (the site name above the result).                                                                                                                                                                                                                                                                            |
| Organization / Person   | Organization markup on the home page for logo and knowledge-panel hints (…/structured-data/organization, 2026-09-08). No rich result.                                                                                                                                                                   | Optional. Use a `Person` as `author`/`publisher` inside SoftwareApplication rather than a separate Organization.                                                                                                                                                                                                                                                        |
| **BreadcrumbList**      | Supported (…/structured-data/breadcrumb, 2026-09-08).                                                                                                                                                                                                                                                   | Low value for a 2-level site (Home > Releases). Optional, about 8 lines on `/releases/`. Lead to check: Google simplified breadcrumb display on mobile in early 2025 (I didn't re-verify the post).                                                                                                                                                                     |
| **FAQPage**             | **Deprecated.** "This feature will no longer appear in Google Search starting May 7, 2026" (changelog 2026-05-08). Docs removed 2026-06-15. `/search/docs/appearance/structured-data/faqpage` now 301s to the updates page (fetched today). The 2023 gov/health restriction is superseded.              | **Skip the markup.** No evidence found that Bing or AI engines reward FAQPage markup. Keep the FAQ as visible HTML (headings plus answers), which every consumer reads.                                                                                                                                                                                                 |

Google's AI guidance repeats: "Structured data isn't required for generative AI search, and there's no special
schema.org markup you need to add." (…/fundamentals/ai-optimization-guide, added 2026-05-15, llms.txt note 2026-06-15.)

### 404 status on Workers static assets

`not_found_handling = "404-page"`: an unmatched request gets the nearest `404.html` up the tree with status **404 Not
Found**. If none exists, the response is a null-body 404.
(developers.cloudflare.com/workers/static-assets/routing/static-site-generation/, 2026-08-25.) **Stable today.**

- A direct request for `/404.html` 307s to `/404`, which serves 200, because it's a real file. That's harmless.
- **Don't** add `noindex` to the 404 page. Lighthouse's `is-crawlable` fails, and SEO drops to 61 instead of 92. The 404
  status already keeps it out of the index.
- lhci: set `staticDistDir` off and run lhci against `wrangler dev` (it serves the real 404 status). Assert
  `categories:seo` ≥ 0.92 on the 404 URL only, or assert per audit and exclude `http-status-code` there.

### Atom feed (RFC 4287, Dec 2005, stable)

- Feed MUSTs: exactly one `id`, `title` and `updated`. One or more `author`, unless every entry has one. SHOULD: a
  `link rel="self"`.
- Entry MUSTs: `id`, `title`, `updated`, and an author (its own or the feed's). Without `content`, it MUST have a
  `link rel="alternate"`. Use stable ids, such as `tag:` URIs or the release anchor URL: never regenerate them.
- Autodiscovery: `<link rel="alternate" type="application/atom+xml" title="ghostframe releases" href="/releases.atom">` in
  the `<head>` of every page. Serve it with `Content-Type: application/atom+xml` via `_headers`. Don't trust extension
  sniffing for `.atom`, and verify after deploy.
- `@astrojs/rss` 4.0.19 (2026-06-30) emits **RSS 2.0, not Atom**, so it's no help. A hand-written template is about 40
  lines and needs 0 deps. Validate in CI with an XML parse plus asserts on the required elements (fail fast).
- Conflict: HANDOFF.md line 496 says "links to the host's Atom feed at `releases.atom`; it does not build its own", while
  the brief says to build one. The lead decides.

### hreflang / i18n

Only leave room. Use `<html lang="en">`, unprefixed English paths, and no `hreflang` tags. Lighthouse `hreflang` passes
when there are none. Adding `/xx/` prefixes later doesn't break existing URLs.

### Lighthouse SEO audits (lighthouse 13.6.0, npm `latest`, published 2026-10-27)

From `core/config/default-config.js` at v13.6.0. The weights sum to about 13.04.

| Audit               | Weight       | Passes when                                                                                                                                                       |
| ------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is-crawlable`      | 93/23 ≈ 4.04 | No `noindex`/`none` in the robots meta or X-Robots-Tag for generic bots, and robots.txt doesn't block. Failing it alone fails the category (designed to be ≥31%). |
| `document-title`    | 1            | `<title>` is present and non-empty                                                                                                                                |
| `meta-description`  | 1            | It's present and non-empty                                                                                                                                        |
| `http-status-code`  | 1            | Status is not 400-599                                                                                                                                             |
| `link-text`         | 1            | No generic link text ("click here", "learn more", "more", "here", "read more", …)                                                                                 |
| `crawlable-anchors` | 1            | Every `<a>` has a real `href` (no `javascript:`, no missing href on clickable anchors)                                                                            |
| `robots-txt`        | 1            | robots.txt parses, and isn't 5xx or 429. A 4xx means not applicable, which passes.                                                                                |
| `image-alt`         | 1            | `<img>` has alt                                                                                                                                                   |
| `hreflang`          | 1            | No invalid hreflang (none passes)                                                                                                                                 |
| `canonical`         | 1            | See above. With no canonical it's not applicable.                                                                                                                 |
| `structured-data`   | 0            | Manual, unscored                                                                                                                                                  |

100 needs: a title, a description, a self canonical (absolute), descriptive link text (watch the "Source", "Docs" and
icon-only links: give them accessible names), real hrefs on the nav and dock links, alt on every image, a valid
robots.txt, and a 200 status.

**New and surprising:** Lighthouse has an **Agentic Browsing** category, added to the default config in 13.3.0
(2026-05-07) and described as "still under development and subject to change". Its audits are
`agent-accessibility-tree`, `webmcp-form-coverage`, `webmcp-registered-tools`, `webmcp-schema-validity`, `cumulative-layout-shift`,
`llms-txt` and `ard-schema` (ARD v0.91 `/.well-known/ard.json`, 13.6.0). The category is scored as a fraction and is
not one of the 4 required categories. `llms-txt` passes when the file has an H1, at least one Markdown link, and at
least 50 chars. It counts as **not applicable on 404**, so a missing file doesn't fail it. Label: **newly available /
experimental**. Don't target the WebMCP or ARD audits.

## 2. AEO / GEO

### What Google says (primary)

- "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations
  necessary." "You don't need to create new machine readable files, AI text files, or markup to appear in these
  features." (…/appearance/ai-features, 2025-12-10)
- AI optimization guide (added 2026-05-15): "There's no requirement to break your content into tiny pieces", "You don't
  need to write in a specific way just for generative AI search", and many AEO/GEO "hacks" "aren't effective". The
  llms.txt note (2026-06-15) says it "will neither harm nor help your site's visibility or rankings in Google Search",
  and that it's "fine" to keep one for other systems.
- Google's 2025 statements (Illyes, 2025-07-23; Mueller comparing llms.txt to meta keywords) are reported by Search
  Engine Land and Roundtable: **secondary**, consistent with the docs above.

### llms.txt

- Spec: llmstxt.org, Jeremy Howard, proposed 2024-09-03, page says "v2", last modified 2026-08-10. Informal and "open
  for community input", **not a standard**. Its only requirement is an H1. Then come a blockquote summary, optional
  prose, and H2 sections of Markdown links, with an "Optional" H2 for skippable links. It also proposes `.md` twins
  (`page.md` / `index.md`) advertised via `<link rel="alternate" type="text/markdown">` or a `Link:` header.
  `llms-full.txt` is **not in the spec**: it's a docs-platform convention.
- **Measured reads (server logs, secondary but measured):** Ahrefs (2026-06-15) looked at 137,210 domains in May 2026:
  97% of llms.txt files got **zero** requests, AI retrieval bots made about 1.1% of the requests, and SEO tools made
  21.7%. Smaller studies agree: Arrivl (Aug-Sep 2026) saw 100 llms.txt hits against 195k page hits, Saaslinks 0,
  AWRSHIFT 0, and Goodie 0 over 6 months. A Search Engine Land 10-site, 90-day test (Jan 2026) found no traffic or
  citation lift. Only one vendor study claims a lift.
- **Vendor statements:** OpenAI's bot docs and Anthropic's crawler article say nothing about llms.txt; both point to
  robots.txt. OpenAI, Anthropic and Google publish llms.txt for their **own developer docs** (per llmstxt.org), which
  says they see value for coding-agent consumption, not crawling. Mueller called it useful mainly for "AI coding tools
  reading developer docs" (secondary).
- **Speculation, unproven:** that llms.txt improves citations or ranking in any AI answer engine.
- **Verdict for ghostframe:** cheap and audience-fit. It's a Claude Code plugin, so its users paste URLs into coding
  agents. Generate `/llms.txt` at build time from the same content: an H1, a one-line summary, and links to `/index.md`,
  `/releases/index.md`, the GitHub repo and the README. Skip `llms-full.txt`: the whole site would fit in `index.md`
  anyway.

### Markdown twins and content negotiation

- Cloudflare's blog (2026-02-12) says "Claude Code and OpenCode … send these accept headers"
  (`Accept: text/markdown`). This is a vendor statement; I couldn't check Claude Code's source. Lighthouse and Google
  docs (`MiscFeatureFlags__enable_markdown_accept_header` in devsite) also serve Markdown, which shows big doc sites
  adopting it. **No evidence found** that any search or answer engine ranks or cites better because of Markdown.
- **Cloudflare Markdown for Agents:** edge HTML-to-Markdown conversion on `Accept: text/markdown`. It sets
  `Vary: Accept`, adds `x-markdown-tokens`, and defaults to `Content-Signal: ai-train=yes, search=yes, ai-input=yes`.
  Limit: 6 MiB of HTML. **Pro, Business, Enterprise and SSL for SaaS only (beta)**. Docs dateModified 2026-11-25; blog
  2026-02-12. A third-party claim of GA on 2026-11-09 is unverified. Not available on Free (brief says no paid plan),
  so **not an option**.
- **Free-plan path, recommended:** emit `/index.md` and `/releases/index.md` at build time from the same typed content.
  Add `<link rel="alternate" type="text/markdown" href="/index.md">` per page. In `_headers` for `/*.md`, set
  `Content-Type: text/markdown; charset=utf-8` and `Link: <https://<site>/>; rel="canonical"`, so Google consolidates
  the twin to the HTML. That's 0 runtime cost.
- **True content negotiation** (same URL, `Accept` switch) on Workers static assets needs Worker code with
  `run_worker_first`. That makes every request a Worker invocation and bypasses `_headers` for those responses, which
  has a cost and adds complexity. **Skip** (shortcut: agents that only send Accept and never follow `rel=alternate`
  get HTML, and that's fine: HTML is readable).

### AI crawler user agents (owners' docs)

| UA                                                | Owner        | Kind                                                                                                                                 | robots.txt                                  | Source (date)                                                          |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------- |
| GPTBot                                            | OpenAI       | Training                                                                                                                             | Honoured                                    | developers.openai.com/api/docs/bots (undated)                          |
| OAI-SearchBot                                     | OpenAI       | Search (ChatGPT search)                                                                                                              | Honoured; ~24 h to apply                    | same                                                                   |
| ChatGPT-User                                      | OpenAI       | User-triggered                                                                                                                       | "may not apply"                             | same                                                                   |
| OAI-AdsBot                                        | OpenAI       | Ad-landing checks, not training                                                                                                      | not stated                                  | same                                                                   |
| ClaudeBot                                         | Anthropic    | Training                                                                                                                             | Honoured, Crawl-delay supported             | support.claude.com 8896518 ("updated over 3 weeks ago")                |
| Claude-SearchBot                                  | Anthropic    | Search indexing                                                                                                                      | Honoured                                    | same                                                                   |
| Claude-User                                       | Anthropic    | User-triggered                                                                                                                       | Honoured (blocking "may reduce visibility") | same                                                                   |
| PerplexityBot                                     | Perplexity   | Search, not training                                                                                                                 | Honoured                                    | docs.perplexity.ai/guides/bots (undated)                               |
| Perplexity-User                                   | Perplexity   | User-triggered                                                                                                                       | "generally ignores robots.txt"              | same                                                                   |
| Google-Extended                                   | Google       | Control token only: Gemini training **and grounding** in Gemini Apps / Vertex. "does not impact a site's inclusion in Google Search" | Token                                       | developers.google.com/crawling/…/google-common-crawlers (2026-11-24)   |
| GoogleOther(-Image/-Video), Google-CloudVertexBot | Google       | Generic research / customer-requested Vertex crawls                                                                                  | Honoured                                    | same                                                                   |
| Applebot                                          | Apple        | Search (Spotlight, Siri, Safari)                                                                                                     | Honoured                                    | support.apple.com/119829 (2026-09-04)                                  |
| Applebot-Extended                                 | Apple        | Control token: generative training. "does not crawl webpages"                                                                        | Token                                       | same                                                                   |
| CCBot                                             | Common Crawl | Open corpus, widely used for training                                                                                                | Honoured (implied)                          | commoncrawl.org/ccbot (undated)                                        |
| meta-externalagent                                | Meta         | Training and indexing                                                                                                                | Honoured                                    | developers.facebook.com/docs/sharing/webmasters/web-crawlers (undated) |
| meta-webindexer                                   | Meta         | Meta AI search                                                                                                                       | Honoured                                    | same                                                                   |
| meta-externalfetcher                              | Meta         | User-triggered                                                                                                                       | "may bypass"                                | same                                                                   |
| facebookexternalhit                               | Meta         | Link previews (OG)                                                                                                                   | may bypass                                  | same                                                                   |
| Bytespider                                        | ByteDance    | Training                                                                                                                             | **No official owner doc found**             | -                                                                      |

**Coming:** the IETF AIPREF vocabulary. Google says it intends to support `user-agent: __usage_ai-training` in **early
2027** (crawlers page, 2026-11-24). Anthropic honours a general "no AI training" preference from 2026-10-30, rolling
out, with ClaudeBot rules taking priority. Don't build on it yet.

**Trade-off for an open-source tool that wants to be found and quoted:** the code is MIT/public on GitHub anyway, so
blocking training on the marketing site protects nothing. Blocking search or user agents removes the site from
ChatGPT search, Claude, Perplexity and Apple answers. Recommendation: **allow all** with `User-agent: *` / `Allow: /`
and no per-bot blocks. Optionally add `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. Lighthouse accepts the
directive. No evidence found that any vendor's crawler reads Content-Signal (none of the vendor docs above mention it),
so it's a declaration, not a lever.

### Cloudflare defaults

- **AI Crawler and Agent access policies:** "For new domains, Search, Agents, and Training use Allow (do not block) by
  default." Options are Block, Block on pages with ads, Allow, and Disallow (Training only, via robots.txt). The
  setting lives at Security > Settings > Bot traffic. (developers.cloudflare.com/bots/additional-configurations/block-ai-bots/,
  2026-11-02.) The 2025 "block by default" era has been replaced. **An older zone may still have Block set: check it
  in the dashboard.** This is a user step for the wizard.
- **Managed robots.txt / Bot Preference Sync:** this is active only when a policy is set to Block or Disallow. It then
  **prepends** `Content-signal: search=yes, ai-train=no, use=reference` plus `Disallow: /` for Amazonbot,
  Applebot-Extended, Bytespider, CCBot, ClaudeBot, Google-Extended, GPTBot and meta-externalagent to the origin's 200
  robots.txt, or creates one if none exists. (…/managed-robots-txt/, 2026-11-02.) With everything Allowed, nothing is
  prepended. The docs don't say whether this applies to Workers custom domains. It's zone-level, so assume yes and
  verify with `curl https://<site>/robots.txt` after the first deploy (a CI smoke check).
- AI Crawl Control (all plans, docs 2026-08-14): analytics on which AI bots hit the site, for free. It's worth a look
  after launch. Pay Per Crawl is in private beta and irrelevant.
- Content Signals Policy: Cloudflare launched it on 2025-09-24 (third-party coverage, Barchart press release). The
  signals are `search`, `ai-input` and `ai-train`. contentsignals.org renders client-side only, so I couldn't quote it.

### Answer-first copy and FAQ structure

- Measured evidence: none found that answer-first or FAQ formatting raises AI citations in a controlled way. Google
  says explicitly that no special writing or chunking is needed (2026-05-15).
- What holds on independent grounds: put the facts in text, not in images or canvas (Google ai-features: "keep
  important content in text form"). The facts are what ghostframe is, install command, requirements, compatibility and
  version. The hero's first paragraph should state what it is in one sentence. FAQ answers should be real `<h3>`/`<p>`
  or `<details>` text, which is also good accessibility. Treat the rest as speculation.

## 3. Options compared

| Option                                                             |    JS KB | Build cost |                                Deps | Maintenance                                  | Call            |
| ------------------------------------------------------------------ | -------: | ---------- | ----------------------------------: | -------------------------------------------- | --------------- |
| Hand-written head component, sitemap, robots and Atom templates    |        0 | <1 s       |                                   0 | Low (templates fail fast in CI)              | **Yes**         |
| `@astrojs/sitemap` + `@astrojs/rss`                                |        0 | <1 s       |                                   2 | Upgrades; RSS isn't Atom                     | No              |
| Static OG PNGs (2)                                                 |        0 | 0          |                                   0 | Re-export when copy changes                  | **Yes**         |
| Build-time OG (satori + resvg)                                     |        0 | +1-3 s     | 2 (one native, stale since 2024-03) | Medium                                       | No              |
| llms.txt + `.md` twins from the content model                      |        0 | <1 s       |                                   0 | Low (same source)                            | **Yes**         |
| Content negotiation in a Worker (`run_worker_first`)               | 0 client | -          |                                   0 | Worker on every request; `_headers` bypassed | No              |
| Cloudflare Markdown for Agents                                     |        0 | -          |                                   - | Pro plan                                     | No (paid)       |
| JSON-LD: WebSite + SoftwareApplication (+ optional BreadcrumbList) |        0 | -          |                                   0 | Low                                          | **Yes**         |
| FAQPage JSON-LD                                                    |        0 | -          |                                   0 | -                                            | No (deprecated) |

## 4. The lead's call (C6 SEO/AEO control, C9 exit cost)

- Every framework candidate (Astro, SvelteKit static, Eleventy, Vite MPA, RR7 prerender) can emit `<head>`, `.xml`,
  `.txt`, `.md` and `_headers`. On C6 they all score 4-5. Astro and Eleventy have the most natural "emit a non-HTML file
  from a route" (Astro endpoints such as `releases.atom.ts` and `index.md.ts`; Eleventy permalinks), so give them **5**.
  SvelteKit's `+server.ts` with `prerender = true` also works (**5**). A plain Vite MPA needs a custom plugin or script
  (**3**). RR7/TanStack prerender of non-HTML resource routes works but is less documented (**4**, unverified).
- SEO/AEO does not decide the stack. Spend the weight on C1/C2.

## 5. Ruling log

- Trailing slash: directory format plus `auto-trailing-slash`, with `/releases/` canonical · this matches Cloudflare's
  default and avoids config · html-handling doc (2026-04-23) · cost if wrong: one redirect hop per mistyped link.
- 404 SEO target 92, not 100 · `http-status-code` weight 1 of 13.04 · Lighthouse 13.6.0 source · cost if wrong: CI
  blocks every deploy, or someone "fixes" it by serving 200.
- Allow all AI bots · open-source, discovery matters more than training opt-out · vendor docs above · cost if wrong:
  content in training sets that would be there via GitHub anyway.
- No FAQPage markup · deprecated · Google changelog (2026-05-08, 2026-06-15) · cost if wrong: ~15 lines omitted.

## 6. Open questions

1. Build the Atom feed (brief) or link GitHub's `releases.atom` (HANDOFF.md:496)? I recommend building it: it's ~40
   lines and keeps the feed on our own domain.
2. Does Bot Preference Sync touch a robots.txt served by Workers static assets on a custom domain? The docs are silent.
   Verify with curl after the first deploy.
3. Does Claude Code's WebFetch really send `Accept: text/markdown`? The only source is Cloudflare's claim. It doesn't
   change the call (we ship `.md` twins via `rel=alternate` either way).
4. Does wrangler map `.md` to `text/markdown` and `.atom` to `application/atom+xml`? Not verified, so set both
   explicitly in `_headers`.
5. Site origin / custom domain name: owned by the user, needed for absolute canonicals (HANDOFF `SITE_URL`).

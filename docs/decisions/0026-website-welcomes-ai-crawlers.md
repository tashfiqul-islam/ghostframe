# 0026. The website welcomes every crawler, AI training included

Status: proposed.

## Context

ghostframe is open source, and its site exists to be found and quoted, by search engines and by AI answer engines and
agents. Blocking AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot and the rest) would keep the project
out of the models its users work with every day. Cloudflare can block AI bots for a zone and prepend rules to a managed
`robots.txt` ([SEO and AEO research](../design/website/research/07-seo-and-aeo.md)).

## Decision

`robots.txt` allows every crawler, AI training crawlers included, and points at the sitemap. The site also serves
`/llms.txt` and a Markdown copy of each page, linked with `rel="alternate"`. Cloudflare's AI bot blocking and managed
`robots.txt` stay off for the zone.

## Consequences

- The evidence that `llms.txt` is read is weak (Google says the files are not needed for Search; most such files get no requests). It is
  kept because it is cheap and the audience is coding agents; drop it if it ever costs maintenance.
- Turning Cloudflare's AI bot setting off is a dashboard step for the owner when the domain is set up.

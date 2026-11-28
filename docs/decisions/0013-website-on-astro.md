# 0013. The website is built with Astro, as static output

Status: accepted.

## Context

The website is a static marketing site: one long landing page, the release notes with an Atom feed, and a 404, with
about fifty small interactive pieces and no per-request content. The same page (the hero with its frame, the demo with
its tabs, the nav) was built three ways and measured with Lighthouse 13.6.0 on a throttled run
([stack.md, spikes](../design/website/stack.md#spikes)):

| Spike                              |                 JS on first load | Lighthouse, mobile and desktop |            Mobile LCP |  Build |
| ---------------------------------- | -------------------------------: | ------------------------------ | --------------------: | -----: |
| Astro 7.4.13, plain TypeScript     |                           3.1 KB | 100 in all four                |              1,655 ms | 1.06 s |
| Astro 7.4.13, React 19 demo island | 71.9 KB once the demo is in view | 100 in all four                |              1,502 ms | 1.15 s |
| SvelteKit 3.4.1, Svelte 5          |                          47.9 KB | 100 in all four                | 1,909 ms, over budget | 1.29 s |

SvelteKit hydrates the whole page, needs TypeScript 6 and accepts no TypeScript config file of its own. Eleventy 3 and a
plain Vite multi-page build would ship the same JavaScript as Astro, without typed content collections or checked
templates ([framework research](../design/website/research/01-framework-runtime-tooling.md)).

## Decision

The site uses Astro 7, `output: 'static'`, with no adapter, no server islands and no client router. Pages and layouts
are `.astro` files whose scripts are TypeScript modules. Build-time data goes through one site-data module
(`site/build/site-data`) that reads the repository once and validates it with zod (bundled with Astro), not through
Astro content collections: the post-build checks run outside Astro and read the same module, which `astro:content`
would not let them do ([architecture review](../design/website/stack.md#the-walking-skeleton), candidate 1).

## Consequences

- Astro has shipped three majors in nineteen months and backports security fixes to one previous major only, so a
  major upgrade is a yearly chore; the output is plain HTML, CSS and JS, so leaving Astro means rewriting templates,
  not content.
- `.astro` files are type-checked by the checker in ADR 0023, not by `astro check`, which refuses TypeScript 7.
- Page transitions use cross-document `@view-transition` as an enhancement; Astro's client router (5.6 KB) is not used.

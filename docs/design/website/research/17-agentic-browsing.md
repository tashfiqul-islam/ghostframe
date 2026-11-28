# 17 · Lighthouse Agentic Browsing, WebMCP, ARD and llms.txt

Read 2026-11-29. The Lighthouse facts come from the installed `lighthouse` 13.6.0 package (its source, cited by path
under `node_modules/lighthouse/`) and from runs in the walking skeleton; the rest from the primary sources linked. A
background research agent gathered sections 3 to 6; the decision-bearing claims were then checked at the source
(the scoring page, the chromestatus entry). "Not verified" marks what no primary source confirmed.

## 1. Which Lighthouse has it

- Changelog (<https://github.com/GoogleChrome/lighthouse/blob/main/changelog.md>): 13.2.0 (2026-04-30) adds the
  category; 13.3.0 (2026-05-07) puts it in the default config; 13.4.1 moves the WebMCP check to `document.modelContext`;
  13.5.0 (2026-09-17) adds `ard-schema`; 13.6.0 (2026-10-27) ports ARD to v0.91 and fails `llms-txt` on HTTP 429.
- **13.6.0, the pinned version, has it in its default config** (`core/config/default-config.js:646`): every run the
  skeleton already made produced the category; the spec just did not assert it. No upgrade, so nothing changes in the
  other four categories or the harness.
- The docs (<https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring>, read 2026-11-29): "Testing this
  category requires Chrome 150 or later"; "The Agentic Browsing category and WebMCP support are experimental and based
  on proposed standards"; "WebMCP audits require registering for the WebMCP origin trial"; "does not have a weighted
  average score from 0 to 100", a fraction instead.

## 2. The audits, from the source

The category (`categoryScoreDisplayMode: 'fraction'`) has seven audits of weight 1. An audit counts toward the fraction
unless its result is not applicable, informative or manual (`report/renderer/report-utils.js`,
`calculateCategoryFraction`); the LHR's `score` is the mean of the counted ones (`core/scoring.js`).

| Audit                      | Passes when                                                                                                                           | Not counted when                                                                                              | Source                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `agent-accessibility-tree` | none of 33 axe rules fails: names and labels (`button-name`, `link-name`, `label`, …), ARIA validity, `aria-hidden-focus`, `tabindex` | never                                                                                                         | `core/audits/agentic/agent-accessibility-tree.js`                           |
| `cumulative-layout-shift`  | the Performance audit's CLS passes                                                                                                    | never; it **errors** when the run has only this category (`--only-categories=agentic-browsing`)               | `core/config/default-config.js`                                             |
| `llms-txt`                 | `/llms.txt` has a line matching `^\s*#\s+.+`, a `[..](..)` link and 50 characters or more                                             | it answers 400 to 499, except 429 (which fails, as do 5xx and fetch errors)                                   | `core/audits/agentic/llms-txt.js`                                           |
| `ard-schema`               | the manifest validates against ARD v0.91 with no errors (warnings score 0.9)                                                          | `/.well-known/ard.json` answers 4xx and nothing advertises one (no `Agentmap:` in robots.txt, no `rel="ard"`) | `core/audits/agentic/ard-schema.js`, `core/gather/gatherers/agentic/ard.js` |
| `webmcp-registered-tools`  | informative only: lists the tools, warns above 40                                                                                     | always informative; not applicable when the page has no `navigator.modelContext` or `document.modelContext`   | `core/audits/webmcp-registered-tools.js`                                    |
| `webmcp-form-coverage`     | informative only: lists forms without `toolname` or `tooldescription`                                                                 | the page has no form, or no WebMCP                                                                            | `core/audits/webmcp-form-coverage.js`                                       |
| `webmcp-schema-validity`   | Chrome reports no `FormModelContext*` issue (an error scores 0, a warning 0.5)                                                        | no WebMCP, or no tools and no issues                                                                          | `core/audits/webmcp-schema-validity.js`                                     |

So for a page with no forms and no tools, three audits can count: the accessibility tree, CLS and llms.txt.

Measured in the skeleton, Chrome 158.0.8127.88 headless on Windows:

- `--enable-features=WebMCP` exposes WebMCP without a token: `webmcp-registered-tools` turns from not applicable to
  informative. `--enable-experimental-web-platform-features` does the same.
- With `--only-categories=agentic-browsing`, `cumulative-layout-shift` errors (no performance trace). It runs beside
  Performance.

## 3. WebMCP

- Spec: Draft Community Group Report, 24 November 2026, Web Machine Learning CG, not a W3C standard
  (<https://webmachinelearning.github.io/webmcp/>). Imperative API: `document.modelContext.registerTool(tool, { signal,
  exposedTo })`; a tool has `name`, `description`, `execute` (required), `title`, `inputSchema` (JSON Schema),
  `outputSchema`, `annotations` (`readOnlyHint`, `untrustedContentHint`, `consequentialHint`, `debugging`).
- It has moved twice in a year: `provideContext()` and `clearContext()` were removed (PR #132, 2026-03-05), and the
  entry point moved from `navigator` to `document` (PR #184, 2026-05-27).
- Declarative API (a separate explainer, "not part of the specification"): `toolname`, `tooldescription` and
  `toolautosubmit` on `<form>`, `toolparamdescription` on controls
  (<https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md>).
- Unsupported browsers: `document.modelContext` is undefined; a guard on it is the whole fallback. No official
  detection snippet (not verified beyond the spec, explainer and Chrome docs).

## 4. The origin trial

- chromestatus feature 5117755740913664 (<https://chromestatus.com/feature/5117755740913664>, API read 2026-11-29):
  origin trial Chrome 149 to 156, extended to 162; `finch_name` `WebMCP`. Chrome 162 stable: 2027-02-02
  (chromiumdash). The console's exact end date: not verified.
- Tokens are per origin, by `<meta http-equiv="origin-trial">` or an `Origin-Trial` header; "Chrome ignores invalid or
  expired tokens", so on expiry the feature is simply off
  (<https://developer.chrome.com/docs/web-platform/origin-trials>). A production token does not cover `localhost` or CI.

## 5. ARD

- Agentic Resource Discovery v0.91 (2026-08-26), status "Proposal" (<https://agenticresourcediscovery.org/spec/>).
  `/.well-known/ard.json` or `<link rel="ard">`; the manifest needs only `entries`; each entry needs an `identifier`
  (`urn:air:<publisher>:<namespace>:<name>`), `displayName`, `type` (a media type) and exactly one of `url` or `data`;
  2 to 5 `representativeQueries` are expected (a warning otherwise, which scores 0.9).
- It catalogues agents, MCP servers and APIs. This site has none.

## 6. llms.txt

- <https://llmstxt.org/>: an H1 (the only required part), a blockquote summary, optional prose, then H2 sections of
  `- [name](url): notes`. `llms-full.txt` is not in the spec; it is a docs-platform convention.

## 7. CI

- GitHub's `ubuntu-24.04` image 20261122.23.1 ships Google Chrome 158.0.8127.36
  (<https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>): past the Chrome 150
  minimum. The category needs no display and runs in navigation mode headless, as the other four do, and
  `--enable-features=WebMCP` is a plain Chrome switch. Not yet run on a Linux runner: the skeleton runs on Windows.

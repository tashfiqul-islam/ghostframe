# 0028. The website passes Agentic Browsing with llms.txt, and registers no WebMCP tools

Status: accepted.

## Context

Lighthouse 13.6.0, the pinned version, has a fifth category, Agentic Browsing, in its default config: a fraction of
passed audits, not a 0 to 100 score, marked experimental, Chrome 150 or later. Of its seven audits, an audit counts
only when it applies and is not informative. For a page with no forms and no WebMCP tools, three count: the
accessibility tree for agents (33 axe rules on names, labels and ARIA), CLS, and `llms.txt`. The two ARD and WebMCP
audits that could count do not apply here: `ard-schema` while `/.well-known/ard.json` answers 404 and nothing
advertises one, `webmcp-schema-validity` while no tool or form is registered
([research](../design/website/research/17-agentic-browsing.md)).

WebMCP is a Community Group draft whose entry point moved from `navigator` to `document` this year, behind an origin
trial for Chrome 149 to 162 (stable 2027-02-02) with per-origin tokens that Chrome ignores once expired. ARD v0.91 is a
"Proposal" that catalogues agents, MCP servers and APIs.

## Decision

- Every applicable Agentic Browsing audit passes on every page, mobile and desktop, beside 100 in the other four. The
  Lighthouse spec asserts that exactly the accessibility tree, CLS and `llms-txt` count, and that all three pass.
- `/llms.txt` is built from site data and the site's words (`build/llms`), the same as the pages: the summary, the
  version and Claude Code range, every README command, and links to the pages and the feed at the site origin. The
  site checks read it like a page, for facts and internal names. No `llms-full.txt`: it is not in the spec, and the
  whole site fits in the planned `index.md` copies.
- No `ard.json`: the site offers no agent, MCP server or API to list, and an ARD entry for a web page would invent a
  catalogue to pass an audit that does not apply.
- No WebMCP tools. The candidates (the install commands, compatibility with a Claude Code version, the latest release
  notes) are static facts already in the HTML and in `llms.txt`, which an agent reads without a tool. Imperative tools
  would add a script to every page: 755 bytes gzipped (1,629 minified) for the three, read-only, with their schemas
  and data inlined, measured with a throwaway module on 2026-11-29; small against the 120 KB ceiling, but code to keep
  in step with a moving draft. The site has no form to annotate declaratively. A token would cover one origin, which is not chosen yet, and end with the
  trial. The audits gain nothing: registered tools are informative.
- The spec runs Chrome with `--enable-features=WebMCP`, so the WebMCP audits run instead of reading not applicable,
  and asserts the flag took (`webmcp-registered-tools` is informative, listing none). Agentic Browsing always runs
  beside Performance: alone, its CLS audit errors.

## Consequences

- A form added later, or a script that registers a tool, makes `webmcp-schema-validity` count, and the spec fails
  until it is reviewed against this record.
- The category is experimental: a Lighthouse upgrade can add or change audits, and the spec's list of counted audits
  then fails loudly, by name, rather than drifting.
- Revisit WebMCP when it ships without a trial, or when the site gains a real interactive tool (a compatibility check
  a visitor types into would be a declarative form). Revisit ARD if ghostframe ever publishes an MCP server.
- CI runs the category on the runner's own Chrome (158 on `ubuntu-24.04`); not yet measured on Linux.

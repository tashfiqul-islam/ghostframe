# Decisions

Short records of decisions already made: the context, the decision, and what follows from it.

| Record                                                 | Decision                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [0001](0001-renderers-on-the-engine-layer.md)          | New renderers on the same engine layer                                          |
| [0002](0002-waiting-on-agents-by-mode.md)              | Waiting on agents: the pane head when docked, the band in fallback              |
| [0003](0003-no-needs-you-row-on-the-left.md)           | No NEEDS YOU row on the left                                                    |
| [0004](0004-hint-row-second-to-last.md)                | The hint row on the pane's second-to-last row                                   |
| [0005](0005-files-counts-known-limit.md)               | Files counts are a known limit                                                  |
| [0006](0006-never-invent-a-page-title.md)              | Sources: never invent a page title                                              |
| [0007](0007-outside-project-files-not-diffed.md)       | Files outside the project are listed but never diffed                           |
| [0008](0008-status-line-as-installed-command.md)       | The status line ships as an installed command                                   |
| [0009](0009-half-block-ghost-mark.md)                  | The status line mark is the half-block ghost                                    |
| [0010](0010-status-line-on-bun.md)                     | The status line runs on Bun, not compiled executables                           |
| [0011](0011-mascot-outside-ghost-inside.md)            | The mascot outside the terminal, the ghost inside it                            |
| [0012](0012-engine-range.md)                           | ghostframe is dormant outside a tested range of Claude Code                     |
| [0013](0013-website-on-astro.md)                       | The website is built with Astro, as static output                               |
| [0014](0014-website-islands-without-a-ui-framework.md) | The website's interactive pieces are plain TypeScript, with no UI framework     |
| [0015](0015-website-plain-css-with-tokens.md)          | The website is styled with plain CSS and one tokens file, not Tailwind          |
| [0016](0016-website-motion-without-a-library.md)       | The website's motion uses the platform, with no animation library               |
| [0017](0017-website-font-subsets.md)                   | The website builds its own font subsets, with the terminal's glyphs             |
| [0018](0018-website-brand-art-as-exported.md)          | The website ships brand art as exported, and inlines the hero mascot            |
| [0019](0019-website-reads-release-please.md)           | The release notes read release-please's text, and git only for counts           |
| [0020](0020-website-on-workers-static-assets.md)       | The website is an assets-only Worker, with headers written at build             |
| [0021](0021-website-ci-job-always-runs.md)             | One website CI job that always runs, and skips its work when site/ is untouched |
| [0022](0022-website-own-package.md)                    | site/ is its own package, beside the plugin, with no workspace                  |
| [0023](0023-website-typescript-only.md)                | The website is TypeScript everywhere, checked by tsc and tsrs                   |
| [0024](0024-website-analytics-without-a-script.md)     | The website counts visits without a script                                      |
| [0025](0025-website-boot-curtain-on-the-stage.md)      | The boot curtain covers the hero stage only                                     |
| [0026](0026-website-welcomes-ai-crawlers.md)           | The website welcomes every crawler, AI training included                        |
| [0027](0027-website-404-status-and-lighthouse.md)      | The 404 answers with a real 404 status, and Lighthouse audits its file          |

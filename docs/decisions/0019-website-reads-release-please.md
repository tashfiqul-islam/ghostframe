# 0019. The release notes read release-please's text, and git only for counts

Status: accepted.

## Context

The designer's handoff builds an untagged version's notes from `git log`. Nine commit subjects in that range carry
internal names ("Cockpit v8", "phase 5" to "phase 11", "v7 spec"); release-please hides them through commit-override
blocks on the pull requests ([content research](../design/website/research/09-repo-fit-tests-and-content.md)). Before
1.0.0 is tagged there is no `CHANGELOG.md` on main, but the repository is public, and the release branch
`release-please--branches--main--components--ghostframe` carries the pending one, with the same text as the release
pull request's body. It can be fetched without a token.

## Decision

Release text comes only from release-please: `CHANGELOG.md` on main, or, while no release is tagged, the same file on
the release branch. Git supplies numbers only: commits per day for the road to 1.0.0, commit counts and compare
ranges. A check over the built site fails on any internal name.

## Consequences

- The site's CI job runs with `fetch-depth: 0` for the counts. While main has no `CHANGELOG.md`, it fetches the
  release branch and writes that branch's `CHANGELOG.md` into the checkout before the build; the site-data module then
  requires the file, so a missing changelog fails the build with its name.
- The parser accepts both heading forms release-please writes (`## 1.0.0 (date)` and `## [x.y.z](link) (date)`).
- Text that leaks an internal name today, such as a spec section number in a changelog entry, fails the build; the
  fix is an override on the pull request, not a filter in the site.

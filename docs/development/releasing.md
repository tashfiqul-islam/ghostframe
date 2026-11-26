# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please). It reads the
conventional commits on `main`, so the PR title you squash-merge decides what the changelog says.

## How a release happens

1. Every push to `main` runs the Release workflow (`.github/workflows/release.yml`).
2. release-please keeps one release PR open, titled `chore(release): ghostframe X.Y.Z`. It bumps `version` in
   `.claude-plugin/plugin.json` and adds the new section to `CHANGELOG.md`.
3. Merging that PR runs the workflow again. It tags the merge commit `vX.Y.Z` and publishes the GitHub Release
   with the same notes. It also tags the same commit `ghostframe--vX.Y.Z`: Claude Code resolves a dependency's
   version range against `<plugin>--v<version>` tags, so a plugin that depends on ghostframe can pin a range.

The version lives in one place, `.claude-plugin/plugin.json`. The Cockpit pane reads it for its wordmark, and Claude
Code reads it to decide whether an installed copy is out of date. The marketplace entry has no `version` on purpose:
when both set one, `plugin.json` wins and `claude plugin validate` warns.

## What goes in the changelog

| Commit type                 | Section     |
| --------------------------- | ----------- |
| `feat`                      | Features    |
| `fix`, `security`, `revert` | Fixes       |
| `perf`                      | Performance |
| `docs`                      | Docs        |
| `refactor`, `test`, `build` | Internal    |
| `chore`, `ci`, `style`      | not shown   |

The section rules are in `release-please-config.json`. To change what a merged PR says in the changelog, add this
block to the PR's description and let the Release workflow run again (a push to `main`, or run it by hand):

```text
BEGIN_COMMIT_OVERRIDE
feat(cockpit): the line the changelog should show
END_COMMIT_OVERRIDE
```

It works only for squash merges, which is all `main` allows.

## See the next release before it happens

```sh
bun run --cwd tools release:dry
```

It runs the release-please CLI (pinned, fetched by `bunx`, not a dependency) in dry-run mode against the `main`
branch on GitHub, with your `gh` login as the token. It prints the version and changelog the next release PR would
have, and changes nothing. Add `--target-branch=<branch>` after `--` to try a pushed branch instead.

## The first release

`release-please-config.json` sets `"release-as": "1.0.0"` so the first release is 1.0.0 whatever the commits say.
After v1.0.0 is published, remove that line in a `chore(release)` PR, or every later release PR proposes 1.0.0 again.

## The release app

A PR opened with the workflow's own `GITHUB_TOKEN` starts no workflows, so the release PR would never get the checks
`main` requires. The Release workflow uses a token from a small GitHub App instead. Its two secrets are kept in an
environment named `release` that only `main` can use.

Run the wizard once, from the repository root:

```sh
bash tools/scripts/release-app-wizard.sh
```

It walks you through these steps and does the `gh` parts itself:

1. Create a GitHub App at <https://github.com/settings/apps/new>:
   - any free name, such as `ghostframe-release-<you>`, and the repository URL as its homepage;
   - Webhook: clear **Active**;
   - Repository permissions: **Contents**, **Issues** and **Pull requests** set to **Read and write**. **Metadata**
     becomes **Read-only** by itself. Everything else stays at **No access**;
   - installable **Only on this account**.
2. Copy the app's **Client ID** from its General page.
3. Under **Private keys**, click **Generate a private key**. The browser downloads a `.pem` file.
4. **Install App** → **Install** → **Only select repositories** → `ghostframe`.
5. Create the `release` environment with deployments from `main` only.
6. Store `RELEASE_APP_CLIENT_ID` and `RELEASE_APP_PRIVATE_KEY` in that environment, then delete the `.pem`.

To do it by hand instead, follow the same steps and, for 5 and 6, use **Settings → Environments → New environment**
(`release`, **Deployment branches and tags** → **Selected branches and tags** → `main`) and add the two values as
environment secrets there.

## Repository rulesets

`.github/rulesets/` holds the two rulesets as they should be on GitHub, so a change to them is reviewed like code:

- `main.json`: the default branch takes squash merges through a PR only, signed and linear, with the gate, the PR title
  check, dependency review and Tests on all three systems required;
- `tags.json`: release tags, `v*` and `ghostframe--v*`, can be neither moved nor deleted.

An admin applies them with the GitHub CLI:

```sh
gh api --method PUT repos/tashfiqul-islam/ghostframe/rulesets/27507868 --input .github/rulesets/main.json
gh api --method PUT repos/tashfiqul-islam/ghostframe/rulesets/27507872 --input .github/rulesets/tags.json
```

# Contributing

Thanks for helping. Bug reports, fixes and ideas are all welcome. For anything larger than a fix, open an issue
first so we can agree on the shape before you build it.

## Set up

You need [mise](https://mise.jdx.dev), which installs the pinned toolchain (Bun and the linters), and the `claude` CLI
on your `PATH`, which runs the plugin's tests.

```sh
mise install
mise run setup        # the dev tools in tools/ and the git hooks
```

To try your copy in a session, start Claude Code with the repository as a plugin folder:

```sh
claude --plugin-dir .
```

## Check your change

```sh
mise run check        # the whole gate: types, lint, format, boundaries, validation, tests, workflows, docs
```

The pieces, and where tests go, are in [docs/development/testing.md](docs/development/testing.md). A change to what
Cockpit draws also needs:

- the [spec](docs/design/cockpit.md) updated in the same PR, since it is the source of truth;
- a look in a real session at 200 and 100 columns: the [live checks](docs/development/live-checks.md) do that, and
  their captures make good screenshots for the PR.

## Commits and PR titles

Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`.
The git hook and CI check them with the rules in `tools/commitlint.config.ts`:

- types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`, `security`;
- scopes: `hooks`, `theme`, `tests`, `deps`, `actions`, `ci`, `docs`, `release`, `tooling`, `cockpit`, `statusline`.

`main` takes squash merges only, so the PR title becomes the commit and the changelog line. Write it for a user.

## Releases

Releases are automated from the commits on `main`: see [docs/development/releasing.md](docs/development/releasing.md).
You don't bump versions or edit `CHANGELOG.md` by hand.

## Conduct and security

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as
[SECURITY.md](SECURITY.md) says.

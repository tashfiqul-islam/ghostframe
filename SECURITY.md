# Security

## Report a vulnerability

Report it privately on GitHub: open this repository's **Security** tab and choose **Report a vulnerability**. Only the
maintainers can read the report. Please don't open a public issue for it.

Include what you found, how to reproduce it, the ghostframe and Claude Code versions, and your OS. The maintainer
answers on the report. A fix ships in a release, with a GitHub security advisory that can credit you.

## What counts

ghostframe runs inside your Claude Code session, so a vulnerability is anything that lets it be used against you:

- reading or writing files outside what this repository's docs say it touches;
- running a command you didn't expect, or with input someone else controls;
- the status line installer changing more of `settings.json` than its `statusLine` entry;
- leaking anything from your session, your settings or your environment.

## Supported versions

Only the latest release gets fixes.

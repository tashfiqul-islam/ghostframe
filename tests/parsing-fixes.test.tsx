import { expect, test } from 'claude-code/testing'

import { activityHead, firstErrorLine, foldOutput, shipResult, stepOf } from '../hooks/activity'
import { splitBlocks } from '../hooks/blocks'
import { parseShip, parseTests, runnerOf } from '../hooks/outcome'
import { parseCited, sourceLabel, sourcesFrame } from '../hooks/research'
import { clean } from '../hooks/testsummary'

const OK = { isRunning: false, isErrored: false, isInterrupted: false }
const ERR = { ...OK, isErrored: true }

// Wide enough to stay green on a slow CI runner, far under the seconds the old patterns took.
const LINEAR_MS = 250

/** Milliseconds `f` takes. */
const ms = (f: () => unknown) => {
  const t = Date.now()
  f()
  return Date.now() - t
}

test('heading: a long run of spaces parses in linear time, closing hashes still go', () => {
  expect(ms(() => splitBlocks(`# a${' '.repeat(3000)}b`))).toBeLessThan(LINEAR_MS)
  expect(splitBlocks('# Title ##')).toEqual([{ kind: 'heading', text: 'Title' }])
  expect(splitBlocks('## Next steps')).toEqual([{ kind: 'heading', text: 'Next steps' }])
  expect(splitBlocks('### A #')).toEqual([{ kind: 'heading', text: 'A' }])
})

test('heading: a `#` that ends a word stays; only a closing run after a space goes', () => {
  expect(splitBlocks('## C#')).toEqual([{ kind: 'heading', text: 'C#' }])
  expect(splitBlocks('# F# and C# ##')).toEqual([{ kind: 'heading', text: 'F# and C#' }])
  expect(splitBlocks('# Issue #')).toEqual([{ kind: 'heading', text: 'Issue' }])
})

const RUN = ' '.repeat(40000)

test('linear: trailing-space trim in blocks and shell output', () => {
  expect(ms(() => splitBlocks(`a${RUN}b`))).toBeLessThan(LINEAR_MS)
  expect(ms(() => foldOutput(`a${RUN}b`))).toBeLessThan(LINEAR_MS)
})

test('linear: a parenthesised URL after a long run of spaces', () => {
  expect(ms(() => parseCited(`a${RUN}b [x](https://x.dev/a)`, new Map()))).toBeLessThan(LINEAR_MS)
})

test('linear: a repo ref scan over a long slash-less word', () => {
  expect(ms(() => parseCited(`${'a'.repeat(40000)} [x](https://x.dev/a)`, new Map()))).toBeLessThan(LINEAR_MS)
})

test('linear: a long pytest-like summary line', () => {
  expect(ms(() => parseTests(`== ${'1 passed in 1s '.repeat(2500)}`))).toBeLessThan(LINEAR_MS)
  expect(parseTests('===== 3 failed, 142 passed, 2 skipped in 3.21s =====')).toEqual({ passed: 142, failed: 3, skipped: 2 })
})

test('linear patterns read the same as before', () => {
  expect(parseCited('Bun has a default (https://bun.com/docs/test/runtime-behavior).', new Map())?.cites.map(c => c.url)).toEqual([
    'https://bun.com/docs/test/runtime-behavior'
  ])
  expect(
    parseCited('see anthropics/claude-code#1 (https://github.com/anthropics/claude-code/issues/1)', new Map())
      ?.runs.map(r => r.t)
      .join('')
  ).toBe('see anthropics/claude-code#1¹')
})

test('denied: only the engine own denial, never a shell error that says so', () => {
  for (const out of ['bash: ./x: Permission denied', 'git@github.com: Permission denied (publickey).', 'Error: Promise was rejected']) {
    const step = stepOf('Bash', { command: './x' }, out, ERR)
    expect(step?.result[0]?.text).toBe('failed')
    expect(step?.detail).toBe(out)
  }
  for (const out of [
    "The user doesn't want to proceed with this tool use.",
    'Permission to use Bash with command rm -rf ab has been denied.',
    'The user denied this call.',
    'The user rejected the edit.'
  ]) {
    expect(stepOf('Bash', { command: 'rm x' }, out, ERR)?.result[0]?.text).toBe('denied')
  }
})

test('fences: a longer fence holds a shorter one, and ~~~ never closes ```', () => {
  // Prose inside the fence stays code: one engine block, never a paragraph of ours.
  const outer = '````markdown\n```js\n\nplain words\n\n```\n````'
  expect(splitBlocks(outer)).toEqual([{ kind: 'markdown', text: outer }])
  const mixed = '```\n~~~\n\nplain words\n\n```'
  expect(splitBlocks(mixed)).toEqual([{ kind: 'markdown', text: mixed }])
  // A fence line with text after it never closes.
  const info = '```\n``` x\n\nplain words\n\n```'
  expect(splitBlocks(info)).toEqual([{ kind: 'markdown', text: info }])
  // A backtick run with a backtick in its info string is inline code, not a fence: the
  // paragraph after it stays ours.
  expect(splitBlocks('``` a ` b\n\nplain words').at(-1)?.kind).toBe('para')
  // A table right under a closed fence still splits out.
  expect(splitBlocks('````\n```\n````\n| a | b |\n|---|---|\n| x | 1 |').map(b => b.kind)).toEqual(['markdown', 'table'])
})

test('git commit: detached HEAD header, and global options before the subcommand', () => {
  const out = '[detached HEAD a1b2c3d] fix: one\n 1 file changed, 2 insertions(+)'
  expect(parseShip('c', 'git commit -m one', out)?.commit).toEqual({ sha: 'a1b2c3d', subject: 'fix: one', files: 1, adds: 2, dels: 0 })
  expect(shipResult('git commit -m one', out)?.map(r => r.text)).toEqual(['committed', 'a1b2c3d'])
  for (const cmd of ['git -C app commit -m one', 'git -c user.name=x commit -m one', 'git --no-pager commit -m one']) {
    expect(parseShip('c', cmd, '[main a1b2c3d] fix: one')?.commit?.sha).toBe('a1b2c3d')
    expect(shipResult(cmd, '[main a1b2c3d] fix: one')?.map(r => r.text)).toEqual(['committed', 'a1b2c3d'])
  }
  expect(parseShip('p', 'git -C app push', ' * [new branch]      a -> a')?.push).toEqual({ from: 'a', to: 'a' })
})

test('test runner: only in command position', () => {
  for (const cmd of ['cat vitest.config.ts', 'npm i -D jest', 'rg pytest src', 'ls node_modules/mocha']) {
    expect(`${cmd}: ${runnerOf(cmd)}`).toBe(`${cmd}: undefined`)
    expect(stepOf('Bash', { command: cmd }, { stdout: '', stderr: '' }, OK)?.verb).toBe('shell')
  }
  expect(runnerOf('bun test')).toBe('bun test')
  expect(runnerOf('npx vitest run')).toBe('vitest')
  expect(runnerOf('cd a && pytest -q')).toBe('pytest')
  expect(runnerOf('bunx vitest run')).toBe('vitest')
  expect(runnerOf('claude plugin test .')).toBe('claude plugin test')
  expect(runnerOf('npm run test')).toBe('npm test')
  expect(runnerOf('pnpm exec jest')).toBe('jest')
  expect(runnerOf('go test ./...')).toBe('go test')
  expect(runnerOf('ls | mocha')).toBe('mocha')
})

test('test runner: launchers, wrappers, a new line or a path before it still count', () => {
  const cases: [string, string][] = [
    ['cd app\nbun test', 'bun test'],
    ['cd a\nnpx vitest run', 'vitest'],
    ['time bun test', 'bun test'],
    ['time npx jest', 'jest'],
    ['env CI=1 vitest', 'vitest'],
    ['sudo cargo test', 'cargo test'],
    ['python -m pytest -q', 'pytest'],
    ['python3 -m pytest', 'pytest'],
    ['uv run pytest', 'pytest'],
    ['poetry run pytest', 'pytest'],
    ['pipenv run pytest', 'pytest'],
    ['bash -c "pytest -x"', 'pytest'],
    ['(cd a && vitest)', 'vitest'],
    ['./node_modules/.bin/vitest run', 'vitest']
  ]
  for (const [cmd, runner] of cases) expect(`${cmd}: ${runnerOf(cmd)}`).toBe(`${cmd}: ${runner}`)
})

test('test summaries: Mocha and dotnet count', () => {
  expect(parseTests('  5 passing (12ms)\n  2 failing\n  1 pending')).toEqual({ passed: 5, failed: 2, skipped: 1 })
  expect(parseTests('Passed!  - Failed:     0, Passed:    12, Skipped:     1, Total:    13, Duration: 1 s')).toEqual({ passed: 12, failed: 0, skipped: 1 })
})

test('error detail and shell output lose every escape and control', () => {
  expect(firstErrorLine('\x1b[31merror: boom\x1b[0m')).toBe('error: boom')
  expect(stepOf('Bash', { command: 'x' }, '\x1b[31merror: boom\x1b[0m', ERR)?.detail).toBe('error: boom')
  expect(clean('\x1b]8;;https://x.dev\x07link\x1b]8;;\x1b\\ \x1b(Bok\x07\x00 \x9bdone\ta\r\nb')).toBe('link ok done\ta\nb')
})

test('source labels: no userinfo host, no bidi or format characters', () => {
  expect(sourceLabel('https://github.com@other.tld/x')).toBe('other.tld · x')
  expect(sourceLabel('https://x.dev/a/%E2%80%AEtxt.exe')).toBe('x.dev · txt.exe')
  expect(sourceLabel('https://x.dev/a/b%00c')).toBe('x.dev · bc')
  expect(sourceLabel('bun.sh/guides/test/timeout.md')).toBe('bun.sh · timeout')
})

test('source labels: a host the URL parser rejects is cleaned the same way', () => {
  expect(sourceLabel(`https://ev${String.fromCodePoint(0x202e)}il.com/x`)).toBe('evil.com · x')
  expect(sourceLabel('user@evil.com/x')).toBe('evil.com · x')
})

test('link markers: text with private-use glyphs falls back; a fallback takes no number', () => {
  expect(parseCited('icon  and [b](https://b.dev/y)', new Map())).toBe(undefined)
  const n = new Map<string, number>()
  expect(parseCited('see [a](https://a.dev/x) then ', n)).toBe(undefined)
  expect(n.size).toBe(0)
})

test('a turn with a million steps: the activity rule does not throw', () => {
  const steps = Array.from({ length: 1_000_000 }, (_, i) => ({ id: String(i), turn: 't', at: i, ms: 1 }))
  expect(activityHead(steps, '0')).toBe('1000000 steps · 16m 40s')
})

test('a Sources frame with twenty thousand entries draws in linear time', () => {
  // Quadratic title counting took about 4 s here; linear is well under a second.
  const cites = Array.from({ length: 20_000 }, (_, i) => ({ n: i + 1, url: `https://x.dev/${i}`, title: `t${i}` }))
  expect(sourcesFrame(cites, 80).length).toBeGreaterThan(20_000)
})

test('gh pr create: a flag inside a quoted title is not a flag', () => {
  const url = 'https://github.com/me/app/pull/9'
  expect(parseShip('r', 'gh pr create --title "drop -B main and -H x" --fill', url)?.pr).toEqual({ n: 9, url })
  expect(parseShip('r', "gh pr create --title 'a -B b' -B dev --head=feat", url)?.pr).toEqual({ n: 9, url, head: 'feat', base: 'dev' })
  expect(parseShip('r', 'gh pr create --base "main" --title x', url)?.pr?.base).toBe('main')
})

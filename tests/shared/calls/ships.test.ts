import { expect, test } from 'claude-code/testing'

import { shipResult } from '../../../hooks/transcript/activity/steps'
import { parseShip } from '../../../hooks/shared/calls/ships'
import { shippedFrame, testsFrame } from '../../../hooks/transcript/outcome'
import { partsWidth } from '../../../hooks/shared/parts'

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

test('gh pr create: a flag inside a quoted title is not a flag', () => {
  const url = 'https://github.com/me/app/pull/9'
  expect(parseShip('r', 'gh pr create --title "drop -B main and -H x" --fill', url)?.pr).toEqual({ n: 9, url })
  expect(parseShip('r', "gh pr create --title 'a -B b' -B dev --head=feat", url)?.pr).toEqual({ n: 9, url, head: 'feat', base: 'dev' })
  expect(parseShip('r', 'gh pr create --base "main" --title x', url)?.pr?.base).toBe('main')
})
test('shipped: commit, push and PR read from git and gh output', async () => {
  const commit = parseShip(
    'c',
    'git add -A && git commit -m "fix(toast): dedupe by key"',
    '[feature/toast a1b2c3d4] fix(toast): dedupe by key\n 3 files changed, 48 insertions(+), 12 deletions(-)'
  )
  expect(commit?.commit).toEqual({ sha: 'a1b2c3d', subject: 'fix(toast): dedupe by key', files: 3, adds: 48, dels: 12 })
  const push = parseShip('p', 'git push -u origin feature/toast', 'To github.com:me/app.git\n * [new branch]      feature/toast -> feature/toast')
  expect(push?.push).toEqual({ from: 'feature/toast', to: 'feature/toast' })
  const pr = parseShip('r', 'gh pr create --base main --title x', 'https://github.com/me/app/pull/148\n')
  expect(pr?.pr).toEqual({ n: 148, url: 'https://github.com/me/app/pull/148', base: 'main' })
  expect(parseShip('n', 'git commit -m x', 'nothing to commit, working tree clean')).toBe(undefined)

  for (const width of [96, 46]) {
    for (const l of shippedFrame(width, { id: 'x', ...commit, ...pr })) expect(partsWidth(l)).toBe(width)
    for (const l of testsFrame(
      width,
      { id: 'x', runner: 'vitest', passed: 145, failed: 0, skipped: 2 },
      { id: 'w', runner: 'vitest', passed: 142, failed: 3, skipped: 2 },
      38000
    )) {
      expect(partsWidth(l)).toBe(width)
    }
  }
  expect(shippedFrame(96, { id: 'x', ...pr })[0]?.some(p => p.t === 'PR open')).toBe(true)
})

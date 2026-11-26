import { expect, test } from 'claude-code/testing'

import { describe, runnerOf } from '../../../hooks/shared/calls/describe'
import { stepOf } from '../../../hooks/transcript/activity/steps'
import { OK } from '../../support/step'

const CWD = 'D:\\Projects\\app'

test('verbs and targets follow the timeline', async () => {
  expect(describe('Read', { file_path: 'D:\\Projects\\app\\src\\toast\\queue.ts' }, CWD)).toEqual({ verb: 'read', target: 'src/toast/queue.ts', isPath: true })
  expect(describe('Grep', { pattern: 'pushToast(', path: 'src' }, CWD)?.target).toBe('"pushToast(" in src')
  expect(describe('Bash', { command: 'bun test toast' })?.verb).toBe('test')
  expect(describe('Bash', { command: 'git status\ngit log' })).toEqual({ verb: 'shell', target: 'git status', isPath: false })
  expect(describe('mcp__github__list_pull_requests', {})?.target).toBe('github · list_pull_requests')
  expect(describe('SomethingNew', { x: 1 })).toBe(undefined)
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

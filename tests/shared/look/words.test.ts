import { expect, test } from 'claude-code/testing'

import { stripCd } from '../../../hooks/shared/look/command'
import { kindWord, resultWord, toolLabel } from '../../../hooks/shared/look/words'
import { vw } from '../../../hooks/shared/text'

const bash = (command: string) => ({ command })

test('13.4: the cd prefix goes, repeatedly, in every form; the folder is kept', () => {
  expect(stripCd('cd D:\\Projects\\ghostframe && bun test hooks/width')).toEqual({ command: 'bun test hooks/width', dir: 'D:\\Projects\\ghostframe' })
  expect(stripCd('cd /d D:\\x && pushd tools && bun run check').command).toBe('bun run check')
  expect(stripCd('Set-Location D:\\x; git status')).toEqual({ command: 'git status', dir: 'D:\\x' })
  expect(stripCd('cd "D:\\My Projects\\x"; ls')).toEqual({ command: 'ls', dir: 'D:\\My Projects\\x' })
  expect(stripCd('bun test')).toEqual({ command: 'bun test', dir: undefined })
})

test('5.6: kind words, 6 cells at most', () => {
  expect(kindWord('Bash', bash('cd D:\\x && bun test hooks/width'))).toBe('test')
  expect(kindWord('Bash', bash('bun --version'))).toBe('shell')
  expect(['Read', 'Edit', 'Write', 'Grep', 'WebSearch', 'WebFetch', 'Agent', 'TodoWrite'].map(t => kindWord(t, {}))).toEqual([
    'read',
    'edit',
    'write',
    'search',
    'search',
    'fetch',
    'agent',
    'todo'
  ])
  expect(kindWord('mcp__linear__create_issue', {})).toBe('mcp')
  expect(kindWord('mcp__playwright__browser_take_screenshot', {})).toBe('browser')
  expect(toolLabel('mcp__linear__create_issue')).toBe('mcp · linear create issue')
  expect(toolLabel('mcp__playwright__browser_take_screenshot')).toBe('browser · take screenshot')
})

test('13.6: every row of the short results table', () => {
  const shell = (command: string, stdout: string) => resultWord('Bash', bash(command), { result: { stdout, stderr: '' } })

  expect(shell('bun test', ' 14 pass\n 0 fail\n')).toEqual({ text: '14 pass', tone: 'ok' })
  expect(resultWord('Bash', bash('bun test'), { isError: true, text: 'Exit code 1\n 12 pass\n 2 fail' })).toEqual({ text: '2 of 14', tone: 'err' })
  expect(shell('git push', 'To github.com:o/r.git\n   7c1e2a9..a1f3c2e  main -> main').text).toBe('a1f3c2e')
  expect(shell('gh pr create --fill', 'https://github.com/o/r/pull/23').text).toBe('#23')
  expect(shell('npm audit --omit dev', '1 high severity vulnerability').text).toBe('1 high')
  expect(shell('npm outdated', `Package Current Wanted\n${'a 1 2\n'.repeat(9)}`).text).toBe('9 outdated')
  expect(shell('oxfmt', 'Formatted 38 files in 20ms').text).toBe('38 files')
  expect(shell('bun --version', '1.4.4\n').text).toBe('1.4.4')
  expect(shell('git status', 'On branch main\nnothing to commit, working tree clean').text).toBe('clean')
  expect(shell('ls', Array.from({ length: 14 }, (_, i) => `f${i}`).join('\n')).text).toBe('14 entries')
})

test('13.6: no short result reads as the exit; failures name theirs; never wider than 14 cells', () => {
  expect(resultWord('Bash', bash('make'), { result: { stdout: 'a\nb\nc' } }).text).toBe('done')
  expect(resultWord('Bash', bash('make'), { isError: true, text: 'Exit code 2\nboom' })).toEqual({ text: 'exit 2', tone: 'err' })
  expect(resultWord('Bash', bash('echo'), { result: { stdout: 'a very long single line of output' } }).text).toBe('done')
  expect(resultWord('WebFetch', {}, { result: { code: 404 } })).toEqual({ text: '404', tone: 'err' })
  expect(resultWord('Edit', {}, { result: { structuredPatch: [{ lines: ['+a', '-b'] }] } }).text).toBe('+1 −1')
  expect(resultWord('mcp__linear__create_issue', {}, { result: '{"identifier":"GHO-142"}' }).text).toBe('GHO-142')
  expect(resultWord('mcp__linear__list_teams', {}, { result: '[{},{},{}]' }).text).toBe('3 teams')
  expect(vw(resultWord('Read', {}, { isError: true, text: 'something odd happened here and there' }).text)).toBeLessThanOrEqual(14)
})

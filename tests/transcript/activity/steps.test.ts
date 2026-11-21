import { expect, test } from 'claude-code/testing'

import { stepOf } from '../../../hooks/transcript/activity/steps'
import { describe } from '../../../hooks/shared/calls/describe'
import { foldRow } from '../../../hooks/transcript/activity/fold'
import { C } from '../../../hooks/shared/tokens'
import { OK, ERR } from '../../support/step'
import { PLAN } from '../../support/states'

test('the dot is the state, one state everywhere', async () => {
  const input = { file_path: 'a.ts' }
  expect(stepOf('Read', input, undefined, { ...OK, isRunning: true })?.dot.text).toBe('◐')
  expect(stepOf('Read', input, 'x', { ...OK, isInterrupted: true })?.result[0]?.text).toBe('interrupted')
  expect(stepOf('Write', input, "The user doesn't want to proceed with this tool use.", { ...OK, isErrored: true })?.result[0]?.text).toBe('denied')

  const failed = stepOf('Bash', { command: 'bun test toast' }, 'Error: Exit code 1\ntoast.e2e.ts:42  expected 1 toast, got 2', { ...OK, isErrored: true })
  expect(failed?.result[0]?.text).toBe('exit 1')
  expect(failed?.detail).toBe('toast.e2e.ts:42  expected 1 toast, got 2')
})

test('results read from the real output shapes', async () => {
  expect(stepOf('Read', { file_path: 'a' }, { type: 'text', file: { numLines: 212 } }, OK)?.result[0]?.text).toBe('212 lines')
  expect(stepOf('Grep', { pattern: 'x' }, { mode: 'count', numFiles: 2, filenames: [], numMatches: 9 }, OK)?.result[0]?.text).toBe('9 matches')
  expect(stepOf('Glob', { pattern: '*.ts' }, { numFiles: 0, filenames: [] }, OK)?.result[0]?.text).toBe('no files')

  const patch = [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, lines: [' a', '-b', '+c', '+d'] }]
  expect(stepOf('Edit', { file_path: 'a' }, { filePath: 'a', structuredPatch: patch }, OK)?.result.map(r => r.text)).toEqual(['+2', '−1'])
})

test('shell rows: the description is the target; the result is ✓, ✗ exit N, or the test summary', async () => {
  expect(describe('Bash', { command: 'claude plugin test .', description: 'Run plugin tests' })).toEqual({
    verb: 'test',
    target: 'Run plugin tests',
    isPath: false
  })
  expect(describe('Bash', { command: 'git status' })?.target).toBe('git status')

  const pass = stepOf('Bash', { command: 'bun test' }, { stdout: ' 56 pass\n 0 fail\nShell cwd was reset to D:\\Projects', stderr: '' }, OK)
  expect(pass?.result).toEqual([{ text: '56 pass', color: '#96d292' }])
  const fail = stepOf('Bash', { command: 'bun test' }, 'Error: Exit code 1\n 53 pass\n 3 fail', { ...OK, isErrored: true })
  expect(fail?.result).toEqual([{ text: '3 fail', color: '#ec84a0' }])
  expect(stepOf('Bash', { command: 'ls' }, { stdout: 'a\nb', stderr: '' }, OK)?.result[0]?.text).toBe('ok')
  expect(stepOf('Bash', { command: 'make' }, 'Error: Exit code 2\nmake: *** no rule', { ...OK, isErrored: true })?.result[0]?.text).toBe('exit 2')
  // The engine's note is never the detail line.
  expect(stepOf('Bash', { command: 'false' }, 'Error: Exit code 1\nShell cwd was reset to D:\\Projects\nreal reason', { ...OK, isErrored: true })?.detail).toBe(
    'real reason'
  )
})

test('a call the permission system refused is `✕ denied` in red, with no detail line', async () => {
  const msg = 'Permission to use Bash with command rm -rf ab has been denied.'
  const step = stepOf('Bash', { command: 'rm -rf ab' }, msg, { ...OK, isErrored: true })
  expect(step?.dot).toEqual({ text: '✕', color: '#ec84a0' })
  expect(step?.result).toEqual([{ text: 'denied', color: '#ec84a0' }])
  expect(step?.detail).toBe(undefined)
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

test('result words: always words in state colour, never a bare ✓ or ✗', async () => {
  const OK = { isRunning: false, isErrored: false, isInterrupted: false }
  const ERR = { ...OK, isErrored: true }
  const cases: [string, unknown, unknown, typeof OK, string, string][] = [
    ['WebFetch', { url: 'https://x.dev/a' }, { code: 200 }, OK, '200', C.ok],
    ['Bash', { command: 'bun test' }, { stdout: ' 56 pass\n 0 fail', stderr: '' }, OK, '56 pass', C.ok],
    ['Bash', { command: 'bun test' }, 'Exit code 1\n 50 pass\n 6 fail', ERR, '6 fail', C.err],
    ['Bash', { command: 'ls' }, { stdout: 'a', stderr: '' }, OK, 'ok', C.ok],
    ['Bash', { command: 'make' }, 'Error: Exit code 2\nmake: no rule', ERR, 'exit 2', C.err],
    ['Bash', { command: 'rm x' }, 'Permission to use Bash has been denied.', ERR, 'denied', C.err],
    ['WebSearch', { query: 'q' }, { results: [1, 2, 3] }, OK, '3 results', C.muted],
    ['Edit', { file_path: 'a.ts' }, { filePath: 'a.ts', structuredPatch: [{ lines: ['+a', '+b', '-c'] }] }, OK, '+2 −1', C.add],
    ['Read', { file_path: 'a.ts' }, 'oops', ERR, 'failed', C.err],
    ['Skill', { skill: 'x' }, {}, OK, 'ok', C.ok]
  ]
  for (const [tool, input, output, flags, words, color] of cases) {
    const step = stepOf(tool, input, output, flags)
    expect(`${tool}: ${step?.result.map(r => r.text).join(' ')}`).toBe(`${tool}: ${words}`)
    expect(step?.result[0]?.color).toBe(color)
    expect(step?.result.some(r => /^[✓✗]/.test(r.text))).toBe(false)
  }
  expect(stepOf('Read', { file_path: 'a' }, undefined, { ...OK, isInterrupted: true })?.result[0]?.text).toBe('interrupted')
  expect(
    foldRow({ isAnchor: true, count: 4, summary: '4 reads', failed: 0, wall: 2000 }, 96)
      .map(p => p.t)
      .join('')
  ).toMatch(/ ok +2s$/)
  expect(
    foldRow({ isAnchor: true, count: 4, summary: '4 reads', failed: 2, wall: 2000 }, 96)
      .map(p => p.t)
      .join('')
  ).toContain('2 fail')
})

test('permission: `needs you` only while asked and not yet running', async () => {
  const asking = stepOf('Bash', { command: 'rm -rf node_modules' }, undefined, { ...OK, isAsking: true })
  expect(asking?.dot.text).toBe('◇')
  expect(asking?.result[0]?.text).toBe('needs you')
  expect(asking?.detail).toBe('waiting for you')
  expect(stepOf('Bash', { command: 'ls' }, undefined, { ...OK, isRunning: true, isAsking: true })?.result[0]?.text).toBe('running')
  expect(stepOf('Bash', { command: 'ls' }, { stdout: 'a', stderr: '', interrupted: false }, { ...OK, isAsking: true })?.dot.text).toBe('●')
})

test('question, plan, task and source steps read their real shapes', async () => {
  const q = { questions: [{ question: 'Which branch should the fix land on?', header: 'Branch', options: [], multiSelect: false }] }
  const ask = stepOf('AskUserQuestion', q, { questions: q.questions, answers: { 'Which branch should the fix land on?': 'feature/toast-rebuild' } }, OK)
  expect(ask?.verb).toBe('ask')
  expect(ask?.result[0]?.text).toBe('❯ feature/toast-rebuild')

  expect(stepOf('ExitPlanMode', {}, { plan: PLAN, isAgent: false }, OK)?.target).toBe('Fix the toast double-fire')
  expect(stepOf('TaskUpdate', { taskId: '3', status: 'completed' }, { success: true, taskId: '3', updatedFields: ['status'] }, OK)?.result[0]?.text).toBe(
    'done'
  )
  expect(stepOf('TaskCreate', { subject: 'add dedupe key', description: 'x' }, { task: { id: '4', subject: 'add dedupe key' } }, OK)?.result[0]?.text).toBe(
    '#4'
  )
  expect(stepOf('WebFetch', { url: 'https://vitest.dev/guide/test-context', prompt: 'x' }, { code: 200 }, OK)?.targetColor).toBe('#686874') // a URL label is muted
})

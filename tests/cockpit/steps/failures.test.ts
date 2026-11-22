import { expect, test } from 'claude-code/testing'

import { failureKey, fixes, keyOf, keyText, negativeAnswer } from '../../../hooks/cockpit/steps/failures'
import { deniedReason, endTurn, failureCounts, newLog, newTurn, receiptOf, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { StepLog } from '../../../types'

const PROJECT = 'D:\\Projects\\ghostframe'
const key = (kind: string, command: string, file = '') => keyText(failureKey(kind, command, file, PROJECT))

test('13.1: every row of the key table', () => {
  expect(key('test', 'cd D:\\Projects\\ghostframe && bun test hooks/width')).toBe('bun · test · hooks/width')
  expect(key('test', 'bun test hooks/width --rerun')).toBe('bun · test · hooks/width')
  expect(key('shell', 'npm audit --omit dev')).toBe('npm · audit ·')
  expect(key('test', 'LANG=C.UTF-8 bun test')).toBe('bun · test ·')
  expect(key('edit', '', 'D:\\Projects\\ghostframe\\tests\\width.test.tsx')).toBe('edit · · tests/width.test.tsx')
})

test('13.1: program, subcommand and target, beyond the table', () => {
  expect(key('shell', 'git -C repo push origin main')).toBe('git · push ·')
  expect(key('test', 'pytest tests/test_width.py -x')).toBe('pytest · · tests/test_width.py')
  expect(key('shell', 'node scripts/build.js && echo ok')).toBe('node · · scripts/build.js')
  expect(key('write', '', './hooks/new.ts')).toBe('write · · hooks/new.ts')
  expect(keyOf('bun · test · hooks/width')).toEqual({ program: 'bun', sub: 'test', target: 'hooks/width' })
  expect(keyOf('npm · audit ·')).toEqual({ program: 'npm', sub: 'audit', target: '' })
  expect(keyOf('edit · · tests/width.test.tsx')).toEqual({ program: 'edit', sub: '', target: 'tests/width.test.tsx' })
})

test('13.1: fixed by the same key, or a broader one; never by another program, subcommand or a narrower target', () => {
  const k = (t: string) => keyOf(t)

  expect(fixes(k('bun · test · hooks/width'), k('bun · test · hooks/width'))).toBe(true)
  expect(fixes(k('bun · test ·'), k('bun · test · hooks/width'))).toBe(true)
  expect(fixes(k('bun · test · hooks'), k('bun · test · hooks/width/grapheme.test.tsx'))).toBe(true)
  expect(fixes(k('bun · test · hooks/width/grapheme.test.tsx'), k('bun · test · hooks/width'))).toBe(false)
  expect(fixes(k('bun · test · hooks/wid'), k('bun · test · hooks/width'))).toBe(false)
  expect(fixes(k('npm · test · hooks/width'), k('bun · test · hooks/width'))).toBe(false)
  expect(fixes(k('bun · run · hooks/width'), k('bun · test · hooks/width'))).toBe(false)
})

test('13.1: a search or a compare that exits 1 with nothing on stderr is an answer, not a failure', () => {
  expect(negativeAnswer('grep -r foo src', 1)).toBe('no match')
  expect(negativeAnswer('cd D:\\x && rg foo', 1, '')).toBe('no match')
  expect(negativeAnswer('git diff --exit-code', 1)).toBe('differs')
  expect(negativeAnswer('diff a b', 1)).toBe('differs')
  expect(negativeAnswer('cmp a b', 1)).toBe('differs')
  expect(negativeAnswer('test -f x', 1)).toBe('no match')
  expect(negativeAnswer('[ -f x ]', 1)).toBe('no match')
  expect(negativeAnswer('grep foo missing.txt', 2)).toBeUndefined()
  expect(negativeAnswer('grep foo x', 1, 'grep: x: No such file')).toBeUndefined()
  expect(negativeAnswer('git diff', 1)).toBeUndefined()
  expect(negativeAnswer('bun test', 1)).toBeUndefined()
})

const fail = (text: string) => ({ isError: true as const, text })
const pass = { result: { stdout: ' 14 pass\n 0 fail', stderr: '' } }
const run = (steps: readonly [string, string, ReturnType<typeof fail> | typeof pass][]): StepLog => {
  let log = newTurn(newLog(null, null), 't1', 0)

  for (const [i, [id, cmd, outcome]] of steps.entries()) {
    log = startStep(log, { id, tool: 'Bash', input: { command: cmd }, at: i * 1_000 }, PROJECT)
    log = settleStep(log, { id, tool: 'Bash', input: { command: cmd }, outcome, at: i * 1_000 + 500 })
  }

  return log
}

test('13.1: counted by key, not by attempt; fixed by a later broader success', () => {
  const red = fail('Exit code 1\n 12 pass\n 2 fail')
  const log = run([
    ['a', 'bun test hooks/width', red],
    ['b', 'bun test hooks/width --rerun', red],
    ['c', 'bun test hooks/width', red],
    ['d', 'npm audit --omit dev', fail('Exit code 1\n1 high severity vulnerability')],
    ['e', 'bun test', pass]
  ])

  expect(failureCounts(log.steps)).toEqual({ failed: ['bun · test · hooks/width', 'npm · audit ·'], open: ['npm · audit ·'] })

  const receipt = receiptOf(endTurn(log, 0, false, 9_000))

  expect(receipt).toMatchObject({ failures: 2, fixed: 1, state: 'failed', blocked: 0 })
  expect(receipt.open.map(o => o.subject)).toEqual(['npm audit --omit dev'])
})

test('13.1: a negative answer settles as a pass with its word; the cd prefix never reaches the subject (13.4)', () => {
  const log = run([['a', 'cd D:\\Projects\\ghostframe && grep -r TODO hooks', fail('Exit code 1')]])

  expect(log.steps[0]).toMatchObject({ subject: 'grep -r TODO hooks', result: 'no match', mark: '' })
  expect(failureCounts(log.steps).failed).toEqual([])
})

test('13.7, 13.8: a check`s refusal is blocked, the person`s is denied; neither is a failure, and blocks are counted', () => {
  let log = newTurn(newLog(null, null), 't1', 0)
  const input = { command: 'git commit -m x' }

  log = startStep(log, { id: 'a', tool: 'Bash', input, at: 0 })
  log = settleStep(log, {
    id: 'a',
    tool: 'Bash',
    input,
    at: 10,
    outcome: { deny: 'commits to main are not allowed' },
    blockedBy: 'by a hook · PreToolUse · commits to main are not allowed'
  })
  log = startStep(log, { id: 'b', tool: 'Bash', input: { command: 'rm -rf dist' }, at: 20 })
  log = settleStep(log, {
    id: 'b',
    tool: 'Bash',
    input: { command: 'rm -rf dist' },
    at: 30,
    outcome: { isError: true, text: "The user doesn't want to proceed with this tool use. The user said: keep the build output" }
  })
  log = startStep(log, { id: 'c', tool: 'Bash', input: { command: 'curl x' }, at: 40 })
  log = settleStep(log, { id: 'c', tool: 'Bash', input: { command: 'curl x' }, at: 50, outcome: { deny: 'The auto mode classifier refused this command' } })

  expect(log.steps.map(s => [s.state, s.result, s.mark])).toEqual([
    ['blocked', 'blocked', ''],
    ['denied', 'denied', ''],
    ['blocked', 'blocked', '']
  ])
  expect(log.steps[0]?.why).toBe('by a hook · PreToolUse · commits to main are not allowed')
  expect(log.steps[1]?.why).toBe('keep the build output')
  expect(log.steps[2]?.why).toBe('by the classifier · The auto mode classifier refused this command')
  expect(receiptOf(endTurn(log, 0, false, 100))).toMatchObject({ failures: 0, blocked: 2, state: 'done' })
  expect(deniedReason('The user said: "keep it"')).toBe('keep it')
  expect(deniedReason('Permission to use Bash has been denied')).toBe('')
})

test('13.9: one clock: the receipt and the pane head read the same time, from the turn`s own start and end', () => {
  const log = endTurn(run([['a', 'ls', pass]]), 99_999, false, 164_000)

  expect(log.last?.durationMs).toBe(164_000)
  expect(receiptOf(log).durationMs).toBe(164_000)
})

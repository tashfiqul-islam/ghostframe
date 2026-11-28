import { expect, test } from 'claude-code/testing'

import { failureKey, keyText } from '../../../hooks/cockpit/steps/failures'
import { endTurn, failureCounts, newLog, newTurn, noteChanged, receiptOf, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { StepLog } from '../../../types'

// A failure is fixed when a later step of the same kind on the same target succeeds (13.1): the same file for an edit
// or a write, the same command for a shell step, the same test file for a test. A turn whose failures are all fixed is
// DONE, not FAILED. Seen live: `timeout 600 claude plugin test` keyed on `timeout · · 600`, so the same run without the
// wrapper never fixed it, and a wrapped run of another test file did.

const PROJECT = 'D:\\Projects\\ghostframe'
const key = (kind: string, command: string) => keyText(failureKey(kind, command, '', PROJECT))
const red = { isError: true as const, text: 'Exit code 1\n 12 pass\n 2 fail' }
const green = { result: { stdout: ' 14 pass\n 0 fail', stderr: '' } }
type Call = { tool: string; input: Record<string, unknown>; outcome: Record<string, unknown> }
const bash = (command: string, outcome: Record<string, unknown>): Call => ({ tool: 'Bash', input: { command }, outcome })
const edit = (file_path: string, outcome: Record<string, unknown>): Call => ({ tool: 'Edit', input: { file_path, old_string: 'a', new_string: 'b' }, outcome })
const NOT_READ = { isError: true as const, text: '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>' }
const EDITED = { result: { structuredPatch: [{ lines: ['+a', '-b'] }] }, text: 'ok' }

/** One typed turn of these calls, in order. */
function turn(calls: readonly Call[]): StepLog {
  let log = newTurn(newLog(null, null), 't1', 0)

  for (const [i, c] of calls.entries()) {
    log = startStep(log, { id: `c${i}`, tool: c.tool, input: c.input, at: i * 1_000 }, PROJECT)
    log = settleStep(log, { id: `c${i}`, tool: c.tool, input: c.input, outcome: c.outcome, at: i * 1_000 + 500 })
  }

  return log
}

const receipt = (calls: readonly Call[]) => receiptOf(endTurn(turn(calls), 0, false, 9_000))

test('13.1: a wrapper is not the command: `timeout`, `time`, `env`, `nice` and `nohup` key on the command they run', () => {
  expect(key('test', 'timeout 600 bun test hooks/width')).toBe('bun · test · hooks/width')
  expect(key('test', 'timeout -k 5 -s KILL 600 claude plugin test')).toBe('claude · · plugin')
  expect(key('test', 'time -p bun test hooks/width')).toBe('bun · test · hooks/width')
  expect(key('shell', 'env -i LANG=C FOO=1 bun run build')).toBe('bun · run ·')
  expect(key('shell', 'nice -n 10 bun run build')).toBe('bun · run ·')
  expect(key('shell', 'nohup timeout 900 mise run check > g.log 2>&1')).toBe('mise · ·')
  // A word that only looks like a wrapper is the command itself.
  expect(key('shell', 'env')).toBe('env · ·')
})

test('13.1: a wrapped failure is fixed by the same command unwrapped, and never by a wrapped run of another file', () => {
  const fixed = receipt([bash('timeout 600 bun test hooks/width', red), bash('bun test hooks/width', green)])
  expect(fixed).toMatchObject({ failures: 1, fixed: 1, state: 'done' })

  const other = turn([bash('timeout 600 bun test hooks/a.test.ts', red), bash('timeout 600 bun test hooks/b.test.ts', green)])
  expect(failureCounts(other.steps).open).toEqual(['bun · test · hooks/a.test.ts'])
})

test('13.1: a test`s target is its test file, past a flag`s value; a filter only when no file is named', () => {
  expect(key('test', 'bun test --timeout 1000 tests/a.test.ts')).toBe('bun · test · tests/a.test.ts')
  expect(key('test', 'bun test -t "width" tests/a.test.ts')).toBe('bun · test · tests/a.test.ts')
  expect(key('test', 'pytest -k foo tests/a.py')).toBe('pytest · · tests/a.py')
  expect(key('test', 'bun test width')).toBe('bun · test · width')

  const flags = receipt([bash('bun test --timeout 1000 tests/a.test.ts', red), bash('bun test tests/a.test.ts', green)])
  expect(flags).toMatchObject({ failures: 1, fixed: 1, state: 'done' })
})

test('13.1: an Edit refused because the file was not read is fixed by the next Edit of that file: DONE, 1 fixed', () => {
  const r = receipt([edit('D:\\Projects\\ghostframe\\hooks\\a.ts', NOT_READ), edit('D:/Projects/ghostframe/hooks/a.ts', EDITED)])

  expect(r).toMatchObject({ failures: 1, fixed: 1, state: 'done', open: [] })
})

test('13.1: a failed edit is fixed by a later step that changed the file, a shell step too; not by one that changed another', () => {
  const steps = [edit('D:\\Projects\\ghostframe\\hooks\\a.ts', NOT_READ), bash("sed -i 's/a/b/' hooks/a.ts", green)]
  // The work tree's diff after the shell step names what it changed (`noteWork`); until it is read, nothing.
  expect(receiptOf(endTurn(turn(steps), 0, false, 9_000))).toMatchObject({ failures: 1, fixed: 0, state: 'failed' })
  expect(receiptOf(endTurn(noteChanged(turn(steps), 'c1', ['hooks/a.ts']), 0, false, 9_000))).toMatchObject({ failures: 1, fixed: 1, state: 'done' })
  expect(receiptOf(endTurn(noteChanged(turn(steps), 'c1', ['hooks/b.ts']), 0, false, 9_000))).toMatchObject({ failures: 1, fixed: 0, state: 'failed' })
  // Only an edit or a write is fixed so: a failed command stays failed when a later step changes a file it named.
  const shell = [bash('bun run build hooks/a.ts', red), bash("sed -i 's/a/b/' hooks/a.ts", green)]
  expect(receiptOf(endTurn(noteChanged(turn(shell), 'c1', ['hooks/a.ts']), 0, false, 9_000))).toMatchObject({ fixed: 0, state: 'failed' })

  const other = receipt([edit('D:\\Projects\\ghostframe\\hooks\\a.ts', NOT_READ), edit('D:\\Projects\\ghostframe\\hooks\\b.ts', EDITED)])
  expect(other).toMatchObject({ failures: 1, fixed: 0, state: 'failed' })
})

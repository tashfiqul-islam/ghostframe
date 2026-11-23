import { expect, test } from 'claude-code/testing'

import { newLog, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { Outcome } from '../../../hooks/cockpit/steps/log'

/** The result word of one settled shell step, as the step log keeps it. */
function shellResult(command: string, outcome: Outcome): string {
  const input = { command }
  const log = settleStep(startStep(newLog('t1', 0), { id: 'a', tool: 'Bash', input, at: 0 }), { id: 'a', tool: 'Bash', input, outcome, at: 1_000 })

  return log.steps[0]?.result ?? ''
}

const out = (stdout: string): Outcome => ({ result: { stdout, stderr: '' }, text: stdout })

test('a command that succeeds with empty output reads `no output`', () => {
  expect(shellResult('mkdir -p build', out(''))).toBe('no output')
  expect(shellResult('touch a.txt', out('\n'))).toBe('no output')
})

test('a check that passes with nothing to report reads `clean`', () => {
  expect(shellResult('bun run lint', out(''))).toBe('clean')
  expect(shellResult('oxfmt --check', out(''))).toBe('clean')
  expect(shellResult('tsc -p .', out(''))).toBe('clean')
  expect(shellResult('cargo clippy', out(''))).toBe('clean')
})

test('git status: `clean`, `N changed`, `N untracked`, or `N changed +M new`', () => {
  expect(shellResult('git status', out('On branch main\nnothing to commit, working tree clean\n'))).toBe('clean')
  expect(shellResult('git status --short', out(''))).toBe('clean')
  expect(shellResult('git status --short', out(' M hooks/a.ts\nM  hooks/b.ts\n?? new.ts\n'))).toBe('2 changed +1 new')
  expect(shellResult('git status -s', out('?? a.ts\n?? b.ts\n'))).toBe('2 untracked')
  expect(
    shellResult(
      'git status',
      out(
        'On branch main\nChanges not staged for commit:\n  (use "git add <file>..." to update)\n\tmodified:   hooks/a.ts\n\tdeleted:    old.ts\n\nUntracked files:\n  (use "git add <file>..." to include)\n\tnew.ts\n'
      )
    )
  ).toBe('2 changed +1 new')
  expect(shellResult('git -C D:/x status --porcelain', out(' M a.ts\n'))).toBe('1 changed')
})

test('git diff: `+a −d` from the patch or the stat line; `no changes` when empty', () => {
  expect(shellResult('git diff', out('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,3 @@\n-old\n+new\n+more\n ctx\n'))).toBe('+2 −1')
  expect(shellResult('git diff --stat', out(' a.ts | 3 ++-\n 1 file changed, 2 insertions(+), 1 deletion(-)\n'))).toBe('+2 −1')
  expect(shellResult('git diff --cached', out(''))).toBe('no changes')
})

test('ls: `N items`, `1 item`, or `empty`', () => {
  expect(shellResult('ls', out('a.txt\nb.txt\nd2\n'))).toBe('3 items')
  expect(shellResult('ls -la src', out('total 8\ndrwxr-xr-x 2 u u 4096 .\ndrwxr-xr-x 9 u u 4096 ..\n-rw-r--r-- 1 u u 12 a.ts\n'))).toBe('1 item')
  expect(shellResult('ls d2', out(''))).toBe('empty')
})

test('other commands keep their last line of output', () => {
  expect(shellResult('echo one', out('one\n'))).toBe('one')
})

/** The result of one settled call of another tool that errored, as the step log keeps it. */
function errorResult(tool: string, input: Record<string, unknown>, text: string): string {
  const log = settleStep(startStep(newLog('t1', 0), { id: 'a', tool, input, at: 0 }), { id: 'a', tool, input, outcome: { isError: true, text }, at: 1_000 })

  return log.steps[0]?.result ?? ''
}

test('13.6: an edit tool`s own guards read `not read` and `file changed`; a longer error is just `failed`', () => {
  const edit = { file_path: 'a.ts', old_string: 'a', new_string: 'b' }
  expect(errorResult('Edit', edit, '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>')).toBe('not read')
  expect(errorResult('Edit', edit, '<tool_use_error>File has been modified since read, either by the user or by a linter.</tool_use_error>')).toBe(
    'file changed'
  )
  expect(errorResult('Write', { file_path: 'a.ts', content: '' }, 'EACCES: permission denied, open a.ts')).toBe('failed')
  expect(errorResult('Write', { file_path: 'a.ts', content: '' }, 'disk full')).toBe('disk full')
})

test('5.7, 13.6: a result is a short word, never raw output: JSON, a path, a hash with its subject or `exit 0` read `done`', () => {
  expect(shellResult('Get-Content package.json', out('{ "name": "cockpit-live", "private": true, "type": "module" }\n'))).toBe('done')
  expect(shellResult('git log --oneline -1', out('d0cf00d chore: start\n'))).toBe('done')
  expect(shellResult("Select-String -Path src/width.test.ts -Pattern 'ascii'", out(String.raw`src\width.test.ts:4:test('ascii', () => {})`))).toBe('done')
  expect(shellResult('pwsh -c "exit 0"', out('exit 0\n'))).toBe('done')
  expect(shellResult('bun --version', out('1.4.4\n'))).toBe('1.4.4')
})

test('a test run that then commits keeps the commit: its result is the hash, so the receipt ends `↗ <sha>` (live check, step 1)', () => {
  const command = 'bun test 2>&1 | tail -4 && git add src/width.ts && git commit -q -m "fix(width): count cells"'
  const input = { command }
  const outcome: Outcome = { result: { stdout: ' 3 pass\n 0 fail\n', stderr: '' }, commit: { sha: '56ac82c', subject: 'fix(width): count cells' } }
  const log = settleStep(startStep(newLog('t1', 0), { id: 'a', tool: 'Bash', input, at: 0 }), { id: 'a', tool: 'Bash', input, outcome, at: 1_000 })

  expect(log.steps[0]).toMatchObject({ kind: 'test', result: '56ac82c', mark: '±' })
  // A failing run is still the failure: `&&` means nothing was committed.
  expect(shellResult(command, { result: { stdout: ' 1 pass\n 2 fail\n', stderr: '' } })).toBe('2 of 3 fail')
})

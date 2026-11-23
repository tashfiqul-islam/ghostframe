import { expect, test } from 'claude-code/testing'

import { commitIn, failureKey, fixes, hookWords, keyOf, keyText, negativeAnswer, ruledStatement, subjectCommand } from '../../../hooks/cockpit/steps/failures'
import { subjectOf } from '../../../hooks/cockpit/steps/kinds'
import { endTurn, failureCounts, newLog, newTurn, receiptOf, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { StepLog } from '../../../types'

const PROJECT = 'D:\\Projects\\ghostframe'
const key = (kind: string, command: string, file = '') => keyText(failureKey(kind, command, file, PROJECT))
const pwsh = (command: string, kind = 'shell') => keyText(failureKey(kind, command, '', PROJECT, 'pwsh'))

test('13.1 for PowerShell: an assignment is stripped, the first command keys, a statement with no program keys on pwsh', () => {
  expect(pwsh('$t = Get-Content -Raw hooks\\a.ts; $t = $t.Replace("a", "b")')).toBe('Get-Content · · hooks/a.ts')
  // An assignment that runs nothing is PowerShell's `VAR=value`: the next command keys.
  expect(pwsh('$env:LANG = "C"; bun test hooks/width', 'test')).toBe('bun · test · hooks/width')
  expect(pwsh('$t = [IO.File]::ReadAllText("a.ts"); $t = $t.Replace("a", "b"); [IO.File]::WriteAllText("a.ts", $t)')).toBe('pwsh · ·')
  expect(pwsh('cd D:\\Projects\\ghostframe; git status | Select-String foo')).toBe('git · status ·')
  expect(pwsh('$t = [IO.File]::ReadAllText("$PWD/hooks/a.ts")')).toBe('pwsh · ·')
  expect(pwsh("foreach ($f in 'a.ts','b.ts') { Get-Content $f }")).toBe('pwsh · ·')
  expect(pwsh('$t = Measure-Command { bun test }')).toBe('Measure-Command · ·')
  expect(pwsh('& "C:\\tools\\lint.exe" hooks\\a.ts')).toBe('lint · · hooks/a.ts')
  // A bash loop keys on bash; `[` is still the test command there.
  expect(key('shell', 'for f in *.ts; do echo $f; done')).toBe('bash · ·')
  expect(key('shell', '[ -f x.ts ]')).toBe('[ · · x.ts')
})

test('13.1: a redirection is not a target, a folder option is not a subcommand; a write fixes a failed edit', () => {
  expect(pwsh('bun run --cwd tools check *> $env:TEMP\\g.txt')).toBe('bun · run ·')
  expect(key('shell', 'bun run --cwd tools check > "$TEMP/g.txt" 2>&1')).toBe('bun · run ·')
  expect(key('shell', 'npm --prefix web audit')).toBe('npm · audit ·')
  // A `|` or `;` inside quotes joins nothing, in bash as in PowerShell.
  expect(key('shell', 'grep -E "a|b" src/a.ts')).toBe('grep · · src/a.ts')
  expect(key('shell', `awk '{ print $1; print $2 }' src/a.ts | head`)).toBe('awk · · src/a.ts')
  expect(negativeAnswer('grep -E "a|b" src/a.ts', 1, '')).toBe('no match')
  expect(fixes(keyOf('write · · hooks/a.ts'), keyOf('edit · · hooks/a.ts'))).toBe(true)
  expect(fixes(keyOf('edit · · hooks/a.ts'), keyOf('write · · hooks/a.ts'))).toBe(true)
  expect(fixes(keyOf('write · · hooks/b.ts'), keyOf('edit · · hooks/a.ts'))).toBe(false)
})

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
  // A denial names no reason (13.8): whatever its text says, none is kept.
  expect(log.steps[1]?.why).toBe('')
  expect(log.steps[2]?.why).toBe('by the classifier · The auto mode classifier refused this command')
  expect(receiptOf(endTurn(log, 0, false, 100))).toMatchObject({ failures: 0, blocked: 2, state: 'done' })
})

test('13.9: one clock: the receipt and the pane head read the same time, from the turn`s own start and end', () => {
  const log = endTurn(run([['a', 'ls', pass]]), 99_999, false, 164_000)

  expect(log.last?.durationMs).toBe(164_000)
  expect(receiptOf(log).durationMs).toBe(164_000)
})

test('13.7: a hook`s refusal names its script and its own message; a rule names the statement it matched', () => {
  expect(hookWords('PreToolUse:PowerShell hook error: [pwsh -NoProfile -File .claude/hooks/guard-main.ps1]: pushing is blocked in this repo\r\n')).toEqual({
    script: 'guard-main.ps1',
    message: 'pushing is blocked in this repo'
  })
  expect(hookWords('Exit code 1')).toBeUndefined()
  const joined = 'ls -la /d/Projects/cockpit-live/src && rm -rf /d/Projects/cockpit-live/src && ls /d/Projects/cockpit-live'
  expect(ruledStatement(joined, 'Bash(rm -rf:*)')).toBe('rm -rf /d/Projects/cockpit-live/src')
  expect(ruledStatement(joined, 'Bash(npm publish:*)')).toBeUndefined()
})

test('5.7, 13.4: a shell step`s subject is the statement its key comes from, without redirections or formatting pipes', () => {
  expect(subjectCommand('bun test 2>&1 | Out-String', 'pwsh')).toBe('bun test')
  expect(subjectCommand('bun run test 2>&1 | Select-Object -First 3 | Out-String; Test-Path bun.lock, tsconfig.json', 'pwsh')).toBe('bun run test')
  expect(subjectCommand(String.raw`cd D:\Projects\x; $t = Get-Content -Raw a.ts; $t.Replace("a", "b")`, 'pwsh')).toBe('Get-Content -Raw a.ts')
  expect(subjectCommand(String.raw`bun run --cwd tools check *> $env:TEMP\g.txt`, 'pwsh')).toBe('bun run --cwd tools check')
  // A pipe that does work stays.
  expect(subjectCommand('grep -rn width src | wc -l', 'bash')).toBe('grep -rn width src | wc -l')
  expect(subjectCommand('ls /nope1', 'bash')).toBe('ls /nope1')
})

test('7.10: a command commits only when one of its statements runs git commit, in the folder its cd or -C names', () => {
  expect(commitIn("git add src/width.ts; git commit -q -m @'\nfix: width\n'@")).toEqual({ dir: undefined })
  expect(commitIn('cd sub && git commit -m x')).toEqual({ dir: 'sub' })
  expect(commitIn('git -C ../repo commit -am x')).toEqual({ dir: '../repo' })
  expect(commitIn('echo "git commit later"')).toBeUndefined()
  expect(commitIn('git commit --dry-run')).toBeUndefined()
  expect(commitIn('git log --oneline -1')).toBeUndefined()
  // A shell's own formatting pipes go too.
  expect(subjectCommand('bun test 2>&1 | tail -20', 'bash')).toBe('bun test')
})

test('13.1: a test step keys on, and is named after, the statement that runs the tests (live check, step 2)', () => {
  const joined = 'sed -i "4s/toBe(3)/toBe(4)/" src/width.test.ts && bun test'

  expect(key('test', joined)).toBe('bun · test ·')
  expect(subjectCommand(joined, 'bash', true)).toBe('bun test')
  expect(pwsh('(Get-Content a.ts) -replace "3", "4" | Set-Content a.ts; bun test src 2>&1 | Out-String', 'test')).toBe('bun · test · src')
  expect(subjectCommand('Set-Content a.ts x; bun test src 2>&1 | Out-String', 'pwsh', true)).toBe('bun test src')
  expect(subjectOf('Bash', { command: joined }, PROJECT)).toBe('bun test')
})

test('7. a commit step is named after its commit, its message`s first line, never the `git add` before it (manual run, turn 1)', () => {
  const hereString = "git add src/width.ts; git commit -m @'\nfix: count terminal cells\n\nbody\n'@; git log --oneline -2"

  expect(subjectOf('PowerShell', { command: hereString }, PROJECT)).toBe('git commit -m "fix: count terminal cells"')
  expect(subjectOf('Bash', { command: 'git add a.ts && git commit -q -m "fix: x" && git push' }, PROJECT)).toBe('git commit -q -m "fix: x"')
  expect(subjectOf('Bash', { command: 'git -C sub commit -am "wip"' }, PROJECT)).toBe('git -C sub commit -am "wip"')
})

test('6. kind, subject, result and key come from one statement: the test run, not the `git mv` before it (manual run, turn 7)', () => {
  const command = 'git mv src/width.test.ts src/width.spec.ts; git status --short; bun test 2>&1 | Select-Object -Last 6'

  expect(subjectOf('PowerShell', { command }, PROJECT)).toBe('bun test')
  expect(pwsh(command, 'test')).toBe('bun · test ·')
})

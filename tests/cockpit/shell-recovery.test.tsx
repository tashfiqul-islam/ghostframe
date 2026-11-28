import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, statAsSpelled } from '../support/cockpit'
import type { Engine, On } from '../support/engine'
import { holdTimers } from '../support/clock'

// An Edit or a Write that failed is fixed when a later step of the same turn changes that file, a shell step too
// (13.1): the work tree's diff before and after each shell step tells which files it changed, as [ FILES ] reads it.
// Seen live: an Edit refused because the file had not been read, then `sed -i` on the file, and the turn said
// `FAILED · 1 still failing`.

const NOT_READ = '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>'

/**
 * One turn in /repo: a refused Edit of hooks/a.ts, then a shell step whose diff moves `changes`; the pane's rows after.
 * @param changes the work tree's numstat after the shell step (before it, nothing has changed)
 */
async function turnOf($: Engine, on: On, command: string, changes: string): Promise<string[]> {
  const clock = { now: T0 }
  let diffs = 0
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: [] as never }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', ($e, e) => $e.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', (_, e) => {
    clock.now += 1_000

    return e.tool === 'Edit' ? { isError: true, result: NOT_READ, text: NOT_READ } : { result: { stdout: '', stderr: '' }, text: '' }
  })
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never

    if (argv === 'git rev-parse --show-toplevel') return out('/repo\n')
    if (argv === 'git rev-parse --verify --quiet HEAD') return out('f00d\n')
    if (argv === 'git rev-parse --show-prefix') return out('\n')
    // The turn's start, then after the shell step.
    if (argv.startsWith('git diff --numstat')) return out(diffs++ === 0 ? '' : changes)

    return out('')
  })
  on('fs.read', () => ({ value: 'b\n' }))
  statAsSpelled(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'fix a.ts', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix a.ts', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/hooks/a.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
  await $.tool.call({ tool: 'Bash', command, tool_use_id: 'b1' } as never)
  clock.now += 2_000
  await $.turn.complete({ answer: 'done', durationMs: 4_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount(PANE)
  const rows = (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await ui.unmount()

  return rows
}

for (const [what, command] of [
  ['`sed -i`', "sed -i 's/a/b/' hooks/a.ts"],
  ['a script', 'python fix.py']
] as const) {
  test(`13.1: a refused Edit, then ${what} that changes the file: the failure is fixed, the turn DONE`, ON, async ($, on) => {
    const rows = await turnOf($, on, command, '1\t1\thooks/a.ts\0')

    expect(rows.some(r => /DONE/.test(r))).toBe(true)
    expect(rows.some(r => /FAILED|still failing/.test(r))).toBe(false)
    expect(rows).toContainEqual(expect.stringMatching(/\b1 fixed\b/))
  })
}

test('13.1: a refused Edit, then a shell step that changes another file: still failing, the turn FAILED', ON, async ($, on) => {
  const rows = await turnOf($, on, 'python fix.py', '1\t1\thooks/b.ts\0')

  expect(rows.some(r => /FAILED/.test(r))).toBe(true)
  expect(rows).toContainEqual(expect.stringMatching(/\b1 still failing\b/))
})

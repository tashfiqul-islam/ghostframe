import { expect, test } from 'claude-code/testing'

import { filesFromCommand, filesFromDiff, noteFiles, shownPath, writeTargets } from '../../../hooks/cockpit/sections/files'
import type { FileChange } from '../../../types'

const edit = (files: readonly FileChange[], path: string, adds: number, dels: number) =>
  noteFiles(
    files,
    'Edit',
    { file_path: `/repo/${path}` },
    { structuredPatch: [{ lines: [...Array<string>(adds).fill('+x'), ...Array<string>(dels).fill('-y')] }] },
    '/repo'
  )

test('one entry per file in order of first change; a later edit updates it in place; new and deleted files are marked', () => {
  let files = edit([], 'hooks/register.tsx', 11, 238)
  files = noteFiles(
    files,
    'Write',
    { file_path: '/repo/hooks/ledger.ts', content: 'a\nb\nc\n' },
    { type: 'create', content: 'a\nb\nc\n', structuredPatch: [] },
    '/repo'
  )
  files = edit(files, 'hooks/register.tsx', 2, 1)
  files = noteFiles(files, 'Bash', { command: 'git rm -q hooks/old.ts && echo done' }, { stdout: '' }, '/repo')

  expect(files).toEqual([
    { path: 'hooks/register.tsx', tag: '', adds: 13, dels: 239 },
    { path: 'hooks/ledger.ts', tag: 'new', adds: 3, dels: 0 },
    { path: 'hooks/old.ts', tag: 'del', adds: 0, dels: 0 }
  ])
})

test('shell paths read as the session sees them: $PWD, ${PWD}, %CD% and ./ are the folder; $HOME is ~', () => {
  expect(shownPath('$PWD/notes2.txt', '/repo')).toBe('notes2.txt')
  expect(shownPath('"${PWD}/docs/a.md"', '/repo')).toBe('docs/a.md')
  expect(shownPath(String.raw`%CD%\b.txt`, 'D:/repo')).toBe('b.txt')
  expect(shownPath('./c.txt', '/repo')).toBe('c.txt')
  expect(shownPath('$HOME/.bashrc', '/repo')).toBe('~/.bashrc')
  expect(shownPath('/repo/hooks/x.ts', '/repo')).toBe('hooks/x.ts')
  expect(noteFiles([], 'Bash', { command: 'rm "$PWD/notes2.txt"' }, {}, '/repo')).toEqual([{ path: 'notes2.txt', tag: 'del', adds: 0, dels: 0 }])
})

test('shell writes: from the working copy`s diff between steps (a new file, an appended one), else the named targets', () => {
  const before = [{ path: 'notes.md', added: 2, removed: 0, isUntracked: false }]
  const after = [
    { path: 'notes.md', added: 3, removed: 1, isUntracked: false },
    { path: 'notes3.txt', added: 0, removed: 0, isUntracked: true },
    { path: 'old.md', added: 0, removed: 0, isUntracked: false }
  ]
  // `old.md` was already changed before the turn's step began (the same counts in both): no row.
  const prior = [...before, { path: 'old.md', added: 0, removed: 0, isUntracked: false }]
  const files = filesFromDiff([{ path: 'docs/a.md', tag: '', adds: 1, dels: 0 }], prior, after, '/repo', '/repo')
  expect(files).toEqual([
    { path: 'docs/a.md', tag: '', adds: 1, dels: 0 },
    { path: 'notes.md', tag: '', adds: 1, dels: 1 },
    { path: 'notes3.txt', tag: 'new', adds: 0, dels: 0 }
  ])

  expect(writeTargets(`printf 'a\n' >> notes3.txt && echo ok > "$PWD/out.log" 2>&1 | tee -a run.log; cat x > /dev/null`)).toEqual([
    'notes3.txt',
    '"$PWD/out.log"',
    'run.log'
  ])
  expect(writeTargets('Set-Content -Path notes.md "x"; "y" | Out-File log.txt')).toEqual(['notes.md', 'log.txt'])
  expect(filesFromCommand([], `printf 'x' >> "$PWD/notes3.txt"`, '/repo')).toEqual([{ path: 'notes3.txt', tag: '', adds: 0, dels: 0 }])
})

test('an agent`s edit joins the list marked as the agent`s, once: the main loop`s edit of the same file sums into it', () => {
  const patch = { structuredPatch: [{ lines: ['+a', '-b'] }] }
  let files = noteFiles([], 'Edit', { file_path: '/repo/a.ts' }, patch, '/repo', true)
  files = noteFiles(files, 'Edit', { file_path: '/repo/a.ts' }, patch, '/repo')
  files = noteFiles(files, 'Edit', { file_path: '/repo/b.ts' }, patch, '/repo')
  expect(files).toEqual([
    { path: 'a.ts', tag: '', adds: 2, dels: 2, isAgent: true },
    { path: 'b.ts', tag: '', adds: 1, dels: 1 }
  ])
})

test('13. a here-string`s body writes nothing: its `<…@….com>` and closing `@` are no `> @` (manual run, turn 1)', () => {
  const command = "git add src/width.ts; git commit -m @'\nfix: count cells\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n'@; git log --oneline -2"

  expect(writeTargets(command)).toEqual([])
  expect(writeTargets('cat a > out.txt\necho hi >> log.txt')).toEqual(['out.txt', 'log.txt'])
  expect(writeTargets("cat <<'EOF' > notes.md\nline > not-a-file\nEOF")).toEqual(['notes.md'])
})

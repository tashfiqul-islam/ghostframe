import { expect, test } from 'claude-code/testing'

import { fileRows, filesFromCommand, filesFromDiff, noteFiles, shownPath, writeTargets } from '../../../hooks/cockpit/sections/files'
import type { Part } from '../../../hooks/shared/parts'
import { vw } from '../../../hooks/shared/text'
import type { FileChange } from '../../../types'

const W = 72
const line = (r: readonly Part[]) => r.map(p => p.t).join('')
const edit = (files: readonly FileChange[], path: string, adds: number, dels: number) =>
  noteFiles(
    files,
    'Edit',
    { file_path: `/repo/${path}` },
    { structuredPatch: [{ lines: [...Array<string>(adds).fill('+x'), ...Array<string>(dels).fill('-y')] }] },
    '/repo'
  )

test('one row per file in order of first change; a later edit updates its row in place; new and deleted files are marked', () => {
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

  const rows = fileRows(files, W, 4).map(line)
  expect(rows).toEqual([
    expect.stringMatching(/^┄ \[ FILES \] ┄+ 3 changed · \+16 −239$/),
    expect.stringMatching(/^ {2}hooks\/register\.tsx +\+13 {2}−239$/),
    expect.stringMatching(/^ {2}hooks\/ledger\.ts +new {4}\+3 {6}$/),
    expect.stringMatching(/^ {2}hooks\/old\.ts +del {12}$/)
  ])
  for (const r of rows) expect(vw(r)).toBe(W)
})

test('a turn with 30 files: 3 rows and `… 27 more files · +a −b` (6 rows in a tall pane); long paths keep the file name', () => {
  let files: FileChange[] = []

  for (let i = 0; i < 30; i++) files = edit(files, `hooks/transcript/sites/reply/deeply/nested/folder/file-${i}.ts`, i + 1, i % 3)

  const adds = files.reduce((n, f) => n + f.adds, 0)
  const dels = files.reduce((n, f) => n + f.dels, 0)
  const rows = fileRows(files, W, 4).map(line)
  expect(rows).toHaveLength(5)
  expect(rows[0]).toMatch(new RegExp(` 30 changed · \\+${adds} −${dels}$`))
  expect(rows[1]).toMatch(/^ {2}hooks\/…\/.*\/file-0\.ts +\+1 {6}$/)
  const restAdds = files.slice(3).reduce((n, f) => n + f.adds, 0)
  const restDels = files.slice(3).reduce((n, f) => n + f.dels, 0)
  expect(rows[4]?.trimEnd()).toBe(`  … 27 more files · +${restAdds} −${restDels}`)
  expect(fileRows(files, W, 6)).toHaveLength(7)
  expect(fileRows(files, W, 4, true)).toHaveLength(1)
  for (const r of rows) expect(vw(r)).toBe(W)
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

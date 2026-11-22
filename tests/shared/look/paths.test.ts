import { expect, test } from 'claude-code/testing'

import { cutCommand, cutPath, cutTitle, cutUrl, showPath, splitPath } from '../../../hooks/shared/look/paths'
import { vw } from '../../../hooks/shared/text'

const roots = { project: 'D:\\Projects\\ghostframe', home: 'C:\\Users\\Tashfiq' }

test('13.2: every row of the table', () => {
  expect(showPath('D:\\Projects\\ghostframe\\hooks\\runtime.ts', roots)).toBe('hooks/runtime.ts')
  expect(showPath('./hooks/runtime.ts', roots)).toBe('hooks/runtime.ts')
  expect(showPath('C:\\Users\\Tashfiq\\.claude\\settings.json', roots)).toBe('~/.claude/settings.json')
  expect(showPath('~/.claude/settings.json', roots)).toBe('~/.claude/settings.json')
  expect(showPath('D:\\Projects\\cockpit-test-settings.json', roots)).toBe('D:/Projects/cockpit-test-settings.json')
})

test('13.2: a worktree beside the project is not inside it; the worktree as the project is', () => {
  expect(showPath('D:\\Projects\\ghostframe-v8\\hooks\\runtime.ts', roots)).toBe('D:/Projects/ghostframe-v8/hooks/runtime.ts')
  expect(showPath('D:\\Projects\\ghostframe-v8\\hooks\\runtime.ts', { ...roots, project: 'D:\\Projects\\ghostframe-v8' })).toBe('hooks/runtime.ts')
  expect(showPath('d:/projects/ghostframe/hooks/x.ts', roots)).toBe('hooks/x.ts')
})

test('13.2, the ~ bug both ways: a ~ path is never read against the project; a project path never gets a ~', () => {
  expect(showPath('~/.claude/settings.json', { project: 'C:\\Users\\Tashfiq\\proj', home: roots.home })).toBe('~/.claude/settings.json')
  expect(showPath('~\\.claude\\settings.json', roots)).toBe('~/.claude/settings.json')
  expect(showPath('C:\\Users\\Tashfiq\\proj\\src\\a.ts', { project: 'C:\\Users\\Tashfiq\\proj', home: roots.home })).toBe('src/a.ts')
  expect(showPath('C:/Users/Tashfiq/proj/src/a.ts', { project: 'C:/Users/Tashfiq/proj' })).toBe('src/a.ts')
  expect(showPath('C:/Users/Tashfiq/other/a.ts', { project: 'C:/Users/Tashfiq/proj' })).toBe('~/other/a.ts')
  expect(showPath('/home/ada/.config/x', {})).toBe('~/.config/x')
})

test('5.4: the folder and the file name, apart', () => {
  expect(splitPath('.github/workflows/ci.yml')).toEqual({ folder: '.github/workflows/', file: 'ci.yml' })
  expect(splitPath('mise.toml')).toEqual({ folder: '', file: 'mise.toml' })
})

test('13.5: paths keep their first segment and file name; URLs their host and last segment', () => {
  expect(cutPath('hooks/transcript/width/width.test.tsx', 22)).toBe('hooks/…/width.test.tsx')
  expect(cutPath('hooks/transcript/width/width.test.tsx', 30)).toBe('hooks/…/width/width.test.tsx')
  expect(cutPath('hooks/runtime.ts', 40)).toBe('hooks/runtime.ts')
  expect(cutUrl('docs.github.com/en/actions/setup-bun', 27)).toBe('docs.github.com/…/setup-bun')
  expect(cutUrl('https://docs.github.com/en/actions/setup-bun', 35)).toBe('https://docs.github.com/…/setup-bun')
  for (const n of [5, 10, 18]) expect(vw(cutPath('hooks/transcript/width/width.test.tsx', n))).toBeLessThanOrEqual(n)
})

test('13.5: commands keep the program, the subcommand and the last argument; titles keep their start', () => {
  expect(cutCommand('bun test --rerun-each 3 --bail hooks/width', 22)).toBe('bun test … hooks/width')
  expect(cutCommand('bun test hooks/width', 30)).toBe('bun test hooks/width')
  expect(cutTitle('browser · read the tab strip', 25)).toBe('browser · read the tab s…')
})

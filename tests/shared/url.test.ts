import { expect, test } from 'claude-code/testing'

import { footnoteLines } from '../../hooks/transcript/research/footnotes'
import { sourcesFrame } from '../../hooks/transcript/research/sources'
import { sourceLabel, clipPath, isOffProject, onDisk, relPath } from '../../hooks/shared/url'
import { stepOf } from '../../hooks/transcript/activity/steps'
import type { Step } from '../../hooks/transcript/activity/steps'
import { layoutStep } from '../../hooks/transcript/activity/row'
import { vw } from '../../hooks/shared/text'
import { splitBlocks } from '../../hooks/transcript/blocks/split'
import { C } from '../../hooks/shared/tokens'
import { OK } from '../support/step'

// ─── Footnote labels ──────────────────────────────────────────────────────

test('source labels: repo#N for issues and PRs, owner/repo for a repo, host · last segment otherwise', async () => {
  expect(sourceLabel('https://github.com/anthropics/claude-code/issues/108931')).toBe('claude-code#108931')
  expect(sourceLabel('https://github.com/oven-sh/bun/pull/2201/files')).toBe('bun#2201')
  expect(sourceLabel('https://github.com/oven-sh/bun')).toBe('oven-sh/bun')
  expect(sourceLabel('https://github.com/oven-sh/bun/')).toBe('oven-sh/bun')
  expect(sourceLabel('https://bun.com/docs/test/runtime-behavior')).toBe('bun.com · runtime-behavior')
  expect(sourceLabel('https://bun.sh/guides/test/timeout.md')).toBe('bun.sh · timeout')
  expect(sourceLabel('https://www.example.dev/a/index.html?x=1#y')).toBe('example.dev · a')
  expect(sourceLabel('https://bun.com/')).toBe('bun.com')
  expect(sourceLabel('https://bun.com')).toBe('bun.com')

  // The footnote line and the [ SOURCES ] frame use the same labels; only the end clips.
  const cites = [{ n: 1, url: 'https://github.com/anthropics/claude-code/issues/108931', title: 'x' }]
  expect(
    footnoteLines(cites, 96)[0]
      ?.map(p => p.t)
      .join('')
  ).toBe('┄┄┄┄ ¹ claude-code#108931')
  // A URL label clips in the middle: the issue number stays.
  expect(
    footnoteLines(cites, 20)[0]
      ?.map(p => p.t)
      .join('')
  ).toBe('┄┄┄┄ ¹ claude…108931')
  const frame = sourcesFrame(
    [1, 2, 3, 4, 5].map(n => ({ n, url: `https://bun.com/docs/page-${n}`, title: `Page ${n}` })),
    96
  )
  expect(frame[1]?.some(p => p.t === 'bun.com · page-1')).toBe(true)
})
test('paths: relative inside the session, ~ for home, one slash style, clipped at folders', async () => {
  const scratch = 'C:\\Users\\me\\AppData\\Local\\Temp\\notebook-scratch.txt'
  expect(relPath(scratch, 'D:\\Projects')).toBe('~/AppData/Local/Temp/notebook-scratch.txt')
  expect(relPath('/home/ana/src/x.ts', '/srv')).toBe('~/src/x.ts')
  expect(relPath('D:\\Projects\\app\\src\\a.ts', 'D:\\Projects')).toBe('app/src/a.ts')
  expect(relPath('D:\\other\\b.ts', 'D:\\Projects')).toBe('D:/other/b.ts')

  expect(clipPath('~/AppData/Local/Temp/notebook-scratch.txt', 38)).toBe('~/AppData/…/Temp/notebook-scratch.txt')
  expect(clipPath('~/AppData/Local/Temp/notebook-scratch.txt', 32)).toBe('~/AppData/…/notebook-scratch.txt')
  expect(clipPath('~/AppData/Local/Temp/notebook-scratch.txt', 30)).toBe('…/Temp/notebook-scratch.txt')
  expect(vw(clipPath('~/a/' + 'x'.repeat(80) + '.txt', 20))).toBe(20)

  const step = stepOf('Write', { file_path: scratch }, { type: 'create', content: 'a\nb\n', structuredPatch: [] }, OK, 'D:\\Projects')
  expect(layoutStep(step as Step, '0.1s', 60).target).toBe('~/AppData/…/Temp/notebook-scratch.txt')
  expect(layoutStep(step as Step, '0.1s', 50).target).toBe('…/Temp/notebook-scratch.txt')
  expect(layoutStep(step as Step, '0.1s', 96).target).toBe('~/AppData/Local/Temp/notebook-scratch.txt')
})

test('source labels: no userinfo host, no bidi or format characters', () => {
  expect(sourceLabel('https://github.com@other.tld/x')).toBe('other.tld · x')
  expect(sourceLabel('https://x.dev/a/%E2%80%AEtxt.exe')).toBe('x.dev · txt.exe')
  expect(sourceLabel('https://x.dev/a/b%00c')).toBe('x.dev · bc')
  expect(sourceLabel('bun.sh/guides/test/timeout.md')).toBe('bun.sh · timeout')
})

test('source labels: a host the URL parser rejects is cleaned the same way', () => {
  expect(sourceLabel(`https://ev${String.fromCodePoint(0x202e)}il.com/x`)).toBe('evil.com · x')
  expect(sourceLabel('user@evil.com/x')).toBe('evil.com · x')
})

test('urls: one label everywhere; link colour on markers and numbers only, labels muted', async () => {
  expect(sourceLabel('https://github.com/anthropics/claude-code/issues/108931')).toBe('claude-code#108931')
  expect(sourceLabel('https://github.com/anthropics/claude-code/pull/12')).toBe('claude-code#12')
  expect(sourceLabel('https://github.com/oven-sh/bun')).toBe('oven-sh/bun')
  expect(sourceLabel('https://www.vitest.dev/guide/cli/')).toBe('vitest.dev · cli')
  expect(sourceLabel('https://bun.sh')).toBe('bun.sh')

  const cites = [
    { n: 1, url: 'https://vitest.dev/guide/cli', title: 'cli' },
    { n: 2, url: 'https://github.com/oven-sh/bun', title: 'bun' }
  ]
  const line = footnoteLines(cites, 96)[0] ?? []
  expect(line.find(p => p.t === '¹ ')?.color).toBe(C.link)
  expect(line.find(p => p.t === 'vitest.dev · cli')?.color).toBe(C.muted)
  expect(line.find(p => p.t === 'oven-sh/bun')?.color).toBe(C.muted)

  const frame = sourcesFrame(
    [1, 2, 3, 4, 5].map(n => ({ n, url: `https://e.dev/docs/p${n}`, title: `page ${n}` })),
    96
  )
  const row = frame[1] ?? []
  expect(row.find(p => p.t.trim() === '1')?.color).toBe(C.link)
  expect(row.find(p => p.t === 'e.dev · p1')?.color).toBe(C.muted)

  const fetch = stepOf(
    'WebFetch',
    { url: 'https://github.com/oven-sh/bun/issues/42', prompt: 'x' },
    { code: 200 },
    { isRunning: false, isErrored: false, isInterrupted: false }
  )
  expect(fetch?.target).toBe('bun#42')
  expect(fetch?.targetColor).toBe(C.muted)

  const table = splitBlocks('| doc | size |\n|---|---:|\n| https://vitest.dev/guide/cli | 12 |\n| [bun docs](https://bun.sh/docs) | 9 |')[0]
  if (table?.kind !== 'table') throw new Error('not a table')
  expect(table.table.rows[0]?.[0]?.runs).toEqual([{ t: 'vitest.dev · cli', s: 'label' }])
  expect(table.table.rows[1]?.[0]?.runs).toEqual([{ t: 'bun.sh · docs', s: 'label' }]) // only a link: its URL label
})

// ─── Paths on disk ───────────────────────────────────────────────────────

test('`~` and the home variables expand to the home folder before a `$.fs` call, on Windows and POSIX; never onto the project', async () => {
  const win = 'C:\\Users\\me'
  expect(onDisk('~/AppData/Local/Temp/x.py', 'D:\\Projects\\ghostframe', win)).toBe('C:/Users/me/AppData/Local/Temp/x.py')
  expect(onDisk('%USERPROFILE%\\AppData\\x.py', 'D:/p', win)).toBe('C:/Users/me/AppData/x.py')
  expect(onDisk('$env:USERPROFILE/x.py', 'D:/p', win)).toBe('C:/Users/me/x.py')
  expect(onDisk('~/notes.txt', '/repo', '/home/me')).toBe('/home/me/notes.txt')
  expect(onDisk('$HOME/notes.txt', '/repo', '/home/me/')).toBe('/home/me/notes.txt')
  expect(onDisk('src/app.ts', 'D:\\Projects\\ghostframe\\', win)).toBe('D:/Projects/ghostframe/src/app.ts')
  expect(onDisk('/etc/hosts', '/repo', '/home/me')).toBe('/etc/hosts')
  expect(onDisk('~notes.txt', '/repo', '/home/me')).toBe('/repo/~notes.txt')
  expect(() => onDisk('~/x.py', 'D:/p', undefined)).toThrow(/no home folder/)
})

test('a path as shown is outside the project when it is `~/…`, absolute or climbs out', async () => {
  expect(['~/AppData/x.py', '~', 'C:/Temp/x', '/tmp/x', '../x'].map(isOffProject)).toEqual([true, true, true, true, true])
  expect(['src/app.ts', '~notes.txt', '.github/ci.yml', '..x'].map(isOffProject)).toEqual([false, false, false, false])
})

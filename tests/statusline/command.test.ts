import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { runStatusline } from '../../hooks/statusline/command'

// `/ghostframe-statusline` on an in-memory disk (the dialog itself is checked live, tools/live): it never writes without a yes, always keeps
// a backup, changes only the statusLine entry, and uninstall gives back the entry that was there before.
const HOME = 'C:/Users/me'
const SETTINGS = `${HOME}/.claude/settings.json`
const PERSONAL = { type: 'command', command: 'bun ~/.claude/ghostframe-statusline.ts', padding: 0, refreshInterval: 10 }

type Disk = Map<string, string>

// The engine interface as the command uses it, on an in-memory disk: env, fs, process.run and ui.log.
function machine(disk: Disk, hasBun = true, buildError = ''): { $: EngineInterface; runs: string[][]; logs: string[] } {
  const runs: string[][] = []
  const logs: string[] = []
  const $ = {
    plugin: { root: 'D:/plugins/ghostframe' },
    env: { get: async (name: string) => (name === 'USERPROFILE' ? HOME : undefined) },
    fs: {
      exists: async (path: string) => disk.has(path),
      read: async (path: string) => {
        const text = disk.get(path)

        if (text === undefined) throw new Error(`ENOENT ${path}`)

        return text
      },
      write: async (path: string, text: string) => {
        disk.set(path, text)
      }
    },
    process: {
      run: async (argv: string[]) => {
        runs.push([...argv])
        if (!hasBun) throw new Error('spawn bun ENOENT')
        if (argv[1] === 'build' && buildError !== '') return { exitCode: 1, stdout: '', stderr: buildError }
        if (argv[1] === 'build') disk.set(argv.at(-1) ?? '', '// bundled')

        return { exitCode: 0, stdout: '1.4.4', stderr: '' }
      }
    },
    ui: {
      log: (text: string) => {
        logs.push(text)
      }
    }
  }

  return { $: $ as unknown as EngineInterface, runs, logs }
}

const settings = (statusLine: unknown): string => `${JSON.stringify({ model: 'opus', statusLine, theme: 'dark' }, null, 2)}\n`
const yes = async (): Promise<boolean> => true
const no = async (): Promise<boolean> => false

test('install with no bun on PATH stops before touching anything', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])

  const { $ } = machine(disk, false)
  const out = await runStatusline($, 'install', yes)

  expect(out).toContain('`bun` is not on PATH')
  expect([...disk.keys()]).toEqual([SETTINGS])
})

test('install, cancelled: settings.json is not changed', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])

  const { $ } = machine(disk)
  const out = await runStatusline($, 'install', no)

  expect(out).toContain('Cancelled')
  expect(disk.get(SETTINGS)).toBe(settings(PERSONAL))
})

test('install: builds the bundle, backs up settings.json, sets only statusLine, keeps the personal entry for uninstall', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])
  const { $, runs } = machine(disk)
  const out = await runStatusline($, 'install', yes)
  const after = JSON.parse(disk.get(SETTINGS) ?? '{}') as Record<string, unknown>
  const backups = [...disk.keys()].filter(k => k.includes('settings.json.bak-'))

  expect(runs.some(r => r[1] === 'build' && r.at(-1) === `${HOME}/.claude/ghostframe/statusline.js`)).toBe(true)
  expect(after).toEqual({
    model: 'opus',
    statusLine: { type: 'command', command: `bun ${HOME}/.claude/ghostframe/statusline.js`, padding: 0, refreshInterval: 10 },
    theme: 'dark'
  })
  expect(backups.length).toBe(1)
  expect(disk.get(backups[0] ?? '')).toBe(settings(PERSONAL))
  expect(JSON.parse(disk.get(`${HOME}/.claude/ghostframe/statusline-previous.json`) ?? '{}')).toEqual({ statusLine: PERSONAL })
  expect(out).toContain('Project settings (.claude/settings.json) can also set statusLine')

  // A second install changes nothing and keeps the personal entry as the one to restore.
  expect(await runStatusline($, 'install', yes)).toContain('already runs it')
  expect(JSON.parse(disk.get(`${HOME}/.claude/ghostframe/statusline-previous.json`) ?? '{}')).toEqual({ statusLine: PERSONAL })

  // Uninstall restores the personal entry, with another backup.
  expect(await runStatusline($, 'uninstall', yes)).toContain('Wrote')
  expect(JSON.parse(disk.get(SETTINGS) ?? '{}')).toEqual(JSON.parse(settings(PERSONAL)))
  expect([...disk.keys()].filter(k => k.includes('settings.json.bak-')).length).toBeGreaterThanOrEqual(1)
  expect(await runStatusline($, 'uninstall', yes)).toContain('nothing to undo')
})

test('install where no status line was set, then uninstall removes the entry', async () => {
  const disk: Disk = new Map([[SETTINGS, '{\n  "model": "opus"\n}\n']])

  const { $ } = machine(disk)
  await runStatusline($, 'install', yes)
  expect(await runStatusline($, 'status', yes)).toContain('is installed')
  await runStatusline($, 'uninstall', yes)
  expect(disk.get(SETTINGS)).toBe('{\n  "model": "opus"\n}\n')
})

test('a settings.json that is not JSON stops the install with settings unchanged', async () => {
  const disk: Disk = new Map([[SETTINGS, '{ "model": ']])

  const { $ } = machine(disk)
  const out = await runStatusline($, 'install', yes)

  expect(out).toContain('settings.json unchanged')
  expect(disk.get(SETTINGS)).toBe('{ "model": ')
})

test('status names another status line, and an unknown option says what the options are', async () => {
  const { $ } = machine(new Map([[SETTINGS, settings(PERSONAL)]]))

  expect(await runStatusline($, 'status', yes)).toContain('run another status line')
  expect(await runStatusline($, 'remove', yes)).toContain('install | uninstall | status')
})

// The engine draws each transcript row on one line and labels it with the plugin's name itself: live, a newline drew
// as a replacement character and our own "ghostframe:" made it "ghostframe: ghostframe:".
// oxlint-disable-next-line no-control-regex -- control characters are what it looks for
const CONTROL = /[\u0000-\u001f\u007f]/

test('every message is one line with no control characters, and none adds its own "ghostframe:"', async () => {
  const messages: string[] = []
  const tabbed = '{\r\n\t"model": "opus",\r\n\t"statusLine": {"type": "command", "command": "bun ~/.claude/ghostframe-statusline.ts"}\r\n}\r\n'
  const cases: [Disk, boolean, string, string, () => Promise<boolean>][] = [
    [new Map([[SETTINGS, settings(PERSONAL)]]), true, '', 'install', yes],
    [new Map([[SETTINGS, settings(PERSONAL)]]), true, '', 'install', no],
    [new Map([[SETTINGS, tabbed]]), true, '', 'install', yes],
    [new Map([[SETTINGS, settings(PERSONAL)]]), false, '', 'install', yes],
    [new Map([[SETTINGS, settings(PERSONAL)]]), true, 'error: a\n  at main.ts:1\n\tsecond', 'install', yes],
    [new Map([[SETTINGS, '{ "model": ']]), true, '', 'install', yes],
    [new Map([[SETTINGS, settings(PERSONAL)]]), true, '', 'status', yes],
    [new Map([[SETTINGS, settings(PERSONAL)]]), true, '', 'bogus', yes]
  ]

  for (const [disk, hasBun, buildError, verb, confirm] of cases) {
    const { $, logs } = machine(disk, hasBun, buildError)

    messages.push(await runStatusline($, verb, confirm), ...logs)
    if (verb === 'install' && confirm === yes && hasBun && buildError === '' && disk.get(SETTINGS)?.includes('statusline.js') === true) {
      messages.push(await runStatusline($, 'uninstall', yes), ...logs)
    }
  }

  expect(messages.length).toBeGreaterThan(20)
  for (const m of messages) {
    expect(CONTROL.test(m)).toBe(false)
    expect(/^\s*ghostframe:/i.test(m)).toBe(false)
  }
})

test('the diff is one transcript row per line, its - and + prefixes kept', async () => {
  const { $, logs } = machine(new Map([[SETTINGS, settings(PERSONAL)]]))

  await runStatusline($, 'install', no)

  expect(logs[0]).toBe(`Installing ghostframe\u2019s status line changes ${SETTINGS}:`)
  expect(logs).toContain('-     "command": "bun ~/.claude/ghostframe-statusline.ts",')
  expect(logs).toContain(`+     "command": "bun ${HOME}/.claude/ghostframe/statusline.js",`)
  expect(logs.every(l => !l.includes('\n'))).toBe(true)
})

// Cancel (Esc counts as Cancel) writes no file at all: not the bundle, not the previous entry, not a backup.
const DIR = `${HOME}/.claude/ghostframe/`
const folder = (disk: Disk): [string, string][] => [...disk.entries()].filter(([k]) => k.startsWith(DIR)).toSorted(([a], [b]) => a.localeCompare(b))

test('install, cancelled, with no ghostframe folder yet: no folder, no build, settings.json unchanged', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])
  const { $, runs } = machine(disk)

  expect(await runStatusline($, 'install', no)).toBe('Cancelled. Nothing was changed.')
  expect(folder(disk)).toEqual([])
  expect([...disk.keys()]).toEqual([SETTINGS])
  expect(disk.get(SETTINGS)).toBe(settings(PERSONAL))
  expect(runs.some(r => r[1] === 'build')).toBe(false)
})

test('install, cancelled, over an earlier install and uninstall: the folder keeps the same files and contents', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])
  const { $ } = machine(disk)

  await runStatusline($, 'install', yes)
  await runStatusline($, 'uninstall', yes)
  // The folder now holds a bundle, the previous entry and backups; mark the bundle to see a rebuild.
  disk.set(`${DIR}statusline.js`, '// an older bundle')
  const before = folder(disk)
  const text = disk.get(SETTINGS)

  expect(await runStatusline($, 'install', no)).toBe('Cancelled. Nothing was changed.')
  expect(folder(disk)).toEqual(before)
  expect(disk.get(SETTINGS)).toBe(text)
})

test('uninstall, cancelled: the folder and settings.json are unchanged', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])
  const { $ } = machine(disk)

  await runStatusline($, 'install', yes)
  const before = folder(disk)
  const text = disk.get(SETTINGS)

  expect(await runStatusline($, 'uninstall', no)).toBe('Cancelled. Nothing was changed.')
  expect(folder(disk)).toEqual(before)
  expect(disk.get(SETTINGS)).toBe(text)
})

test('install when settings.json already runs it asks before rebuilding, and Cancel keeps the old bundle', async () => {
  const disk: Disk = new Map([[SETTINGS, settings(PERSONAL)]])
  const { $ } = machine(disk)

  await runStatusline($, 'install', yes)
  disk.set(`${DIR}statusline.js`, '// an older bundle')
  const before = folder(disk)

  expect(await runStatusline($, 'install', no)).toBe('Cancelled. Nothing was changed.')
  expect(folder(disk)).toEqual(before)
  expect(await runStatusline($, 'install', yes)).toContain('Built')
  expect(disk.get(`${DIR}statusline.js`)).toBe('// bundled')
})

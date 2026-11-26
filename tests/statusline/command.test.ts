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
function machine(disk: Disk, hasBun = true): { $: EngineInterface; runs: string[][] } {
  const runs: string[][] = []
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
        if (argv[1] === 'build') disk.set(argv.at(-1) ?? '', '// bundled')

        return { exitCode: 0, stdout: '1.4.4', stderr: '' }
      }
    },
    ui: { log: () => undefined }
  }

  return { $: $ as unknown as EngineInterface, runs }
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

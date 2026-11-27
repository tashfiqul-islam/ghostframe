// The status line's I/O: git's answer, the rate-limit cache across sessions, the icons setting, colour depth.
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ansi, depthOf, xterm256 } from './ansi.ts'
import { factsOf, limitsOf } from './facts.ts'
import { cacheDir, gitOf, iconsOn, isOwnFile, parseStatus, readLimits, writeLimits } from './io.ts'
import { len, render } from './render.ts'
import { NORMAL, PRESSURE } from './samples.ts'
import type { Seg } from './render.ts'

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0)
const dir = mkdtempSync(join(tmpdir(), 'gf-statusline-spec-'))
const text = (row: readonly Seg[] | undefined): string => (row ?? []).map(s => s.t).join('')

describe('git', () => {
  test('branch and dirty state from porcelain v1 with --branch', () => {
    expect(parseStatus('## main...origin/main [ahead 1]\n M a.ts\n')).toEqual({ branch: 'main', dirty: true })
    expect(parseStatus('## feat/x\n')).toEqual({ branch: 'feat/x', dirty: false })
    expect(parseStatus('## No commits yet on main\n')).toEqual({ branch: 'main', dirty: false })
    expect(parseStatus('## HEAD (no branch)\n')).toEqual({ branch: 'detached', dirty: false })
  })

  test('outside a repository: null, cached, and nothing thrown', () => {
    const outside = mkdtempSync(join(tmpdir(), 'gf-not-a-repo-'))

    expect(gitOf(outside, NOW, dir)).toBeNull()
    expect(gitOf(outside, NOW + 1000, dir)).toBeNull()
  })

  test('this repository: a branch, and the answer reused within 5 s', () => {
    const root = join(import.meta.dir, '..')

    // Cold-start allowance: a fresh Windows runner's first git run (loading git and reading the index cold) can take
    // longer than GIT_TIMEOUT_MS. One run first pays that, so the check below still holds gitOf to its real limit.
    Bun.spawnSync(['git', '-C', root, '--no-optional-locks', 'status', '--porcelain=v1', '--branch'], { stdout: 'ignore', stderr: 'ignore' })
    const first = gitOf(root, NOW, dir)

    expect(first?.branch).toBeTruthy()
    const t0 = performance.now()

    expect(gitOf(root, NOW + 4000, dir)).toEqual(first)
    expect(performance.now() - t0).toBeLessThan(15)
  })
})

describe('the rate-limit cache', () => {
  test('fills the 5-hour and week tiles on a fresh session, before any reply', () => {
    const file = join(dir, 'limits.json')

    writeLimits(
      {
        five_hour: { used_percentage: 34, resets_at: Math.floor((NOW + 3600e3) / 1000) },
        seven_day: { used_percentage: 8, resets_at: Math.floor((NOW + 4 * 24 * 3600e3) / 1000) }
      },
      file
    )
    // A new session's first frame: no rate_limits in the JSON yet.
    const f = factsOf({}, null, limitsOf(undefined, readLimits(file), NOW), NOW)

    expect([f.five.pct, f.week.pct]).toEqual([34, 8])
    expect(text(render(f, 200, { icons: true, slab: false })[0])).toContain('34%')
  })

  test('a corrupt or missing cache file is ignored', () => {
    const file = join(dir, 'corrupt.json')

    writeFileSync(file, '{"five_hour": {"used_perc')
    expect(readLimits(file)).toBeNull()
    expect(readLimits(join(dir, 'missing.json'))).toBeNull()
    writeFileSync(file, '[1,2]')
    expect(readLimits(file)).toBeNull()
    expect(factsOf({}, null, limitsOf(undefined, readLimits(file), NOW), NOW).five.pct).toBeNull()
  })
})

describe('the cache folder (SECURITY.md, T7)', () => {
  test('per user, by each system’s convention: LOCALAPPDATA, ~/Library/Caches, XDG_CACHE_HOME or ~/.cache', () => {
    expect(cacheDir({ LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' }, 'win32', 'C:\\Users\\ada')).toBe('C:\\Users\\ada\\AppData\\Local\\ghostframe\\cache')
    expect(cacheDir({}, 'win32', 'C:\\Users\\ada')).toBe('C:\\Users\\ada\\AppData\\Local\\ghostframe\\cache')
    expect(cacheDir({ XDG_CACHE_HOME: '/x/cache' }, 'darwin', '/Users/ada')).toBe('/Users/ada/Library/Caches/ghostframe')
    expect(cacheDir({ XDG_CACHE_HOME: '/x/cache' }, 'linux', '/home/ada')).toBe('/x/cache/ghostframe')
    expect(cacheDir({}, 'linux', '/home/ada')).toBe('/home/ada/.cache/ghostframe')
    // An empty or relative XDG_CACHE_HOME is ignored, as the XDG Base Directory spec says; so is a relative LOCALAPPDATA.
    expect(cacheDir({ XDG_CACHE_HOME: '' }, 'linux', '/home/ada')).toBe('/home/ada/.cache/ghostframe')
    expect(cacheDir({ XDG_CACHE_HOME: 'cache' }, 'linux', '/home/ada')).toBe('/home/ada/.cache/ghostframe')
    expect(cacheDir({ LOCALAPPDATA: 'Local' }, 'win32', 'C:\\Users\\ada')).toBe('C:\\Users\\ada\\AppData\\Local\\ghostframe\\cache')
  })

  test('a cache file is read only when it is a regular file the current user owns', () => {
    const file = { uid: 1000, isFile: () => true }

    expect(isOwnFile(file, 1000)).toBe(true)
    expect(isOwnFile(file, 1001)).toBe(false)
    expect(isOwnFile({ uid: 1000, isFile: () => false }, 1000)).toBe(false)
    // No user ids (Windows): the per-user folder is the boundary.
    expect(isOwnFile(file, undefined)).toBe(true)
  })

  test('the first write creates the folder; on Linux and macOS only its user can read the folder or the file', () => {
    const cache = join(mkdtempSync(join(tmpdir(), 'gf-cache-')), 'ghostframe')
    const file = join(cache, 'limits.json')

    writeLimits({ five_hour: { used_percentage: 12, resets_at: Math.floor((NOW + 3600e3) / 1000) } }, file)
    expect(readLimits(file)?.five_hour?.used_percentage).toBe(12)
    gitOf(join(import.meta.dir, '..'), NOW, cache)
    expect(readdirSync(cache).filter(f => f.startsWith('git-')).length).toBe(1)
    expect(readdirSync(cache).some(f => f.endsWith('.tmp'))).toBe(false)
    if (process.platform !== 'win32') {
      expect(statSync(cache).mode & 0o777).toBe(0o700)
      expect(statSync(file).mode & 0o777).toBe(0o600)
    }
  })

  test('a link planted where a cache file goes is not followed', () => {
    const cache = mkdtempSync(join(tmpdir(), 'gf-cache-'))
    const target = join(cache, 'elsewhere.json')
    const link = join(cache, 'limits.json')

    writeFileSync(target, JSON.stringify({ five_hour: { used_percentage: 99, resets_at: Math.floor((NOW + 3600e3) / 1000) } }))
    try {
      symlinkSync(target, link)
    } catch {
      // Windows without the symlink privilege: no link can be planted, so there is nothing to follow.
      expect(process.platform).toBe('win32')
      return
    }
    expect(existsSync(link)).toBe(true)
    expect(readLimits(link)).toBeNull()
  })
})

describe('the icons setting', () => {
  test('GF_ICONS wins; else statuslineIcons in the user settings; else on', () => {
    const cfg = mkdtempSync(join(tmpdir(), 'gf-cfg-'))

    expect(iconsOn({ CLAUDE_CONFIG_DIR: cfg })).toBe(true)
    writeFileSync(join(cfg, 'settings.json'), JSON.stringify({ pluginConfigs: { 'ghostframe@market': { options: { statuslineIcons: false } } } }))
    expect(iconsOn({ CLAUDE_CONFIG_DIR: cfg })).toBe(false)
    expect(iconsOn({ CLAUDE_CONFIG_DIR: cfg, GF_ICONS: '1' })).toBe(true)
    expect(iconsOn({ GF_ICONS: '0' })).toBe(false)
  })
})

describe('colour depth', () => {
  test('24-bit where COLORTERM or the terminal says so, else 256 colours', () => {
    expect(depthOf({ COLORTERM: 'truecolor' })).toBe('truecolor')
    expect(depthOf({ WT_SESSION: 'x' })).toBe('truecolor')
    expect(depthOf({ TERM_PROGRAM: 'iTerm.app' })).toBe('truecolor')
    expect(depthOf({ TERM: 'xterm-256color' })).toBe('256')
    expect(depthOf({})).toBe('256')
    // A failed detection never drops to none.
    expect(depthOf({ TERM: 'dumb' })).toBe('256')
    expect(depthOf({ NO_COLOR: '', TERM: 'xterm-256color' })).toBe('256')
  })

  test('no COLORTERM, no WT_SESSION, TERM=xterm-256color: 256-colour escapes, never plain text', () => {
    const env = { TERM: 'xterm-256color' }
    const rows = render(factsOf({ context_window: { used_percentage: 41 } }, { branch: 'main', dirty: false }, {}, NOW), 200, { icons: true, slab: false })
    const out = rows.map(r => ansi(r, depthOf(env))).join('\n')

    expect(depthOf(env)).toBe('256')
    expect(out.includes('\x1b[38;5;')).toBe(true)
    expect(out.includes('\x1b[48;5;')).toBe(true)
    expect(out.includes('\x1b[38;2;') || out.includes('\x1b[48;2;')).toBe(false)
  })

  test('NO_COLOR set to anything non-empty: no escapes at all, over every other signal', () => {
    const rows = render(factsOf({ context_window: { used_percentage: 41 } }, { branch: 'main', dirty: false }, {}, NOW), 200, { icons: true, slab: false })

    for (const env of [{ NO_COLOR: '1' }, { NO_COLOR: '0', COLORTERM: 'truecolor', WT_SESSION: 'x' }]) {
      expect(depthOf(env)).toBe('none')
      expect(
        rows
          .map(r => ansi(r, depthOf(env)))
          .join('\n')
          .includes('\x1b')
      ).toBe(false)
    }
  })

  test('text from outside (a folder name, say) carries no control characters to the terminal, only the row’s own SGR', () => {
    // A folder name may hold ESC and BEL on Linux and macOS: here an OSC 8 link and a cursor move hidden in a repo name.
    const evil = 'repo\x1b]8;;https://evil.example\x07click\x1b]8;;\x07\x1b[2Jend\x9b'

    for (const depth of ['truecolor', '256', 'none'] as const) {
      // oxlint-disable-next-line no-control-regex -- the row's own SGR escapes are what may stay
      const rest = ansi([{ t: evil, fg: '#ECECF1' }], depth).replaceAll(/\x1b\[[\d;]*m/g, '')

      // oxlint-disable-next-line no-control-regex -- C0 and C1 controls are what must be gone
      expect(/[\x00-\x1f\x7f-\x9f]/.test(rest)).toBe(false)
      expect(rest).toContain('repo')
      expect(rest).toContain('end')
    }
  })

  test('plain text keeps every row’s width and glyphs: only the escapes go', () => {
    // oxlint-disable-next-line no-control-regex -- the SGR escape is what this strips
    const strip = (s: string): string => s.replaceAll(/\x1b\[[\d;]*m/g, '')

    for (const w of [90, 100, 140, 200, 210]) {
      for (const f of [NORMAL, PRESSURE]) {
        for (const row of render(f, w, { icons: true, slab: false })) {
          const plain = ansi(row, 'none')

          expect(plain).toBe(strip(ansi(row, 'truecolor')))
          expect(len(row)).toBe(w)
          expect(len([{ t: plain }])).toBe(w)
        }
      }
    }
  })

  test('the nearest 256-colour index, from the cube or the grey ramp', () => {
    expect(xterm256('#000000')).toBe(16)
    expect(xterm256('#FFFFFF')).toBe(231)
    expect(xterm256('#FF0000')).toBe(196)
    expect(xterm256('#808080')).toBe(244)
    expect(xterm256('#17171F')).toBe(234)
  })
})

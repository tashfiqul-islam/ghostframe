// The status line's I/O: git's answer, the rate-limit cache across sessions, the icons setting, colour depth.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ansi, depthOf, xterm256 } from './ansi.ts'
import { factsOf, limitsOf } from './facts.ts'
import { gitOf, iconsOn, parseStatus, readLimits, writeLimits } from './io.ts'
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

    expect(gitOf(outside, NOW)).toBeNull()
    expect(gitOf(outside, NOW + 1000)).toBeNull()
  })

  test('this repository: a branch, and the answer reused within 5 s', () => {
    const root = join(import.meta.dir, '..')
    const first = gitOf(root, NOW)

    expect(first?.branch).toBeTruthy()
    const t0 = performance.now()

    expect(gitOf(root, NOW + 4000)).toEqual(first)
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

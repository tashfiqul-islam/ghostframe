// The status line's I/O: git (once per render at most, cached 5 s per folder), the rate-limit cache, the icons
// setting and the debug log. Every reader here returns what it has and never throws: the status line must draw.
import { appendFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { isRecord } from '../hooks/shared/calls/fields.ts'
import type { Git, Limits } from './facts.ts'

/** The widest W draws at, unless GF_MAXW says otherwise: very wide terminals keep the compact layout. */
export const MAX_W = 210

/**
 * The renderer's width: Claude Code cuts a line longer than COLUMNS − 4 − 2 × padding with "…" (measured in 2.1.332).
 * @param env the environment (COLUMNS, GF_PADDING, GF_MAXW)
 * @returns W
 */
export function widthOf(env: Record<string, string | undefined>): number {
  const cols = Number(env['COLUMNS']) || 160
  const padding = Number(env['GF_PADDING'] ?? 0) || 0
  const max = Number(env['GF_MAXW']) || MAX_W

  return Math.min(cols - 4 - 2 * padding, max)
}

/** How long git's answer for one folder is reused. */
export const GIT_TTL_MS = 5000
/** The longest git may run before the render gives up on it. */
export const GIT_TIMEOUT_MS = 800

/** Where the last known rate limits are kept between sessions. */
export const LIMITS_FILE: string = join(tmpdir(), 'ghostframe-statusline-limits.json')
const DEBUG_FILE = join(tmpdir(), 'ghostframe-statusline-debug.log')

/**
 * Appends a line to the debug log in the temp folder when GF_DEBUG=1. Never writes to stderr.
 * @param msg the line
 */
export function debug(msg: string): void {
  if (process.env['GF_DEBUG'] !== '1') return
  try {
    appendFileSync(DEBUG_FILE, `${new Date().toISOString()} ${msg}\n`)
  } catch {
    // shortcut: a debug log that cannot be written is dropped; the status line still draws.
  }
}

// Writes whole files only: a reader in another session never sees half of one.
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`

  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

/**
 * Reads `git status --porcelain=v1 --branch` output: the branch, and whether anything is uncommitted.
 * @param out git's stdout
 * @returns branch and dirty state
 */
export function parseStatus(out: string): Git {
  const lines = out.split('\n').filter(l => l.trim() !== '')
  const head = (lines[0] ?? '').replace(/^## /, '')
  let branch = (head.split('...')[0] ?? '').replace(/^No commits yet on /, '').replace(/^Initial commit on /, '')

  if (branch.startsWith('HEAD')) branch = 'detached'

  return { branch: branch.trim(), dirty: lines.length > 1 }
}

const hash = (s: string): string => Bun.hash(s).toString(16)

/**
 * Branch and dirty state for a folder: from the cache when it is under 5 s old, else from one git run, whose answer
 * (a repository's state, or none for a folder outside any) is cached.
 * @param dir the folder
 * @param now the time now, epoch ms
 * @returns branch and dirty state, or null outside a repository or when git failed
 */
export function gitOf(dir: string, now: number): Git | null {
  const file = join(tmpdir(), `ghostframe-statusline-git-${hash(dir)}.json`)

  try {
    const c: unknown = JSON.parse(readFileSync(file, 'utf8'))

    if (isRecord(c) && c['dir'] === dir && typeof c['at'] === 'number' && now - c['at'] >= 0 && now - c['at'] < GIT_TTL_MS) {
      const g = c['git']

      if (g === null) return null
      if (isRecord(g) && typeof g['branch'] === 'string' && typeof g['dirty'] === 'boolean') return { branch: g['branch'], dirty: g['dirty'] }
    }
  } catch {
    // no cache yet, or a broken one: ask git
  }

  let git: Git | null = null

  try {
    const r = Bun.spawnSync(['git', '-C', dir, '--no-optional-locks', 'status', '--porcelain=v1', '--branch'], {
      stdout: 'pipe',
      stderr: 'ignore',
      timeout: GIT_TIMEOUT_MS
    })

    git = r.exitCode === 0 ? parseStatus(r.stdout.toString()) : null
    debug(`git ${dir}: exit ${r.exitCode}`)
  } catch (e) {
    debug(`git failed: ${String(e)}`)
  }
  try {
    writeAtomic(file, JSON.stringify({ at: now, dir, git }))
  } catch (e) {
    debug(`git cache not written: ${String(e)}`)
  }

  return git
}

/**
 * The last rate limits written, or null when there is no cache or it is not valid JSON.
 * @param file the cache file
 * @returns the cached windows, or null
 */
export function readLimits(file: string = LIMITS_FILE): Limits | null {
  try {
    const c: unknown = JSON.parse(readFileSync(file, 'utf8'))

    return isRecord(c) ? c : null
  } catch {
    return null
  }
}

/**
 * Keeps the live rate limits for the next session's first frame.
 * @param limits the windows Claude Code just sent
 * @param file the cache file
 */
export function writeLimits(limits: Limits, file: string = LIMITS_FILE): void {
  try {
    writeAtomic(file, JSON.stringify(limits))
  } catch (e) {
    debug(`limits cache not written: ${String(e)}`)
  }
}

/**
 * Whether to draw Nerd Font icons: GF_ICONS (0 or 1) wins; else ghostframe's `statuslineIcons` option in the user's
 * settings (`pluginConfigs`, under any `ghostframe` key); else on.
 * @param env the environment
 * @returns true to draw icons
 */
export function iconsOn(env: Record<string, string | undefined>): boolean {
  if (env['GF_ICONS'] === '0') return false
  if (env['GF_ICONS'] === '1') return true

  const dir = env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')

  try {
    const s: unknown = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    const configs = isRecord(s) && isRecord(s['pluginConfigs']) ? s['pluginConfigs'] : {}

    for (const [key, cfg] of Object.entries(configs)) {
      const options = isRecord(cfg) ? cfg['options'] : undefined

      if (/^ghostframe(@|$)/.test(key) && isRecord(options) && options['statuslineIcons'] === false) return false
    }
  } catch (e) {
    debug(`settings not read for icons: ${String(e)}`)
  }

  return true
}

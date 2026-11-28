// The status line's I/O: git (once per render at most, cached 5 s per folder), the rate-limit cache, the icons
// setting and the debug log. Every reader here returns what it has and never throws: the status line must draw.
//
// The caches and the log live in a per-user cache folder, never the shared temp folder (SECURITY.md, T7): another
// user on the machine can neither plant a file there nor read one, and a file the current user does not own is
// ignored all the same.
import { appendFileSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, posix, win32 } from 'node:path'

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

/**
 * The status line's per-user cache folder, by each system's convention: `%LOCALAPPDATA%\\ghostframe\\cache` on
 * Windows (the per-user, non-roaming known folder), `~/Library/Caches/ghostframe` on macOS, and
 * `$XDG_CACHE_HOME/ghostframe` elsewhere, with `~/.cache` when XDG_CACHE_HOME is unset, empty or relative (the XDG Base
 * Directory spec says to ignore a relative path).
 * @param env the environment (LOCALAPPDATA, XDG_CACHE_HOME)
 * @param platform the system, as `process.platform` names it
 * @param home the user's home folder
 * @returns the folder's absolute path
 */
export function cacheDir(env: Record<string, string | undefined>, platform: string = process.platform, home: string = homedir()): string {
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA']

    return win32.join(local !== undefined && win32.isAbsolute(local) ? local : win32.join(home, 'AppData', 'Local'), 'ghostframe', 'cache')
  }
  if (platform === 'darwin') return posix.join(home, 'Library', 'Caches', 'ghostframe')

  const xdg = env['XDG_CACHE_HOME']

  return posix.join(xdg !== undefined && posix.isAbsolute(xdg) ? xdg : posix.join(home, '.cache'), 'ghostframe')
}

/**
 * A file in this user's cache folder (created on the first write). Resolved on each call, inside the caller's try:
 * with no home folder to find, `homedir()` throws.
 * @param name the file's name
 * @param dir the cache folder, when the caller names one
 * @returns the file's path
 */
const cacheFile = (name: string, dir?: string): string => join(dir ?? cacheDir(process.env), name)

/**
 * Whether a file may be read as the status line's own: a regular file (never a link, a pipe or a device) owned by
 * the current user. Where the system has no user ids (Windows), the per-user folder is the boundary.
 * @param st the file's stat, taken from the open descriptor
 * @param uid the current user's id, or undefined where there is none
 * @returns true to read it
 */
export function isOwnFile(st: { uid: number; isFile: () => boolean }, uid: number | undefined): boolean {
  return st.isFile() && (uid === undefined || st.uid === uid)
}

/**
 * A cache file's text, or null when it is missing, is not a regular file the current user owns, or cannot be read.
 * A link is refused, and on Linux and macOS the file is opened without following one (O_NOFOLLOW) and checked on the
 * open descriptor, so nothing can be swapped in between. Windows has no O_NOFOLLOW: the check before the open stands.
 * @param file the file
 * @returns its text, or null
 */
export function readOwn(file: string): string | null {
  let fd: number | undefined

  try {
    if (lstatSync(file).isSymbolicLink()) {
      debug(`ignored a link in the cache folder: ${file}`)
      return null
    }
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    if (!isOwnFile(fstatSync(fd), process.getuid?.())) {
      debug(`ignored a cache file that is not this user's: ${file}`)
      return null
    }

    return readFileSync(fd, 'utf8')
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Creates the cache folder if it is missing, readable only by its user (0700, as the XDG spec asks). A folder that
 * already exists keeps its permissions.
 * @param dir the folder
 */
function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
}

/**
 * Appends a line to the debug log in the cache folder when GF_DEBUG=1. Never writes to stderr.
 * @param msg the line
 */
export function debug(msg: string): void {
  if (process.env['GF_DEBUG'] !== '1') return
  try {
    const file = cacheFile('debug.log')

    ensureDir(join(file, '..'))
    appendFileSync(file, `${new Date().toISOString()} ${msg}\n`, { mode: 0o600 })
  } catch {
    // shortcut: a debug log that cannot be written is dropped; the status line still draws.
  }
}

// Writes whole files only, so a reader in another session never sees half of one: a new temp file (never an existing
// one, `wx`), readable only by this user, renamed over the old.
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`

  ensureDir(join(path, '..'))
  writeFileSync(tmp, text, { flag: 'wx', mode: 0o600 })
  renameSync(tmp, path)
}

/**
 * The branch a folder's repository is on, read from its `HEAD` file with no git run: the `.git` folder above the
 * folder, or the `.git` file a linked worktree or submodule has, which names its git folder.
 * shortcut: GIT_DIR and bare repositories are not looked for; the status line runs in a work tree. Upgrade if one shows.
 * @param dir the folder
 * @returns the branch, `detached` when HEAD names a commit, or null outside a repository
 */
export function headOf(dir: string): string | null {
  for (let at = dir; ;) {
    const dotGit = join(at, '.git')

    try {
      const st = lstatSync(dotGit)
      const gitDir = st.isDirectory() ? dotGit : /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]

      if (gitDir === undefined) return null
      const head = readFileSync(join(isAbsolute(gitDir) ? '' : at, gitDir, 'HEAD'), 'utf8').trim()
      const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head)?.[1]

      return ref ?? 'detached'
    } catch {
      // no .git here (or one that cannot be read): look in the folder above
    }
    const up = dirname(at)

    if (up === at) return null
    at = up
  }
}

/**
 * Whether anything in a folder's repository is uncommitted, from at most two git runs, neither of which reads a
 * file's contents: tracked changes, staged or not, by `diff-index` against HEAD (by each file's size and time, so a
 * file written again with the same bytes counts as changed until git next refreshes its index), and only when there
 * are none, any file not ignored and not yet added. A repository with no commits yet has no HEAD to compare: there,
 * anything in its index or folder counts. `git status` read every changed file to compare it, which in a repository
 * with large changed files took half a second and more.
 * @param dir the folder
 * @returns true when something is uncommitted, false when nothing is, null when git failed
 */
export function dirtyOf(dir: string): boolean | null {
  const git = (...args: string[]): { code: number | null; out: string } => {
    const r = Bun.spawnSync(['git', '-C', dir, '--no-optional-locks', ...args], { stdout: 'pipe', stderr: 'ignore', timeout: GIT_TIMEOUT_MS })

    return { code: r.exitCode, out: r.stdout.toString() }
  }
  const tracked = git('diff-index', '--quiet', 'HEAD', '--')

  debug(`git diff-index ${dir}: exit ${tracked.code}`)
  if (tracked.code === 1) return true

  const isUnborn = tracked.code !== 0 && git('rev-parse', '--verify', '--quiet', 'HEAD').code === 1
  if (tracked.code !== 0 && !isUnborn) return null
  const rest = git('ls-files', ...(isUnborn ? ['--cached'] : []), '--others', '--exclude-standard', '--directory', '--no-empty-directory')

  return rest.code === 0 ? rest.out.trim().length > 0 : null
}

const hash = (s: string): string => Bun.hash(s).toString(16)
/** A folder's git answer's cache file name. */
const gitName = (dir: string): string => `git-${hash(dir)}.json`

/** How long a refresh asked for may take before another is asked for. */
const REFRESH_WAIT_MS = 10_000

/** Starts git's answer for a folder off the render: `(dir, cacheDir) => void`. */
export type Refresh = (dir: string, cacheDir: string) => void

/**
 * A refresh in a process of its own, so the render that asks for it never waits on git: `bun <entry> --git-refresh
 * <dir> <cache>`, detached, its output ignored.
 * @param entry the status line's entry point (the bundle the installed command runs, or main.ts)
 * @returns the refresh
 */
export function spawnRefresh(entry: string): Refresh {
  return (dir, cache) => {
    try {
      spawn(process.execPath, [entry, '--git-refresh', dir, cache], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } catch (e) {
      debug(`git refresh not started: ${String(e)}`)
    }
  }
}

/**
 * Asks git, and keeps its answer for the next render: `dirtyOf`, written to the folder's cache file.
 * @param dir the folder
 * @param now the time now, epoch ms
 * @param cache the cache folder, this user's when not given
 */
export function refreshGit(dir: string, now: number, cache?: string): void {
  const dirty = dirtyOf(dir)

  try {
    writeAtomic(cacheFile(gitName(dir), cache), JSON.stringify({ at: now, dir, dirty }))
  } catch (e) {
    debug(`git cache not written: ${String(e)}`)
  }
}

/**
 * Branch and dirty state for a folder, never waiting on git: the branch from its HEAD file, the dirty state from the
 * last answer git gave (none, so no mark, at a folder's first draw). An answer older than 5 s, or none, asks for a
 * refresh, at most one every 10 s, which the next render draws.
 * @param dir the folder
 * @param now the time now, epoch ms
 * @param cache the cache folder, this user's when not given
 * @param refresh how a refresh is started
 * @returns branch and dirty state, or null outside a repository
 */
export function gitOf(dir: string, now: number, cache: string | undefined, refresh: Refresh): Git | null {
  const branch = headOf(dir)

  if (branch === null) return null

  let folder: string
  let file: string

  try {
    folder = cache ?? cacheDir(process.env)
    file = cacheFile(gitName(dir), folder)
  } catch (e) {
    debug(`git cache folder unknown: ${String(e)}`)
    return { branch, dirty: false }
  }

  let c: Record<string, unknown> = {}

  try {
    const read: unknown = JSON.parse(readOwn(file) ?? '')

    if (isRecord(read) && read['dir'] === dir) c = read
  } catch {
    // no answer yet, or a broken one: one is asked for below
  }
  const age = (key: string): number => {
    const at = c[key]

    return typeof at === 'number' ? now - at : Number.POSITIVE_INFINITY
  }
  const dirty = typeof c['dirty'] === 'boolean' ? c['dirty'] : false

  if (!(age('at') >= 0 && age('at') < GIT_TTL_MS) && !(age('asked') >= 0 && age('asked') < REFRESH_WAIT_MS)) {
    try {
      writeAtomic(file, JSON.stringify({ ...c, dir, asked: now }))
    } catch (e) {
      debug(`git refresh not noted: ${String(e)}`)
    }
    refresh(dir, folder)
  }

  return { branch, dirty }
}

/**
 * The last rate limits written, or null when there is no cache, it is not this user's, or it is not valid JSON.
 * @param file the cache file, `limits.json` in this user's cache folder when not given
 * @returns the cached windows, or null
 */
export function readLimits(file?: string): Limits | null {
  try {
    const c: unknown = JSON.parse(readOwn(file ?? cacheFile('limits.json')) ?? '')

    return isRecord(c) ? c : null
  } catch {
    return null
  }
}

/**
 * Keeps the live rate limits for the next session's first frame.
 * @param limits the windows Claude Code just sent
 * @param file the cache file, `limits.json` in this user's cache folder when not given
 */
export function writeLimits(limits: Limits, file?: string): void {
  try {
    writeAtomic(file ?? cacheFile('limits.json'), JSON.stringify(limits))
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

  try {
    const dir = env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
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

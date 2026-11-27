// The entry, run as Claude Code runs it: JSON on stdin, one status line on stdout, no error.
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cacheDir } from './io.ts'

const MAIN = join(import.meta.dir, 'main.ts')

const run = (json: unknown, env: Record<string, string>): { code: number; out: string; err: string } => {
  const r = Bun.spawnSync([process.execPath, MAIN], { stdin: Buffer.from(JSON.stringify(json)), env, stdout: 'pipe', stderr: 'pipe' })

  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

// One temp folder serves as every test's home and cache folder, so no test writes to the real ones.
const home = mkdtempSync(join(tmpdir(), 'gf-main-spec-'))

afterAll(() => rmSync(home, { recursive: true, force: true }))

// An OSC 8 link and an SGR colour, as a folder or repository name could carry them.
const HOSTILE = 'ab\x1b]8;;https://x\x07gh\x1b[31m\x1b]8;;\x07'

/**
 * Draws the fallback line for a workspace and checks that it holds no control characters.
 * @param workspace Claude Code's workspace field
 * @returns the line
 */
function fallbackLine(workspace: Record<string, unknown>): string {
  // A fractional COLUMNS gives a fractional W, which the two-row layout cannot fill, so main takes its catch path; the
  // debug log proves it did.
  // This works only because widthOf (io.ts) lets a fractional width through; if that is ever fixed, the debug.log
  // assertion below fails instead of letting the test pass without reaching the catch path.
  const env = {
    PATH: process.env['PATH'] ?? '',
    COLUMNS: '100.5',
    GF_DEBUG: '1',
    GF_ICONS: '0',
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: home,
    XDG_CACHE_HOME: home
  }
  const r = run({ model: { display_name: 'Opus 5.5' }, workspace, context_window: { used_percentage: 40 } }, env)

  expect(readFileSync(join(cacheDir(env, process.platform, home), 'debug.log'), 'utf8')).toContain('fallback:')
  expect(r.code).toBe(0)
  // oxlint-disable-next-line no-control-regex -- the controls are what this looks for
  expect(r.out.replace(/\n$/, '')).not.toMatch(/[\x00-\x1f\x7f-\x9f]/)

  return r.out
}

test('the fallback line holds no control characters from a hostile repository name', () => {
  const dir = join(home, HOSTILE)

  expect(fallbackLine({ current_dir: dir, project_dir: dir, repo: { name: `repo${HOSTILE}` } })).toContain('repoab')
})

test('the fallback line holds no control characters from a hostile folder name', () => {
  const dir = join(home, HOSTILE)

  // No repo.name, so the folder's basename is the name shown: the URL's slashes leave only "x...gh..." of it.
  expect(fallbackLine({ current_dir: dir, project_dir: dir })).toContain('xgh')
})

test('no home folder: a status line, exit 0 and nothing on stderr', () => {
  // Only Windows proves the fix (CI runs windows-2025): on Linux and macOS homedir() falls back to the passwd entry when
  // HOME is empty. XDG_CACHE_HOME keeps the git cache there out of the real ~/.cache.
  const env = { PATH: process.env['PATH'] ?? '', COLUMNS: '120', USERPROFILE: '', HOME: '', HOMEDRIVE: '', HOMEPATH: '', XDG_CACHE_HOME: home }
  const r = run({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: tmpdir() }, context_window: { used_percentage: 40 } }, env)

  expect(r.err).toBe('')
  expect(r.code).toBe(0)
  expect(r.out).toContain('Opus 5.5')
  // Both rows: a missing home folder costs the caches and the settings, never the layout.
  expect(r.out.trimEnd().split('\n').length).toBe(2)
})

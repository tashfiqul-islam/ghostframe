// The entry, run as Claude Code runs it: JSON on stdin, one status line on stdout, no error.
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cacheDir } from './io.ts'

const MAIN = join(import.meta.dir, 'main.ts')

const run = (json: unknown, env: Record<string, string>): { code: number; out: string; err: string } => {
  const r = Bun.spawnSync([process.execPath, MAIN], { stdin: Buffer.from(JSON.stringify(json)), env, stdout: 'pipe', stderr: 'pipe' })

  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

// An OSC 8 link and an SGR colour, as a folder or repository name could carry them.
const HOSTILE = 'ab\x1b]8;;https://x\x07gh\x1b[31m\x1b]8;;\x07'

test('the fallback line drawn after a failed render holds no control characters from outside text', () => {
  const home = mkdtempSync(join(tmpdir(), 'gf-main-spec-'))
  // A fractional COLUMNS gives a fractional W, which the two-row layout cannot fill, so main takes its catch path; the
  // debug log proves it did.
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
  const json = {
    model: { display_name: 'Opus 5.5' },
    workspace: { current_dir: join(home, HOSTILE), project_dir: join(home, HOSTILE), repo: { name: `repo${HOSTILE}` } },
    context_window: { used_percentage: 40 }
  }
  const r = run(json, env)

  expect(readFileSync(join(cacheDir(env, process.platform, home), 'debug.log'), 'utf8')).toContain('fallback:')
  expect(r.code).toBe(0)
  expect(r.out).toContain('repoab')
  // oxlint-disable-next-line no-control-regex -- the controls are what this looks for
  expect(r.out.replace(/\n$/, '')).not.toMatch(/[\x00-\x1f\x7f-\x9f]/)
})

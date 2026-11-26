// The throwaway repo the checks work in, rebuilt before each suite: what D:\Projects\cockpit-live-setup.ps1 creates (a
// width function that counts code units, its three tests, and a PreToolUse hook that blocks `git push`), written into
// the folder in place. The folder itself stays: a terminal left open in it holds it, and Windows will not remove it.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILES: Record<string, string> = {
  'package.json': '{ "name": "cockpit-live", "private": true, "type": "module" }\n',
  'src/width.ts': ['// Cells a string takes. Bug: counts UTF-16 code units.', 'export const width = (s: string): number => s.length', ''].join('\n'),
  'src/width.test.ts': [
    "import { expect, test } from 'bun:test'",
    "import { width } from './width'",
    '',
    "test('ascii', () => expect(width('abc')).toBe(3))",
    String.raw`test('combining mark', () => expect(width('e\u0301')).toBe(1))`,
    "test('emoji', () => expect(width('👍🏽')).toBe(2))",
    ''
  ].join('\n'),
  '.claude/hooks/guard-main.ps1': [
    '# Blocks any `git push` (exit 2 tells Claude Code to block the call and show stderr).',
    '$call = [Console]::In.ReadToEnd() | ConvertFrom-Json',
    String.raw`if ($call.tool_input.command -match '\bgit\s+push\b') {`,
    "  [Console]::Error.WriteLine('pushing is blocked in this repo')",
    '  exit 2',
    '}',
    'exit 0',
    ''
  ].join('\n'),
  '.claude/settings.json': `${JSON.stringify(
    { hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'pwsh -NoProfile -File .claude/hooks/guard-main.ps1' }] }] } },
    null,
    2
  )}\n`
}

const git = (root: string, ...args: string[]): void => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' })

  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${root}: ${r.stderr}`)
}

/**
 * Empties the repo folder and writes the starting repo into it, one commit `chore: start`.
 * @param root the throwaway repo's folder
 * @returns what was there before, for the run log
 */
export function resetRepo(root: string): string[] {
  const before = existsSync(root) ? readdirSync(root) : []

  // Only the entries of this one configured folder, listed just above, are removed.
  for (const entry of before) rmSync(join(root, entry), { recursive: true, force: true })
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  git(root, 'init', '-q')
  // Its own identity, unsigned: the checks never depend on (or sign with) the machine's git setup, and a fresh Linux
  // or macOS box has no global identity at all.
  git(root, 'config', 'user.name', 'Live checks')
  git(root, 'config', 'user.email', 'live-checks@example.invalid')
  git(root, 'config', 'commit.gpgsign', 'false')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'chore: start')
  // A remote, so Claude tries `git push` (step 4) and the hook blocks it; `.invalid` never resolves, nothing is sent.
  git(root, 'remote', 'add', 'origin', 'https://example.invalid/cockpit-live.git')

  return before
}

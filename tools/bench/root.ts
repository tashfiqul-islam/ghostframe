// Runs chosen test files in Claude Code's plugin harness, apart from the plugin's own suite. `claude plugin test`
// runs every *.test.ts(x) under the folder it is given, and refuses a hooks folder that is a link (path traversal),
// so this copies the plugin (manifest, hooks, types, tests/support) into a fresh temporary root and puts only the
// chosen files under its tests/, each renamed to *.test.ts(x). A file keeps its folder under tests/, so its
// relative imports resolve as they do in the repo.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..', '..')
/** The plugin itself: from `plugin` when one is named (the Performance check measures main's with this tree's harness). */
const PLUGIN = ['.claude-plugin', 'hooks', 'types']
/** The harness: always this tree's, so both sides of a comparison are measured with the same benchmark. */
const COPIED = [join('tests', 'support'), join('tests', 'fixtures'), join('tests', 'tsconfig.json'), join('tools', 'perf', 'probe', 'hooks')]

/** What one harness run printed and how it ended. */
export type HarnessRun = { status: number; output: string; root: string }

/**
 * Copies the plugin and the given test files into a temporary root and runs the harness there.
 * @param files repo-relative paths under tests/, named `*.test.ts(x)` or `*.bench.ts(x)`
 * @param env extra variables for the harness
 * @param plugin the folder the plugin's own code (manifest, hooks, types) is copied from; this tree when not given
 * @param overrides files written into the root after the copy, by root-relative path
 * @returns the harness's exit status and its whole output
 */
export function runInRoot(
  files: readonly string[],
  env: Record<string, string> = {},
  plugin: string = REPO,
  overrides: Readonly<Record<string, string>> = {}
): HarnessRun {
  const root = mkdtempSync(join(tmpdir(), 'ghostframe-bench-'))

  for (const part of PLUGIN) cpSync(join(plugin, part), join(root, part), { recursive: true })
  for (const part of COPIED) cpSync(join(REPO, part), join(root, part), { recursive: true })
  for (const file of files) {
    const from = resolve(REPO, file)
    const under = relative(join(REPO, 'tests'), from)

    if (under.startsWith('..')) throw new Error(`${file} is not under tests/`)
    const to = join(root, 'tests', dirname(under), basename(under).replace(/\.bench\.(tsx?)$/, '.test.$1'))
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to)
  }
  for (const [path, text] of Object.entries(overrides)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  const run = spawnSync(process.env['BENCH_CLAUDE'] ?? 'claude', ['plugin', 'test', '.'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024
  })

  if (run.error !== undefined) throw run.error

  return { status: run.status ?? 1, output: `${run.stdout}${run.stderr}`, root }
}

if (import.meta.main) {
  const files = process.argv.slice(2)

  if (files.length === 0) throw new Error('usage: bun tools/bench/root.ts <tests/…/file.test.tsx> …')
  const run = runInRoot(files)

  process.stdout.write(run.output)
  process.exit(run.status)
}

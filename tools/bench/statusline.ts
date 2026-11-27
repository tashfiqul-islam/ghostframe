// The status line's run time (docs/development/performance.md): one run from process start to its last byte, in three
// forms: the source under `bun run`, the bundle `/ghostframe-statusline install` writes (`bun build --target=bun`,
// run by `bun`), and a `bun build --compile` single-file executable. Each cold (its git cache empty, so git runs)
// and warm (git's answer cached), in this repo and in the 40,000-file fixture repo. Process start alone (an empty
// program of the same form) and git alone are timed beside them, so the remainder is the render.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { BUDGETS } from './budgets.ts'

const REPO = resolve(import.meta.dirname, '..', '..')
const MAIN = join(REPO, 'statusline', 'main.ts')
const RUNS = 15

/** One form's timings, ms. */
export type FormTimes = { form: string; repo: string; startP50: number; coldP50: number; coldP95: number; warmP50: number; warmP95: number; gitP50: number }

const p = (ms: readonly number[], q: number): number => {
  const s = ms.toSorted((a, b) => a - b)

  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] ?? 0
}

const time = (argv: readonly string[], stdin: string, env: Record<string, string>): number => {
  const t0 = performance.now()
  const r = spawnSync(argv[0] ?? '', argv.slice(1), { input: stdin, env: { ...process.env, ...env }, encoding: 'utf8' })

  if (r.status !== 0) throw new Error(`${argv.join(' ')} exited ${r.status}: ${r.stderr}`)

  return performance.now() - t0
}

/**
 * Builds the three forms into a scratch folder.
 * @returns each form's command line, and an empty program of the same form
 */
function build(dir: string): { form: string; run: string[]; empty: string[] }[] {
  const bundle = join(dir, 'statusline.js')
  const exe = join(dir, process.platform === 'win32' ? 'statusline.exe' : 'statusline')
  const empty = join(dir, 'empty.ts')
  const emptyExe = join(dir, process.platform === 'win32' ? 'empty.exe' : 'empty')

  writeFileSync(empty, '\n')
  for (const args of [
    ['build', MAIN, '--target=bun', '--outfile', bundle],
    ['build', MAIN, '--compile', '--outfile', exe],
    ['build', empty, '--compile', '--outfile', emptyExe]
  ]) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' })

    if (r.status !== 0) throw new Error(`bun ${args.join(' ')}: ${r.stderr}`)
  }

  return [
    { form: 'bun run main.ts', run: [process.execPath, 'run', MAIN], empty: [process.execPath, 'run', empty] },
    { form: 'bun statusline.js (installed today)', run: [process.execPath, bundle], empty: [process.execPath, empty] },
    { form: 'compiled .exe', run: [exe], empty: [emptyExe] }
  ]
}

/**
 * Times every form in the given repos.
 * @param repos the folders the status line reports on
 * @returns each form's numbers per repo
 */
export function measureStatusline(repos: readonly string[]): FormTimes[] {
  const dir = mkdtempSync(join(tmpdir(), 'gf-statusline-'))
  const forms = build(dir)
  const out: FormTimes[] = []

  for (const repo of repos) {
    const stdin = JSON.stringify({ workspace: { current_dir: repo }, context_window: { used_percentage: 41 }, model: { display_name: 'Opus' } })
    const git = Array.from({ length: RUNS }, () => time(['git', '-C', repo, '--no-optional-locks', 'status', '--porcelain=v1', '--branch'], '', {}))

    for (const f of forms) {
      const start = Array.from({ length: RUNS }, () => time(f.empty, '', {}))
      // A fresh cache folder per cold run: git's answer is never cached, as at the first draw in a folder.
      const cold = Array.from({ length: RUNS }, (_, i) => {
        const cache = join(dir, 'cold', `${f.form.length}-${i}-${out.length}`)

        mkdirSync(cache, { recursive: true })

        return time(f.run, stdin, { LOCALAPPDATA: cache, XDG_CACHE_HOME: cache, COLUMNS: '200' })
      })
      const warmCache = join(dir, 'warm', String(out.length))

      mkdirSync(warmCache, { recursive: true })
      time(f.run, stdin, { LOCALAPPDATA: warmCache, XDG_CACHE_HOME: warmCache, COLUMNS: '200' })
      const warm = Array.from({ length: RUNS }, () => time(f.run, stdin, { LOCALAPPDATA: warmCache, XDG_CACHE_HOME: warmCache, COLUMNS: '200' }))

      out.push({
        form: f.form,
        repo,
        startP50: p(start, 0.5),
        coldP50: p(cold, 0.5),
        coldP95: p(cold, 0.95),
        warmP50: p(warm, 0.5),
        warmP95: p(warm, 0.95),
        gitP50: p(git, 0.5)
      })
    }
  }

  return out
}

if (import.meta.main) {
  const repos = [REPO, ...process.argv.slice(2)]
  const rows = measureStatusline(repos)

  console.log(`status line, ms (budget ${BUDGETS.statusline.limit} ms per run), ${RUNS} runs each:`)
  for (const r of rows) {
    console.log(
      `${r.form.padEnd(36)} ${r.repo.padEnd(34)} start ${r.startP50.toFixed(0).padStart(4)}  git ${r.gitP50.toFixed(0).padStart(4)}  cold p50 ${r.coldP50.toFixed(0).padStart(4)} p95 ${r.coldP95.toFixed(0).padStart(4)}  warm p50 ${r.warmP50.toFixed(0).padStart(4)} p95 ${r.warmP95.toFixed(0).padStart(4)}`
    )
  }
  console.log(`BENCH ${JSON.stringify({ statusline: rows })}`)
}

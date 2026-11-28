// The Performance check (docs/development/performance.md): main's plugin and this checkout's, measured by this
// checkout's harness, in turns on one machine (main, PR; PR, main; main, PR), then compared by tools/bench/compare.ts.
// Taking turns spreads any drift in the machine's speed over both sides.
//
//   bun tools/bench/check.ts --main <main's checkout> [--runs 3] [--out <folder>] [--accepted] [--live-url <url>]
//
// Exits as compare.ts does: 1 when a measure is red and the pull request is not perf-accepted.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..', '..')
const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const main = argOf('--main')

if (main === undefined) throw new Error('usage: check.ts --main <checkout> [--runs n] [--out folder]')
const runs = Number(argOf('--runs') ?? 3)
const out = resolve(argOf('--out') ?? mkdtempSync(join(tmpdir(), 'gf-check-')))
const started = performance.now()

mkdirSync(out, { recursive: true })
const reports: Record<'main' | 'pr', string[]> = { main: [], pr: [] }

for (let i = 0; i < runs; i++) {
  const order = i % 2 === 0 ? (['main', 'pr'] as const) : (['pr', 'main'] as const)

  for (const side of order) {
    const report = join(out, `${side}-${i + 1}.json`)
    const t = performance.now()
    const r = spawnSync(
      process.execPath,
      [join(import.meta.dirname, 'run.ts'), '--on-only', '--plugin', side === 'main' ? resolve(main) : REPO, '--report', report],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }
    )

    if (r.status !== 0) throw new Error(`run ${i + 1} of ${side} exited ${r.status}:\n${r.stdout}`)
    console.log(`run ${i + 1} ${side}: ${((performance.now() - t) / 1000).toFixed(0)} s`)
    reports[side].push(report)
  }
}

const liveUrl = argOf('--live-url')
// The rating rules and the budgets are main's, so a pull request cannot pass its own reds by changing them; main's
// own copy is used once it has one (this check's first pull request has to rate itself, and says so in the log).
const mainCompare = join(resolve(main), 'tools', 'bench', 'compare.ts')
const rater = existsSync(mainCompare) ? mainCompare : join(import.meta.dirname, 'compare.ts')

if (rater !== mainCompare) console.log("main has no tools/bench/compare.ts yet: rated with this pull request's")
const verdict = spawnSync(
  process.execPath,
  [
    rater,
    '--main',
    reports.main.join(','),
    '--pr',
    reports.pr.join(','),
    '--out',
    join(out, 'comment.md'),
    '--seconds',
    String((performance.now() - started) / 1000),
    ...(args.includes('--accepted') ? ['--accepted'] : []),
    ...(liveUrl === undefined ? [] : ['--live-url', liveUrl])
  ],
  { stdio: 'inherit' }
)

console.log(`reports and comment: ${out}`)
process.exit(verdict.status ?? 1)

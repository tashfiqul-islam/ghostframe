// The Performance check's verdict (docs/development/performance.md, "The Performance check"): main's and the pull
// request's harness reports, several runs each, compared measure by measure by their medians, each measure rated, and
// the pull request comment that says so. Exits 1 when a measure is red and the pull request is not perf-accepted.
//
//   bun tools/bench/compare.ts --main a.json,b.json,c.json --pr d.json,e.json,f.json --out comment.md
//     [--accepted] [--live-url <url>] [--seconds <n>]
//   bun tools/bench/compare.ts --self-test
import { readFileSync, writeFileSync } from 'node:fs'

import { BUDGETS, limitOf, type BudgetName } from './budgets.ts'

/** A measure's rating: green passes, yellow warns, red blocks; accepted is a red the perf-accepted label lets pass. */
export type Rating = 'green' | 'yellow' | 'red' | 'accepted'

/** How much slower than main warns, and how much blocks. */
export const WARN_SLOWER = 0.05
export const BLOCK_SLOWER = 0.15
/** How close to its limit a measure warns. */
export const NEAR_LIMIT = 0.9
/**
 * The noise floor: a change smaller than this share of the measure's limit is never called slower, whatever its
 * percentage. Shared runners jitter by tenths of a millisecond, so a 0.10 ms row draw that reads 0.12 ms is 20% slower
 * and no regression at all.
 */
export const NOISE_SHARE = 0.05
/**
 * A measure's noise floor: its share of the budget as set (BUDGETS), never of a CI runner's 3× limit, which would let a
 * real slowdown of 15% and more through on CI.
 * @param budget the measure's budget
 * @returns the floor, in the budget's unit
 */
export const floorOf = (budget: BudgetName): number => BUDGETS[budget].limit * NOISE_SHARE

/** One measure as a harness report holds it (tools/bench/run.ts writes `checks`). */
type Check = { budget: BudgetName; measure: string; value: number | null; limit: number }

/** One measure compared: its medians on main and on the pull request, the limit, and the rating. */
export type Row = { budget: BudgetName; measure: string; main: number | null; pr: number | null; limit: number; rating: Rating }

/**
 * The median of the values a measure took over the runs; null when fewer than half the runs measured it.
 * @param values one value per run, null where a run did not measure it
 * @returns the median, or null
 */
export function median(values: readonly (number | null)[]): number | null {
  const ok = values.filter((v): v is number => v !== null && Number.isFinite(v)).toSorted((a, b) => a - b)

  if (ok.length === 0 || ok.length * 2 < values.length) return null
  const mid = Math.floor(ok.length / 2)

  return ok.length % 2 === 1 ? (ok[mid] ?? null) : ((ok[mid - 1] ?? 0) + (ok[mid] ?? 0)) / 2
}

/**
 * Rates one measure. Red: over its limit, more than 15% slower than main, or no longer measured. Yellow: 5 to 15%
 * slower than main, within 10% of its limit, or measured on neither side. Green otherwise. A slowdown under the noise
 * floor is no slowdown.
 * @param main main's median, null when main did not measure it (a new measure)
 * @param pr the pull request's median, null when it did not measure it
 * @param limit the measure's limit on this runner
 * @param isAccepted whether the pull request has the perf-accepted label
 * @param floor the noise floor: a slowdown no larger is none
 * @returns the rating
 */
export function rate(main: number | null, pr: number | null, limit: number, isAccepted: boolean, floor: number): Rating {
  const red = (): Rating => (isAccepted ? 'accepted' : 'red')

  if (pr === null) return main === null ? 'yellow' : red()
  if (pr > limit) return red()

  const slower = main !== null && pr - main > floor ? (pr - main) / Math.max(main, Number.EPSILON) : 0

  if (slower > BLOCK_SLOWER) return red()
  if (slower > WARN_SLOWER || pr > limit * NEAR_LIMIT) return 'yellow'

  return 'green'
}

const ORDER: Readonly<Record<Rating, number>> = { red: 0, accepted: 1, yellow: 2, green: 3 }

/**
 * Compares the runs: every measure either side measured, by its medians, reds first.
 * @param mainRuns main's reports, one per run
 * @param prRuns the pull request's reports, one per run
 * @param isAccepted whether the pull request has the perf-accepted label
 * @param isCi whether this runs on a CI runner (its time limits get CI_HEADROOM)
 * @returns one row per measure
 */
export function compare(mainRuns: readonly (readonly Check[])[], prRuns: readonly (readonly Check[])[], isAccepted: boolean, isCi: boolean): Row[] {
  const byMeasure = new Map<string, Check>()

  for (const c of [...prRuns.flat(), ...mainRuns.flat()]) if (!byMeasure.has(c.measure)) byMeasure.set(c.measure, c)
  const valuesOf = (runs: readonly (readonly Check[])[], measure: string): (number | null)[] =>
    runs.map(run => run.find(c => c.measure === measure)?.value ?? null)

  return [...byMeasure.values()]
    .map(c => {
      const main = median(valuesOf(mainRuns, c.measure))
      const pr = median(valuesOf(prRuns, c.measure))
      // The limit is this file's budgets', not what the report says: run from main's checkout, a pull request cannot
      // loosen its own limits. A budget main does not know yet (new in the pull request) keeps the report's.
      const known = Object.hasOwn(BUDGETS, c.budget)
      const limit = known ? limitOf(c.budget, isCi) : c.limit

      return {
        budget: c.budget,
        measure: c.measure,
        main,
        pr,
        limit,
        rating: rate(main, pr, limit, isAccepted, known ? floorOf(c.budget) : limit * NOISE_SHARE)
      }
    })
    .toSorted((a, b) => ORDER[a.rating] - ORDER[b.rating] || a.measure.localeCompare(b.measure))
}

/** The hidden line the comment job finds the sticky comment by. */
export const MARKER = '<!-- ghostframe-performance -->'

const fmt = (n: number | null): string => (n === null ? 'n/a' : n >= 100 ? n.toFixed(0) : n.toFixed(2))
const change = (r: Row): string => {
  if (r.main === null || r.pr === null) return 'n/a'
  const pct = ((r.pr - r.main) / Math.max(r.main, Number.EPSILON)) * 100

  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}
const MARK: Readonly<Record<Rating, string>> = { red: '🔴 red', accepted: '🟠 accepted', yellow: '🟡 yellow', green: '🟢 green' }

/**
 * The summary line: how many measures got each rating, reds first.
 * @param rows the compared measures
 * @returns e.g. "2 red, 1 yellow, 14 green"
 */
export function summaryOf(rows: readonly Row[]): string {
  const n = (r: Rating): number => rows.filter(x => x.rating === r).length

  return (['red', 'accepted', 'yellow', 'green'] as const)
    .filter(r => n(r) > 0 || r === 'green')
    .map(r => `${n(r)} ${r}`)
    .join(', ')
}

/**
 * The pull request comment: the table, the summary and how it was measured.
 * @param rows the compared measures
 * @param meta the run count, the runner's time and where the latest live benchmark on main is
 * @returns the comment's Markdown
 */
export function commentOf(rows: readonly Row[], meta: { runs: number; seconds?: number; liveUrl?: string }): string {
  const units = (r: Row): string => BUDGETS[r.budget].unit

  return [
    MARKER,
    '## Performance',
    '',
    `**${summaryOf(rows)}**`,
    '',
    '| Rating | Measure | main | PR | Change | Limit |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...rows.map(r => `| ${MARK[r.rating]} | ${r.measure} | ${fmt(r.main)} | ${fmt(r.pr)} | ${change(r)} | ${fmt(r.limit)} ${units(r)} |`),
    '',
    `Harness benchmarks, main and this pull request in one job on one runner, ${meta.runs} runs each, compared by median.` +
      ` Red blocks: over the limit, or more than ${BLOCK_SLOWER * 100}% slower than main.` +
      ` Yellow warns: ${WARN_SLOWER * 100} to ${BLOCK_SLOWER * 100}% slower, or within ${Math.round((1 - NEAR_LIMIT) * 100)}% of the limit.` +
      ` A change under ${NOISE_SHARE * 100}% of a measure's budget is noise.` +
      (meta.seconds === undefined ? '' : ` The check took ${Math.round(meta.seconds)} s.`),
    meta.liveUrl === undefined ? '' : `The live benchmark runs on main only, nightly and on each push, and never blocks: [its latest run](${meta.liveUrl}).`,
    'A maintainer can add the `perf-accepted` label to let a red pass (docs/development/performance.md).'
  ].join('\n')
}

function selfTest(): void {
  const eq = (a: unknown, b: unknown, what: string): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`)
  }

  eq(median([3, 1, 2]), 2, 'median of three')
  eq(median([4, null, 2]), 3, 'median with a run missing')
  eq(median([null, null, 2]), null, 'median of too few runs')
  eq(rate(10, 10.4, 15, false, 0.25), 'green', 'within 5%')
  eq(rate(10, 11, 15, false, 0.25), 'yellow', '10% slower')
  eq(rate(10, 12, 15, false, 0.25), 'red', '20% slower')
  eq(rate(10, 12, 15, true, 0.25), 'accepted', 'a red with perf-accepted')
  eq(rate(10, 14, 15, false, 0.25), 'red', 'within the limit but 40% slower')
  eq(rate(14, 14, 15, false, 0.25), 'yellow', 'within 10% of the limit')
  eq(rate(10, 16, 15, false, 0.25), 'red', 'over the limit')
  eq(rate(16, 16, 15, false, 0.25), 'red', 'over the limit, unchanged from main')
  eq(rate(0.1, 0.12, 1.5, false, 0.025), 'green', '20% slower, but under the noise floor')
  eq(rate(0.1, 0.13, 1.5, false, 0.025), 'red', '30% slower, over the noise floor')
  eq(floorOf('pane'), 0.4, "the floor is the budget's, never CI's 3x limit")
  eq(rate(1, null, 1.5, false, 0.25), 'red', 'no longer measured')
  eq(rate(null, 1, 1.5, false, 0.25), 'green', 'a new measure, within its limit')
  eq(rate(null, null, 1.5, false, 0.25), 'yellow', 'measured on neither side')
  eq(rate(10, 8, 15, false, 0.25), 'green', 'faster')

  const run = (v: number, w: number): Check[] => [
    { budget: 'pane', measure: 'pane', value: v, limit: 24 },
    { budget: 'keystroke', measure: 'keys', value: w, limit: 6 }
  ]
  const rows = compare([run(4, 1), run(4, 1), run(4.4, 1)], [run(5.2, 1), run(5.2, 1), run(4.8, 1)], false, false)

  eq(
    rows.map(r => [r.measure, r.main, r.pr, r.rating]),
    [
      ['pane', 4, 5.2, 'red'],
      ['keys', 1, 1, 'green']
    ],
    'compare: reds first, medians'
  )
  eq(summaryOf(rows), '1 red, 1 green', 'summary')
  eq(summaryOf(compare([run(4, 1)], [run(4, 1)], false, false)), '2 green', 'summary, all green')
  eq(compare([run(4, 1)], [run(4, 1)], false, true).find(r => r.measure === 'pane')?.limit, 24, 'on CI, the time budgets get CI_HEADROOM')
  // A report claiming a looser limit is rated by this file's budgets all the same.
  eq(
    compare([run(4, 1)], [[{ budget: 'pane', measure: 'pane', value: 20, limit: 99 }, ...run(4, 1).slice(1)]], false, false).find(r => r.measure === 'pane')
      ?.rating,
    'red',
    "the report's limit is not trusted"
  )
  const comment = commentOf(rows, { runs: 3, seconds: 400, liveUrl: 'https://example.invalid/run' })

  if (!comment.startsWith(MARKER) || !comment.includes('| 🔴 red | pane | 4.00 | 5.20 | +30.0% | 8.00 ms |')) throw new Error(`comment:\n${comment}`)
  console.log('compare.ts self-test: ok')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const argOf = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)

  if (args.includes('--self-test')) {
    selfTest()
    process.exit(0)
  }
  const reports = (list: string | undefined): Check[][] =>
    (list ?? '')
      .split(',')
      .filter(Boolean)
      .map(f => (JSON.parse(readFileSync(f, 'utf8')) as { checks: Check[] }).checks)
  const mainRuns = reports(argOf('--main'))
  const prRuns = reports(argOf('--pr'))
  const out = argOf('--out')

  if (mainRuns.length === 0 || prRuns.length === 0 || out === undefined) throw new Error('usage: compare.ts --main <json,…> --pr <json,…> --out <file>')
  const rows = compare(mainRuns, prRuns, args.includes('--accepted'), process.env['CI'] === 'true')
  const seconds = argOf('--seconds')
  const liveUrl = argOf('--live-url')
  const comment = commentOf(rows, {
    runs: Math.min(mainRuns.length, prRuns.length),
    ...(seconds === undefined ? {} : { seconds: Number(seconds) }),
    ...(liveUrl === undefined ? {} : { liveUrl })
  })

  writeFileSync(out, comment)
  console.log(comment)
  process.exit(rows.some(r => r.rating === 'red') ? 1 : 0)
}

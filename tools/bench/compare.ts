// The Performance check's verdict (docs/development/performance.md, "The Performance check"): main's and the pull
// request's harness reports, several runs each, compared measure by measure (one taken from samples by every run's
// samples, pooled: its mean at a seeded two-level bootstrap's 99% interval; any other by its median), each measure
// rated, and the pull request comment that says so. Exits 1 when a measure is red and the pull request is not perf-accepted.
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

/**
 * One measure as a harness report holds it (tools/bench/run.ts writes `checks`). A measure taken from samples keeps
 * them, and the quantile its value is (0.95 when not given).
 */
export type Check = { budget: BudgetName; measure: string; value: number | null; limit: number; samples?: readonly number[]; quantile?: number }

/**
 * One measure compared: main's and the pull request's value (the pooled p95 where both kept samples, else the median
 * of the runs' values), the limit, the rating, and where samples were kept, the mean's PR/main ratio with its 99%
 * interval: what, with the p50, a slowdown is rated by.
 */
export type Row = {
  budget: BudgetName
  measure: string
  main: number | null
  pr: number | null
  limit: number
  rating: Rating
  mean?: { ratio: number; interval: [number, number] }
}

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
 * Rates one measure. Red: over its limit where main is not, more than 15% slower than main, or no longer measured.
 * Yellow: over its limit as main is too (the runner's or main's, not the pull request's), 5 to 15% slower than main,
 * within 10% of its limit, or measured on neither side. Green otherwise. A slowdown under the noise floor is no
 * slowdown.
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
  const slower = main !== null && pr - main > floor ? (pr - main) / Math.max(main, Number.EPSILON) : 0

  if (pr > limit && !(main !== null && main > limit)) return red()
  if (slower > BLOCK_SLOWER) return red()
  if (pr > limit) return 'yellow'
  if (slower > WARN_SLOWER || pr > limit * NEAR_LIMIT) return 'yellow'

  return 'green'
}

/**
 * A sampled measure's statistics over its pooled samples: the mean, what a slowdown is rated by, and the measure's own
 * quantile (its p95, or the status line's p50), which is shown and held to the limit but never compared with main.
 * The mean is the cost a person pays over many calls, and it moves smoothly as a tail grows: a call in 20 that takes
 * 30 ms more moves it by half. A tail quantile does not: with about 5% of samples slow (a GC pause's), a p95 lands on
 * either side of the gap from one runner to the next, and identical code read +62% on one runner and +6% on the next.
 * Nor does the median: a row cache that makes every redraw one round trip moves the median up while it takes the
 * tail, and the mean, down by two thirds.
 * @param sorted the samples, ascending
 * @param q the measure's own quantile
 * @returns the mean, then the quantile
 */
const statsOf = (sorted: Float64Array, q: number): [number, number] => [sorted.reduce((a, b) => a + b, 0) / Math.max(sorted.length, 1), quantile(sorted, q)]
/** Where the mean and the measure's own quantile sit in what statsOf returns. */
const MEAN = 0
const SHOWN = 1
/**
 * How sure a rating must be: the share of the bootstrap's ratios left out at each end of the interval. 0.005 a side is
 * a 99% interval, tested on its slow side only: even counting any slowdown at all, noise alone puts the near end of
 * one of the two statistics' intervals past main under 1 time in 100, and a red needs it 15% past.
 */
export const TAIL = 0.005
/** Bootstrap resamples per measure: at TAIL, 20 of them fall past each end of the interval. */
export const RESAMPLES = 4000

/**
 * A quantile by linear interpolation between order statistics (Hyndman and Fan's type 7, the default of R and NumPy):
 * it moves smoothly as samples change, where the nearest rank jumps from one sample to the next.
 * @param sorted the samples, ascending
 * @param q the quantile, 0 to 1
 * @returns the quantile, NaN for no samples
 */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length

  if (n === 0) return Number.NaN
  const h = (n - 1) * q
  const lo = Math.floor(h)
  const a = sorted[lo] ?? Number.NaN

  return lo + 1 < n ? a + (h - lo) * ((sorted[lo + 1] ?? a) - a) : a
}

/**
 * A seeded generator (mulberry32): the same reports always give the same verdict, so a rerun of the comparison can
 * never turn a red green by the luck of the draw.
 * @param seed any 32-bit integer
 * @returns a function that gives the next number in [0, 1)
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A string's FNV-1a hash: each measure's own seed. */
const hashOf = (s: string): number => {
  let h = 0x811c9dc5

  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)

  return h >>> 0
}

/**
 * One side of a two-level bootstrap draw (Kalibera and Jones): the picked runs, then the samples of each, picked
 * with replacement and pooled.
 * @param runs each run's samples
 * @param picks the runs drawn, by index
 * @param random the generator
 * @param q the measure's own quantile
 * @returns the draw's statsOf
 */
function draw(runs: readonly Float64Array[], picks: readonly number[], random: () => number, q: number): [number, number] {
  const picked = picks.map(k => runs[k] ?? new Float64Array())
  const pool = new Float64Array(picked.reduce((n, r) => n + r.length, 0))
  let at = 0

  for (const run of picked) for (let i = 0; i < run.length; i++) pool[at++] = run[Math.floor(random() * run.length)] ?? 0
  pool.sort()

  return statsOf(pool, q)
}

/** A measure's samples compared: each side's pooled statsOf, and the 99% interval of each one's PR/main ratio. */
export type Spread = { main: [number, number]; pr: [number, number]; ratios: [number, number][] }

/**
 * Compares two sides' samples: their pooled statsOf, and how far the pull request's could be from main's.
 * @param mainRuns main's samples, one list per run
 * @param prRuns the pull request's samples, one list per run
 * @param seed the generator's seed
 * @param q the measure's own quantile, its p95 when not given
 * @returns the pooled statsOf and the intervals of the ratios
 */
export function spreadOf(mainRuns: readonly (readonly number[])[], prRuns: readonly (readonly number[])[], seed: number, q = 0.95): Spread {
  const pooled = (runs: readonly (readonly number[])[]): [number, number] => statsOf(Float64Array.from(runs.flat()).toSorted(), q)
  const main = mainRuns.map(r => Float64Array.from(r))
  const pr = prRuns.map(r => Float64Array.from(r))
  const random = seeded(seed)
  const ratios = [new Float64Array(RESAMPLES), new Float64Array(RESAMPLES)]
  // The runs are picked with replacement first, so a whole run that went slow (a busy neighbour on the runner) widens
  // the interval instead of passing for a regression. check.ts runs main's run i and the pull request's back to back,
  // so where both sides have as many runs, the same i is drawn for both: what slowed the runner then slowed both.
  const isPaired = main.length === pr.length
  const picksOf = (n: number): number[] => Array.from({ length: n }, () => Math.floor(random() * n))

  for (let b = 0; b < RESAMPLES; b++) {
    const mainPicks = picksOf(main.length)
    const m = draw(main, mainPicks, random, q)
    const p = draw(pr, isPaired ? mainPicks : picksOf(pr.length), random, q)

    ratios.forEach((r, i) => (r[b] = (p[i] ?? 0) / Math.max(m[i] ?? 0, Number.EPSILON)))
  }

  return {
    main: pooled(mainRuns),
    pr: pooled(prRuns),
    ratios: ratios.map((r): [number, number] => {
      r.sort()

      return [quantile(r, TAIL), quantile(r, 1 - TAIL)]
    })
  }
}

/**
 * Rates a measure whose samples both sides kept. Red: its mean slower than main by more than the noise floor and by
 * more than 15% even at the near end of its 99% interval; or its pooled quantile over its limit with the mean slower
 * than main there by more than 5%. Yellow: the mean slower by more than 5% there; the quantile over its limit with no
 * slowdown the interval can tell from noise (on a slow runner main is over it too: the runner's, not the pull
 * request's); or the quantile within 10% of the limit. Green otherwise: a change the interval cannot tell from noise
 * warns nobody.
 * @param s the compared samples
 * @param limit the measure's limit on this runner
 * @param isAccepted whether the pull request has the perf-accepted label
 * @param floor the noise floor: a slowdown no larger is none
 * @returns the rating
 */
export function rateSpread(s: Spread, limit: number, isAccepted: boolean, floor: number): Rating {
  const red = (): Rating => (isAccepted ? 'accepted' : 'red')
  const over = s.pr[MEAN] - s.main[MEAN]
  const near = s.ratios[MEAN]?.[0] ?? 0
  const shown = s.pr[SHOWN]
  const isSlower = (by: number): boolean => over > floor && near > 1 + by

  if (isSlower(BLOCK_SLOWER) || (shown > limit && isSlower(WARN_SLOWER))) return red()
  if (isSlower(WARN_SLOWER) || shown > limit * NEAR_LIMIT) return 'yellow'

  return 'green'
}

const ORDER: Readonly<Record<Rating, number>> = { red: 0, accepted: 1, yellow: 2, green: 3 }

/**
 * Compares the runs: every measure either side measured, by its samples where both sides kept them, else by its
 * medians; reds first.
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
  // Every run's samples, or none: a run that kept none (an older harness) leaves the measure to the medians.
  const samplesOf = (runs: readonly (readonly Check[])[], measure: string): (readonly number[])[] | undefined => {
    const all = runs.map(run => run.find(c => c.measure === measure)?.samples)

    return all.every(s => s !== undefined && s.length > 0) ? (all as (readonly number[])[]) : undefined
  }

  return [...byMeasure.values()]
    .map((c): Row => {
      // The limit is this file's budgets', not what the report says: run from main's checkout, a pull request cannot
      // loosen its own limits. A budget main does not know yet (new in the pull request) keeps the report's.
      const known = Object.hasOwn(BUDGETS, c.budget)
      const limit = known ? limitOf(c.budget, isCi) : c.limit
      const floor = known ? floorOf(c.budget) : limit * NOISE_SHARE
      const mainSamples = samplesOf(mainRuns, c.measure)
      const prSamples = samplesOf(prRuns, c.measure)

      if (mainSamples !== undefined && prSamples !== undefined) {
        const s = spreadOf(mainSamples, prSamples, hashOf(c.measure), c.quantile ?? 0.95)

        return {
          budget: c.budget,
          measure: c.measure,
          main: s.main[SHOWN],
          pr: s.pr[SHOWN],
          limit,
          rating: rateSpread(s, limit, isAccepted, floor),
          mean: { ratio: s.pr[MEAN] / Math.max(s.main[MEAN], Number.EPSILON), interval: s.ratios[MEAN] ?? [Number.NaN, Number.NaN] }
        }
      }
      const main = median(valuesOf(mainRuns, c.measure))
      const pr = median(valuesOf(prRuns, c.measure))

      return { budget: c.budget, measure: c.measure, main, pr, limit, rating: rate(main, pr, limit, isAccepted, floor) }
    })
    .toSorted((a, b) => ORDER[a.rating] - ORDER[b.rating] || a.measure.localeCompare(b.measure))
}

/** The hidden line the comment job finds the sticky comment by. */
export const MARKER = '<!-- ghostframe-performance -->'

const fmt = (n: number | null): string => (n === null ? 'n/a' : n >= 100 ? n.toFixed(0) : n.toFixed(2))
const change = (r: Row): string => {
  if (r.main === null || r.pr === null) return 'n/a'
  const pct = ((r.pr - r.main) / Math.max(r.main, Number.EPSILON)) * 100

  const signed = (p: number): string => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`

  if (r.mean === undefined) return signed(pct)
  const [low, high] = r.mean.interval.map(x => signed((x - 1) * 100))

  return `${signed(pct)}; mean ${signed((r.mean.ratio - 1) * 100)} (${low} to ${high})`
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
    `Harness benchmarks, main and this pull request in one job on one runner, ${meta.runs} runs each.` +
      " A measure taken from samples pools every run's: its p95 (or p50) is held to its limit, and a slowdown is rated by the" +
      ' pooled mean, at the near end of the 99% interval of its ratio to main from a two-level bootstrap (runs, then samples)' +
      ' seeded by the measure, so the same reports always rate the same. Other measures take the median of the runs.' +
      ` Red blocks: over the limit, or more than ${BLOCK_SLOWER * 100}% slower than main (for a sampled measure, by its mean, even at the near end of its interval).` +
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
  eq(rate(16, 16, 15, false, 0.25), 'yellow', 'over the limit as main is: the runner, not the pull request')
  eq(rate(14, 16, 15, false, 0.25), 'red', 'over the limit where main is not')
  eq(rate(16, 20, 15, false, 0.25), 'red', 'over the limit as main is, and 25% slower')
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
  eq(quantile([1, 2, 3, 4], 0.5), 2.5, 'quantile between two samples')
  eq(quantile([1, 2, 3, 4], 1), 4, 'quantile at the top')
  eq(Number.isNaN(quantile([], 0.5)), true, 'quantile of nothing')

  // Runs of 40 samples near 2.7 ms with a tail of slow ones at 5.5 ms, as a GC pause leaves: the shape whose
  // nearest-rank p95 flipped between 3.2 and 5.7 ms on identical code.
  const random = seeded(7)
  const runOf = (slow: number, scale = 1, n = 40): number[] => Array.from({ length: n }, (_, i) => (i < slow ? 5.5 : 2.5 + random() * 0.4) * scale)
  const flaky = spreadOf([runOf(1), runOf(2), runOf(1)], [runOf(3), runOf(3), runOf(2)], 1)

  eq(rateSpread(flaky, 15, false, 0.25), 'green', 'a tail that moves between runs of the same code warns nobody')
  eq(
    rate(
      median(
        [runOf(1), runOf(2), runOf(1)].map(r =>
          quantile(
            r.toSorted((a, b) => a - b),
            0.95
          )
        )
      ),
      5.5,
      15,
      false,
      0.25
    ),
    'red',
    'the same tail, rated by the median of nearest-rank p95s, went red'
  )
  eq(JSON.stringify(spreadOf([[1, 2, 3]], [[2, 3, 4]], 9)), JSON.stringify(spreadOf([[1, 2, 3]], [[2, 3, 4]], 9)), 'the same samples rate the same')
  const same = [runOf(2), runOf(2), runOf(2)]

  eq(rateSpread(spreadOf(same, [runOf(2), runOf(2), runOf(2)], 2), 15, false, 0.25), 'green', 'the same code is green')
  eq(rateSpread(spreadOf(same, [runOf(2, 1.4), runOf(2, 1.4), runOf(2, 1.4)], 3), 15, false, 0.25), 'red', 'every sample 40% slower is red')
  eq(rateSpread(spreadOf(same, [runOf(2, 1.4), runOf(2, 1.4), runOf(2, 1.4)], 3), 15, true, 0.25), 'accepted', 'and perf-accepted lets it pass')
  eq(rateSpread(spreadOf(same, [runOf(2, 1.3), runOf(2), runOf(2)], 4), 15, false, 0.25), 'green', 'one run 30% slower is a slow runner, not a slowdown')
  eq(rateSpread(spreadOf(same, [runOf(2, 6), runOf(2, 6), runOf(2, 6)], 5), 15, false, 0.25), 'red', 'over the limit and slower is red')
  // A slow runner: both sides twice as slow as usual, over the limit alike. The pull request did not do that.
  const slow = [runOf(2, 2), runOf(2, 2), runOf(2, 2)]

  eq(rateSpread(spreadOf(slow, [runOf(2, 2), runOf(2, 2), runOf(2, 2)], 9), 5, false, 0.25), 'yellow', 'over the limit as main is, unchanged: yellow')
  eq(rateSpread(spreadOf(slow, [runOf(2, 2.4), runOf(2, 2.4), runOf(2, 2.4)], 9), 5, false, 0.25), 'red', 'over the limit and 20% slower: red')
  eq(
    rateSpread(spreadOf(same, [runOf(20), runOf(20), runOf(20)], 6), 15, false, 0.25),
    'red',
    'a tail that grew in every run (half the samples slow, not 2 of 40) is red, though the p50 holds'
  )
  eq(
    rateSpread(spreadOf(same, [runOf(12), runOf(12), runOf(12)], 6), 15, false, 0.25),
    'yellow',
    'a tail that grew to 12 of 40: slower for sure, but not surely 15% slower with 120 samples a side'
  )
  // A row cache: every redraw one round trip (0.45 ms, not 0.3), and no more 5 ms misses.
  const missing = (): number[] => Array.from({ length: 40 }, (_, i) => (i < 4 ? 5 : 0.28 + random() * 0.04))
  const hitting = (): number[] => Array.from({ length: 40 }, () => 0.43 + random() * 0.04)
  const cached = spreadOf([missing(), missing(), missing()], [hitting(), hitting(), hitting()], 8)

  eq(rateSpread(cached, 1.5, false, 0.025), 'green', 'a median that rose while the tail and the mean fell is no slowdown')
  eq(spreadOf([[1, 2, 3, 4]], [[1, 2, 3, 4]], 1, 0.5).main[1], 2.5, "a measure's own quantile is the one shown")
  const sampled = (v: number, xs: number[]): Check[] => [{ budget: 'pane', measure: 'pane', value: v, limit: 24, samples: xs }]
  const pooledRow = compare(
    [sampled(9, same[0] ?? []), sampled(9, same[1] ?? []), sampled(9, same[2] ?? [])],
    [sampled(1, same[0] ?? []), sampled(1, same[1] ?? []), sampled(1, same[2] ?? [])],
    false,
    false
  )[0]

  eq(
    [pooledRow?.rating, pooledRow?.main === pooledRow?.pr, pooledRow?.mean !== undefined],
    ['green', true, true],
    'compare: samples on both sides are pooled, the values ignored'
  )
  eq(
    compare([sampled(4, same[0] ?? [])], [run(4, 1)], false, false).find(r => r.measure === 'pane')?.mean,
    undefined,
    'compare: a side without samples falls back to the medians'
  )
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

// The budget drift guard (docs/development/performance.md, "How budgets are guarded"): the Performance check blocks a
// pull request over a budget only when it is also slower than main, so slowdowns too small to block can add up until
// main itself is over. This holds main's own runs to the budgets, measured and pooled as the Performance check does
// (compare.ts, main against itself), and keeps one issue open while any measure is over in this run and the one
// before: opened, then updated in place, then closed once main is back within every budget. A measure over in one run
// alone waits for the next, as a slow shared runner puts main over a budget in all three of its runs at once. It never
// blocks anything.
//
//   bun tools/bench/drift.ts --reports a.json,b.json,c.json --issues open.json --run-url <url> --out <folder>
//     [--previous over.json]
//     open.json: `gh api --paginate --slurp repos/<repo>/issues?state=open`; over.json: the run before's. Writes
//     action.json, body.md and this run's over.json for .github/workflows/benchmarks.yml's drift job to apply and keep
//   bun tools/bench/drift.ts --self-test
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { BUDGETS } from './budgets.ts'
import { compare, type Check } from './compare.ts'

/** The hidden line the guard finds its own issue by. */
export const MARKER = '<!-- ghostframe-budget-drift -->'
export const TITLE = 'Performance: main is over a budget'
const BOT = 'github-actions[bot]'

/** A measure main is over its budget on: main's value (pooled over its runs) and the limit. */
export type Over = { budget: Check['budget']; measure: string; main: number; limit: number }

/** An open issue as the REST API lists it; a pull request is listed as one too, with `pull_request` set. */
export type OpenIssue = { number: number; body?: string | null; user?: { login?: string } | null; pull_request?: unknown }

/** What to do with the issue. */
export type Action = { kind: 'none' } | { kind: 'create'; title: string; body: string } | { kind: 'update' | 'close'; number: number; body: string }

/**
 * The measures main is over its budget on, across its runs.
 * @param runs main's reports' checks, one per run
 * @param isCi whether the runs were on a CI runner (time limits get CI_HEADROOM)
 * @returns every measure over, most over (by share of its limit) first
 */
export function overOf(runs: readonly (readonly Check[])[], isCi: boolean): Over[] {
  return compare(runs, runs, false, isCi)
    .flatMap(r => (r.main !== null && r.main > r.limit ? [{ budget: r.budget, measure: r.measure, main: r.main, limit: r.limit }] : []))
    .toSorted((a, b) => b.main / b.limit - a.main / a.limit)
}

const fmt = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(2))

/**
 * The issue's body.
 * @param over the measures over budget
 * @param meta the run that measured them, and how many runs it pooled
 * @param meta.runUrl the workflow run's link
 * @param meta.runs how many runs of main were pooled
 * @returns the body, marker first
 */
export function bodyOf(over: readonly Over[], meta: { runUrl: string; runs: number }): string {
  return [
    MARKER,
    `## ${TITLE}`,
    '',
    `Main's own runs (${meta.runs}, pooled as the Performance check pools them) are over these budgets ([the run](${meta.runUrl})).`,
    'No pull request is blocked for it: each was within 5% of main when it merged, so the slowdown came in small steps.',
    'Find them with the Performance comments, or bisect with `bun tools/bench/check.ts`; this issue closes itself once main is back within every budget.',
    '',
    '| budget | measure | main | limit | over by |',
    '| --- | --- | ---: | ---: | ---: |',
    ...over.map(
      o => `| ${o.budget} | ${o.measure} | ${fmt(o.main)} | ${fmt(o.limit)} ${BUDGETS[o.budget].unit} | +${((o.main / o.limit - 1) * 100).toFixed(0)}% |`
    )
  ].join('\n')
}

/**
 * What to do: open the issue, update the open one, close it, or nothing. A measure is named once it is over in this
 * run and was in the run before; the issue closes once none is over in this run. Only an issue this guard opened
 * counts (the bot's, with the marker); the oldest one if somehow there are several, so there is never a second.
 * @param now the measures over budget in this run
 * @param before the measures the run before found over, none when there was no run before
 * @param open the open issues, as listed (pages flattened or not)
 * @param meta the run that measured them, and how many runs it pooled
 * @param meta.runUrl the workflow run's link
 * @param meta.runs how many runs of main were pooled
 * @returns the action
 */
export function actionOf(
  now: readonly Over[],
  before: readonly string[],
  open: readonly (OpenIssue | readonly OpenIssue[])[],
  meta: { runUrl: string; runs: number }
): Action {
  const over = now.filter(o => before.includes(o.measure))
  const mine = open
    .flat()
    .filter(i => i.pull_request === undefined && i.user?.login === BOT && (i.body ?? '').startsWith(MARKER))
    .toSorted((a, b) => a.number - b.number)[0]

  if (over.length > 0) {
    const body = bodyOf(over, meta)

    return mine === undefined ? { kind: 'create', title: TITLE, body } : { kind: 'update', number: mine.number, body }
  }

  return mine === undefined || now.length > 0
    ? { kind: 'none' }
    : { kind: 'close', number: mine.number, body: `Main is back within every budget ([the run](${meta.runUrl})).` }
}

function selfTest(): void {
  const eq = (a: unknown, b: unknown, what: string): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`)
  }
  const meta = { runUrl: 'https://example.invalid/run/1', runs: 3 }
  // A sample report, as tools/bench/run.ts --on-only writes `checks` on CI: a pane draw over its 24 ms CI limit in
  // every run, an unchanged row within its 1.5 ms one, and a status line run (p50, no samples kept here) over 150 ms.
  const report = (pane: number, row: number, status: number): Check[] => [
    { budget: 'pane', measure: 'on-120x40 pane', value: pane, limit: 24, samples: [pane - 1, pane, pane + 1] },
    { budget: 'unchangedRow', measure: 'on-120x40 unchanged row', value: row, limit: 1.5, samples: [row, row, row] },
    { budget: 'statusline', measure: 'status line warm p50', value: status, limit: 150, quantile: 0.5 }
  ]
  const runs = [report(26, 1, 160), report(27, 1.1, 170), report(25, 0.9, 140)]
  const over = overOf(runs, true)

  eq(
    over.map(o => o.measure),
    ['on-120x40 pane', 'status line warm p50'],
    'over: the pane (pooled p95) and the status line (median of runs), most over first'
  )
  eq(overOf([report(20, 1, 100)], true), [], 'over: nothing when main is within every budget')
  eq(overOf([report(20, 1, 100), report(20, 1, 100), report(30, 1, 100)], true).length, 1, 'over: one slow run pools into the p95')

  const mine = { number: 7, body: `${MARKER}\nold`, user: { login: BOT } }
  const pr = { number: 3, body: `${MARKER}\nold`, user: { login: BOT }, pull_request: {} }
  const someone = { number: 5, body: `${MARKER}\nquoted`, user: { login: 'someone' } }
  const other = { number: 4, body: 'unrelated', user: { login: BOT } }

  const both = over.map(o => o.measure)
  const pane = over.slice(0, 1)

  eq(actionOf(over, both, [[other, someone, pr]], meta).kind, 'create', 'action: create when only others, a pull request or a quote carry the marker')
  eq(actionOf(over, [], [[other]], meta), { kind: 'none' }, 'action: over in this run alone (a slow runner) waits for the next')
  eq(actionOf(over, ['on-120x40 pane'], [], meta), { kind: 'create', title: TITLE, body: bodyOf(pane, meta) }, 'action: names only what both runs found over')
  eq(actionOf(over, both, [[other], [mine]], meta), { kind: 'update', number: 7, body: bodyOf(over, meta) }, 'action: update the open one, over pages')
  eq(
    actionOf(over, both, [[{ ...mine, number: 9 }, mine]], meta),
    { kind: 'update', number: 7, body: bodyOf(over, meta) },
    'action: the oldest, never a second'
  )
  eq(actionOf(over, [], [[mine]], meta), { kind: 'none' }, 'action: still over, not yet twice: the open issue stays as it is')
  eq(actionOf([], both, [[mine]], meta).kind, 'close', 'action: close once back within every budget')
  eq(actionOf([], [], [[other]], meta), { kind: 'none' }, 'action: nothing to do')

  const body = bodyOf(over, meta)

  eq(body.startsWith(MARKER), true, 'body: marker first')
  eq(body.includes('| pane | on-120x40 pane | 27.60 | 24.00 ms | +15% |'), true, "body: main's pooled p95, the limit and how far over")
  console.log('drift.ts self-test: ok')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const argOf = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)

  if (args.includes('--self-test')) {
    selfTest()
    process.exit(0)
  }
  const reports = (argOf('--reports') ?? '').split(',').filter(Boolean)
  const issues = argOf('--issues')
  const runUrl = argOf('--run-url')
  const out = argOf('--out')
  const previous = argOf('--previous')

  if (reports.length === 0 || issues === undefined || runUrl === undefined || out === undefined) {
    throw new Error('usage: drift.ts --reports <json,…> --issues <open.json> --run-url <url> --out <folder>')
  }
  const runs = reports.map(f => (JSON.parse(readFileSync(f, 'utf8')) as { checks: Check[] }).checks)
  const over = overOf(runs, process.env['CI'] === 'true')
  const before = previous === undefined ? [] : (JSON.parse(readFileSync(previous, 'utf8')) as string[])
  const action = actionOf(over, before, JSON.parse(readFileSync(issues, 'utf8')) as OpenIssue[][], { runUrl, runs: runs.length })

  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'over.json'), JSON.stringify(over.map(o => o.measure)))
  writeFileSync(
    join(out, 'action.json'),
    JSON.stringify({ kind: action.kind, ...('number' in action ? { number: action.number } : {}), ...('title' in action ? { title: action.title } : {}) })
  )
  writeFileSync(join(out, 'body.md'), 'body' in action ? action.body : '')
  console.log(`${over.length} measure(s) over budget on main: ${action.kind}${'number' in action ? ` #${action.number}` : ''}`)
  for (const o of over) console.log(`  ${o.measure}: ${fmt(o.main)} over ${fmt(o.limit)}`)
}

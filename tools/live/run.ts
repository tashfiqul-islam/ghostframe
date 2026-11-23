// Runs the live checks: `bun run.ts` for all of them, or `bun run.ts 2 7` for the suites holding those steps. Each
// suite gets a fresh copy of the throwaway repo (repo.ts) and a fresh session; `--keep-repo` keeps the repo as it is.
// Results go to tools/live/out/<run>/report.md and report.json, beside every capture's .txt and .html.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LIVE_REPO, OUT } from './config.ts'
import { Step, turnsSent, type Result } from './harness.ts'
import { resetRepo } from './repo.ts'
import { Session } from './session.ts'
import { SUITES, type Suite } from './steps.ts'

const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'))
const isKeepRepo = process.argv.includes('--keep-repo')
const suites = wanted.length === 0 ? SUITES : SUITES.filter(s => s.steps.some(id => wanted.includes(id)) || wanted.includes(s.id))
const run = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const out = join(OUT, run)
const results: Result[] = []
const captures: Record<string, string[]> = {}
const times: Record<string, number> = {}
const startedAt = Date.now()

async function runSuite(suite: Suite): Promise<void> {
  const began = Date.now()
  const steps = new Map<string, Step>()
  const stepOf = (id: string): Step => {
    const step = steps.get(id) ?? new Step(id)

    steps.set(id, step)

    return step
  }

  console.log(`suite ${suite.id} (steps ${suite.steps.join(', ')}) at ${suite.cols}×${suite.rows}`)
  if (!isKeepRepo) console.log(`  reset ${LIVE_REPO} (had ${resetRepo(LIVE_REPO).join(', ') || 'nothing'})`)
  const s = await Session.start({ cols: suite.cols, rows: suite.rows, out: join(out, suite.id) })

  try {
    await suite.run(s, stepOf)
  } catch (error) {
    const last = [...steps.values()].at(-1) ?? stepOf(suite.steps[0] ?? suite.id)

    last.expect('the script ran to the end', false, error instanceof Error ? error.message : String(error))
  } finally {
    await s.close()
  }
  for (const step of steps.values()) {
    results.push(...step.results)
    captures[step.id] = step.captures
  }
  times[suite.id] = Date.now() - began
}

for (const suite of suites) await runSuite(suite)

const mark = (r: Result): string => (r.pass === null ? 'note' : r.pass ? 'pass' : 'FAIL')
const minutes = (ms: number): string => `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`
const lines = [
  `# Live checks · ${run}`,
  '',
  `${minutes(Date.now() - startedAt)} · ${turnsSent()} prompts sent · ${results.filter(r => r.pass === true).length} pass · ${results.filter(r => r.pass === false).length} fail`,
  ''
]

for (const suite of suites) {
  lines.push(`## Suite ${suite.id} · ${suite.cols} columns · ${minutes(times[suite.id] ?? 0)}`, '')
  for (const id of suite.steps) {
    lines.push(`### Step ${id}`, '')
    for (const r of results.filter(x => x.step === id)) lines.push(`- **${mark(r)}** ${r.check}: ${r.saw}`)
    for (const html of captures[id] ?? []) lines.push(`- capture: ${html}`)
    lines.push('')
  }
}
writeFileSync(join(out, 'report.md'), `${lines.join('\n')}\n`)
writeFileSync(join(out, 'report.json'), `${JSON.stringify({ run, results, captures, times, turns: turnsSent() }, null, 2)}\n`)
console.log(lines.join('\n'))
console.log(`report: ${join(out, 'report.md')}`)
process.exit(results.some(r => r.pass === false) ? 1 : 0)

// CI's runner over tools/ci/map.ts (docs/development/ci.md): one module for what CI runs, locally and on GitHub.
//
//   bun tools/ci/ci.ts plan [--base <ref>]   what CI will run for this branch against main (mise run ci:plan)
//   bun tools/ci/ci.ts run [job…]            run that set here, or the jobs named (mise run ci:run [-- job…])
//   bun tools/ci/ci.ts step <job> <id>       one step, as CI runs it; a failure ends with a short summary
//   bun tools/ci/ci.ts settings              the repo settings' JSON and YAML parse and are formatted
//   bun tools/ci/ci.ts github                the change-detection job: decisions to GITHUB_OUTPUT, the plan to the summary
//   bun tools/ci/ci.ts report                the CI job: every job's result, the summary and the pull request comment
//   bun tools/ci/ci.ts comment --kind <ci|performance> --section <file> [--old <file>]
//                                            the one pull request comment with this section replaced, to stdout
//   bun tools/ci/ci.ts --check               the map against the workflows and the tracked files
//   bun tools/ci/ci.ts --self-test
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { DECISION_IDS, DECISIONS, JOBS, RULES, planOf, ruleOf, runsIn, type Decision, type Job, type Plan, type Step } from './map'

const ROOT = resolve(import.meta.dirname, '..', '..')
const WORKFLOWS = join(ROOT, '.github', 'workflows')
const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)

/** The comment's first line, and each section's own first line (compare.ts writes the Performance one). */
export const COMMENT = '<!-- ghostframe-pr -->'
const KINDS = ['ci', 'performance'] as const
type Kind = (typeof KINDS)[number]
export const SECTION_MARKERS: Readonly<Record<Kind, string>> = { ci: '<!-- ghostframe-ci -->', performance: '<!-- ghostframe-performance -->' }

/** Parsed YAML and JSON, read without trusting their shape. */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const field = (v: unknown, key: string): unknown => (isRecord(v) ? v[key] : undefined)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const entries = (v: unknown): [string, unknown][] => (isRecord(v) ? Object.entries(v) : [])
const list = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : [])

const git = (...a: string[]): string => {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' })

  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`)

  return r.stdout
}
const lines = (s: string): string[] =>
  s
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

/** The jobs a pull request shows, in the order the plan lists them. */
const PR_JOBS = JOBS.filter(j => j.runs !== 'never')
const jobOf = (id: string): Job => {
  const job = PR_JOBS.find(j => j.job === id)

  if (job === undefined) throw new Error(`no pull request job ${id}: one of ${PR_JOBS.map(j => j.job).join(', ')}`)

  return job
}
const decisionOf = (job: Job): Decision | undefined => (job.runs === 'always' || job.runs === 'never' ? undefined : job.runs)
const stepRuns = (s: Step, plan: Plan): boolean => s.when === undefined || plan.decisions[s.when]

/**
 * Why a job runs or skips under a plan, in a few words, from the map.
 * @param job the job
 * @param plan the plan
 * @returns the reason
 */
export function reasonOf(job: Job, plan: Plan): string {
  const d = decisionOf(job)

  if (d === undefined) return job.why
  if (plan.decisions[d]) return `${DECISIONS[d].guards}; touched: ${plan.areas.filter(a => a === 'all' || DECISIONS[d].areas.includes(a)).join(', ')}`

  // Docs and Repo settings stand in for the Quality gate on a change with no code; where it runs, it does their work.
  if (d === 'docs' && plan.decisions.gate) return 'the Quality gate checks the Markdown here'
  if (d === 'settings' && plan.decisions.gate) return 'the Quality gate formats the repo settings here'

  return `guards ${DECISIONS[d].guards}; this change touches none of ${DECISIONS[d].areas.join(', ')}`
}

/** The command that runs a job here: its steps under the plan, or its local command; none for GitHub-only jobs. */
const localOf = (job: Job, plan: Plan): string | undefined =>
  (job.steps === undefined ? job.local !== undefined : job.steps.some(s => stepRuns(s, plan))) ? `mise run ci:run -- ${job.job}` : undefined

/**
 * The plan as Markdown: which areas were touched and by which files (each rule's reason), and every job's yes or no.
 * @param plan the plan
 * @returns the Markdown
 */
export function planText(plan: Plan): string {
  const byRule = new Map<string, string[]>()

  for (const f of plan.files) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f.path])

  return [
    `**Areas:** ${plan.areas.join(', ') || 'none'} (${plan.why})`,
    '',
    ...[...byRule].map(([id, paths]) => {
      const rule = RULES.find(r => r.id === id)
      const shown = paths
        .slice(0, 8)
        .map(p => `\`${p}\``)
        .join(', ')

      return `- **${id}** (${rule?.why}): ${shown}${paths.length > 8 ? ` and ${paths.length - 8} more` : ''}`
    }),
    ...(byRule.size > 0 ? [''] : []),
    '| Job | Runs | Why | Locally |',
    '| --- | --- | --- | --- |',
    ...PR_JOBS.map(j => {
      const runs = runsIn(j, plan)
      const local = runs ? localOf(j, plan) : undefined

      return `| ${j.name} | ${runs ? 'yes' : 'skipped'} | ${reasonOf(j, plan)} | ${local === undefined ? '' : `\`${local}\``} |`
    })
  ].join('\n')
}

/**
 * The CI section of the pull request comment: the result, each job's result and why, and for a failure the command
 * that reproduces it here and where its first errors are.
 * @param plan the plan the change-detection job made (undefined when it failed)
 * @param results each ci.yml job's result (success, failure, cancelled, skipped)
 * @param runUrl this run
 * @returns the section, its marker first
 */
export function reportOf(plan: Plan | undefined, results: Readonly<Record<string, string>>, runUrl: string): string {
  const failed = Object.entries(results).filter(([, r]) => r !== 'success' && r !== 'skipped')
  const head = failed.length === 0 ? '**CI passed.**' : `**CI failed:** ${failed.map(([j]) => PR_JOBS.find(x => x.job === j)?.name ?? j).join(', ')}.`
  const rows = PR_JOBS.filter(j => j.workflow === 'ci.yml' && j.job !== 'ci').map(j => {
    const result = results[j.job] ?? 'not run'
    const why = plan === undefined ? '' : reasonOf(j, plan)

    return `| ${j.name} | ${result === 'success' ? 'passed' : result} | ${why} |`
  })
  const fixes = failed.flatMap(([id]) => {
    const job = PR_JOBS.find(j => j.job === id)
    const local = job === undefined || plan === undefined ? undefined : localOf(job, plan)

    return [
      `- **${job?.name ?? id}**: ${local === undefined ? 'runs on GitHub only' : `reproduce with \`${local}\``}; its first errors: the job's summary, or \`gh run view ${runUrl.split('/').pop()} --log-failed\`.`
    ]
  })

  return [
    SECTION_MARKERS.ci,
    '## CI',
    '',
    head,
    '',
    ...(fixes.length > 0 ? [...fixes, ''] : []),
    '| Job | Result | Why |',
    '| --- | --- | --- |',
    ...rows,
    '',
    ...(plan === undefined
      ? ['The change detection failed, so nothing was planned.']
      : ['<details><summary>What changed, and the plan</summary>', '', planText(plan), '', '</details>']),
    '',
    `[The run](${runUrl}). Before pushing, \`mise run ci:plan\` prints this plan for your branch.`
  ].join('\n')
}

/**
 * The one pull request comment with one section replaced: CI's first, then Performance's. A comment from before the
 * sections (the Performance comment alone) is read as its Performance section.
 * @param old the comment as it is, or undefined when there is none
 * @param kind the section to replace
 * @param section the new section, its own marker first
 * @returns the comment
 */
export function mergeComment(old: string | undefined, kind: Kind, section: string): string {
  if (!section.startsWith(SECTION_MARKERS[kind])) throw new Error(`the ${kind} section does not start with ${SECTION_MARKERS[kind]}`)
  const sections: Partial<Record<Kind, string>> = {}

  if (old !== undefined) {
    if (old.startsWith(COMMENT)) {
      for (const k of KINDS) {
        const m = new RegExp(`<!-- section:${k} -->\\n([\\s\\S]*?)\\n<!-- /section:${k} -->`).exec(old)

        if (m?.[1] !== undefined) sections[k] = m[1]
      }
    } else if (old.startsWith(SECTION_MARKERS.performance)) sections.performance = old
  }
  sections[kind] = section.trimEnd()

  return [COMMENT, ...KINDS.flatMap(k => (sections[k] === undefined ? [] : [`<!-- section:${k} -->`, sections[k], `<!-- /section:${k} -->`, '']))]
    .join('\n')
    .trimEnd()
}

/**
 * A failed step's summary: the command, the first lines that look like errors (else the last lines), and how to
 * reproduce it.
 * @param job the job's id
 * @param step the step
 * @param output everything it printed
 * @param code its exit code
 * @returns the Markdown
 */
export function failureOf(job: string, step: Step, output: string, code: number): string {
  const all = output.split('\n').map(l => l.trimEnd())
  const errors = all.filter(l => /\berror\b|\bfail(ed|ure)?\b|✗|✖|panic|expected|AssertionError|::error/i.test(l) && !/\b0 fail/.test(l))
  const shown = (errors.length > 0 ? errors : all.filter(Boolean)).slice(errors.length > 0 ? 0 : -20).slice(0, 20)

  return [
    `### ❌ ${job}: ${step.id} (exit ${code})`,
    '',
    '```text',
    `$ ${step.run}`,
    ...shown,
    '```',
    '',
    `Reproduce: \`${step.repro ?? step.run}\`, or the whole job: \`mise run ci:run -- ${job}\`.`
  ].join('\n')
}

/**
 * Runs one step through bash, its output streamed and kept; on a failure, its summary goes to the end of the log and
 * to the job summary.
 * @param job the job's id
 * @param step the step
 * @returns its exit code
 */
async function runStep(job: string, step: Step): Promise<number> {
  const scratch = join(tmpdir(), 'gf-ci')

  mkdirSync(scratch, { recursive: true })
  console.log(`$ ${step.run}`)
  const p = Bun.spawn(['bash', '-c', step.run], { cwd: ROOT, env: { ...process.env, CI_TMP: scratch }, stdout: 'pipe', stderr: 'pipe' })
  let output = ''
  const pump = async (s: ReadableStream<Uint8Array>, to: NodeJS.WriteStream): Promise<void> => {
    for await (const chunk of s) {
      const piece = Buffer.from(chunk).toString('utf8')

      output += piece
      to.write(piece)
    }
  }

  await Promise.all([pump(p.stdout, process.stdout), pump(p.stderr, process.stderr)])
  const code = await p.exited

  if (code !== 0) {
    const summary = failureOf(job, step, output, code)

    console.log(`\n${summary}`)
    const file = process.env['GITHUB_STEP_SUMMARY']

    if (file !== undefined) appendFileSync(file, `${summary}\n\n`)
  }

  return code
}

/** This branch's changed files against main: committed, staged, unstaged and untracked. */
function localFiles(base: string): string[] {
  const from = lines(git('merge-base', base, 'HEAD'))[0] ?? base

  return [...new Set([...lines(git('diff', '--name-only', '--no-renames', from)), ...lines(git('ls-files', '--others', '--exclude-standard'))])]
}

/** The plan for this run on GitHub: a pull request's own files, else everything. */
function githubPlan(): Plan {
  const event = process.env['GITHUB_EVENT_NAME'] ?? ''
  const head = process.env['GITHUB_HEAD_REF'] ?? ''

  if (head.startsWith('release-please--')) return planOf([], 'the release pull request')
  if (event === 'pull_request' || (event === 'push' && process.env['DIFF_PUSHES'] === 'true')) {
    return planOf(lines(git('diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD')))
  }

  return planOf([], `a ${event} run`)
}

/**
 * The repo settings' own check: each JSON or YAML file under the repo-settings rules parses, and oxfmt finds it
 * formatted. Nothing else in CI reads these files, so this is all a change to them needs.
 * @returns the problems, none when every file passes
 */
function settingsProblems(): string[] {
  const claimed = new Set(['repo-settings', 'pr-template'])
  const data = lines(git('ls-files')).filter(f => claimed.has(ruleOf(f).id) && /\.(json|ya?ml)$/.test(f))
  const problems: string[] = []

  for (const f of data) {
    const source = readFileSync(join(ROOT, f), 'utf8')

    try {
      if (f.endsWith('.json')) JSON.parse(source)
      else Bun.YAML.parse(source)
    } catch (e) {
      problems.push(`${f} does not parse: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const fmt = spawnSync('bash', ['-c', 'tools/node_modules/.bin/oxfmt --check "$@"', 'oxfmt', ...data], { cwd: ROOT, encoding: 'utf8' })

  if (fmt.status !== 0) problems.push(`oxfmt --check: ${fmt.stdout}${fmt.stderr}`.trim())
  console.log(`${data.length} repo settings files: ${data.join(', ')}`)

  return problems
}

/** The checks: every workflow job is in the map and every job and step the map names exists, and every tracked file has a rule. */
function check(): string[] {
  const problems: string[] = []
  const files = readdirSync(WORKFLOWS).filter(f => f.endsWith('.yml'))
  const jobsOf = (file: string): [string, unknown][] => entries(field(Bun.YAML.parse(readFileSync(join(WORKFLOWS, file), 'utf8')), 'jobs'))

  for (const file of files) {
    for (const [id, job] of jobsOf(file)) {
      const mapped = JOBS.find(j => j.workflow === file && j.job === id)

      if (mapped === undefined) {
        problems.push(`${file}: job ${id} is not in tools/ci/map.ts JOBS`)
        continue
      }
      const ran = list(field(job, 'steps')).flatMap(s => {
        const m = /tools\/ci\/ci\.ts step (\S+) (\S+)/.exec(text(field(s, 'run')))

        return m === null ? [] : [{ job: m[1], id: m[2], if: text(field(s, 'if')) }]
      })

      for (const r of ran) {
        const step = r.job === id ? mapped.steps?.find(s => s.id === r.id) : undefined

        if (step === undefined) problems.push(`${file}: job ${id} runs step ${r.job} ${r.id}, which map.ts does not have`)
        else if (step.when !== undefined && !r.if.includes(`outputs.${step.when}`))
          problems.push(`${file}: step ${id} ${r.id} runs when ${step.when}, but its if: does not say so`)
      }
      for (const s of mapped.steps ?? []) if (!ran.some(r => r.id === s.id)) problems.push(`${file}: job ${id} never runs map.ts step ${s.id}`)
      if (file === 'ci.yml' && id === 'changes') {
        for (const d of DECISION_IDS) if (field(field(job, 'outputs'), d) === undefined) problems.push(`ci.yml: the changes job does not output ${d}`)
      }
    }
  }
  for (const j of JOBS) {
    if (!files.includes(j.workflow)) problems.push(`map.ts names ${j.workflow}, which does not exist`)
    else if (!jobsOf(j.workflow).some(([id]) => id === j.job)) problems.push(`map.ts names ${j.workflow} job ${j.job}, which does not exist`)
  }
  const outputs = field(Bun.YAML.parse(readFileSync(join(ROOT, '.github', 'actions', 'changes', 'action.yml'), 'utf8')), 'outputs')

  for (const d of DECISION_IDS) if (field(outputs, d) === undefined) problems.push(`.github/actions/changes: no output ${d}`)
  for (const f of lines(git('ls-files')))
    if (ruleOf(f).id === 'unclassified') problems.push(`${f} matches no rule in tools/ci/map.ts (so every pull request that touches it runs everything)`)

  return problems
}

const eq = (a: unknown, b: unknown, what: string): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`)
}
/** The decisions a set of changed files turns on. */
const decisionsOn = (files: string[]): Decision[] => {
  const d = planOf(files).decisions

  return DECISION_IDS.filter(id => d[id])
}

function selfTest(): void {
  const GATE_TESTS = ['gate', 'tests', 'plugin_tests']
  const ALL = ['gate', 'tests', 'plugin_tests', 'perf', 'readme', 'site']
  // Changed files and the decisions they turn on: every rule at least once.
  const fixtures: [string[], string[]][] = [
    [['docs/development/testing.md'], ['docs']],
    [['CONTRIBUTING.md', 'LICENSE', '.diagram-design/flow.json'], ['docs']],
    [['docs/design/history/cockpit.png'], ['docs']],
    [['.github/rulesets/main.json'], ['settings']],
    [['.github/CODEOWNERS', '.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/config.yml', '.github/dependabot.yml'], ['settings']],
    [['.github/pull_request_template.md'], ['docs', 'settings']],
    [
      ['.github/rulesets/tags.json', 'docs/development/ci.md'],
      ['docs', 'settings']
    ],
    [['.github/actionlint.yaml'], ALL],
    [
      ['.github/rulesets/main.json', 'hooks/register.tsx'],
      [...GATE_TESTS, 'perf']
    ],
    [['README.md'], ['docs', 'readme', 'site']],
    [['CHANGELOG.md'], ['docs', 'site']],
    [['statusline/render.ts'], ['gate', 'tests', 'perf', 'site']],
    [['docs/assets/readme/hero.svg'], ['docs', 'readme']],
    [['docs/design/brand/ghostframe-wordmark-white.svg'], ['docs', 'readme', 'site']],
    [['.github/workflows/ci.yml'], ALL],
    [['mise.toml'], ALL],
    [['tools/bun.lock'], ALL],
    [['tools/package.json'], ALL],
    [['tsconfig.base.json'], ALL],
    [['tools/oxlint.config.ts'], ALL],
    [['.gitattributes'], ALL],
    [['release-please-config.json'], ALL],
    [['tools/ci/map.ts'], ALL],
    [['a-new-top-level-file.toml'], ALL],
    [['.claude-plugin/plugin.json'], [...GATE_TESTS, 'perf', 'readme', 'site']],
    [['hooks/shared/range.ts'], [...GATE_TESTS, 'perf', 'readme']],
    [['hooks/register.ts'], [...GATE_TESTS, 'perf']],
    [['hooks/cockpit/NOTES.md'], [...GATE_TESTS, 'perf']],
    [['types/claude-code.d.ts'], GATE_TESTS],
    [['statusline/io.ts'], ['gate', 'tests', 'perf']],
    [['tests/cockpit/work.test.tsx'], GATE_TESTS],
    [['tests/bench/session.bench.tsx'], [...GATE_TESTS, 'perf']],
    [['tools/bench/compare.ts'], ['gate', 'perf']],
    [
      ['tools/perf/probe/hooks/register.ts', 'tools/live/session.ts'],
      ['gate', 'perf']
    ],
    [['tools/scripts/readme-art.ts'], ['gate', 'readme']],
    [['tools/scripts/boundaries.ts'], ['gate']],
    [['site/src/pages/index.astro'], ['gate', 'site']],
    [
      ['docs/a.md', 'statusline/main.ts'],
      ['gate', 'tests', 'perf']
    ],
    [[], []]
  ]

  for (const [files, want] of fixtures) eq(decisionsOn(files), want, `plan of ${files.join(', ') || 'nothing'}`)
  const hit = new Set(fixtures.flatMap(([files]) => files.map(f => ruleOf(f).id)))

  for (const r of RULES) if (!hit.has(r.id)) throw new Error(`rule ${r.id} has no fixture`)
  eq(planOf([], 'a push run').decisions.perf, true, 'a push runs everything')
  eq(planOf([], 'a push run').decisions.docs, false, 'everything: the gate checks the docs, the Docs job skips')

  const docsOnly = planOf(['README.md'])
  const gate = jobOf('check')

  eq(runsIn(gate, docsOnly), false, 'docs only: the gate skips')
  eq(reasonOf(gate, docsOnly).includes('this change touches none of'), true, 'docs only: the skip says why')
  eq(
    reasonOf(jobOf('settings'), planOf([], 'a push run')),
    'the Quality gate formats the repo settings here',
    'everything: Repo settings says the gate does its work'
  )
  eq(reasonOf(jobOf('settings'), planOf(['hooks/register.tsx'])), 'the Quality gate formats the repo settings here', 'code: the same')
  eq(reasonOf(jobOf('settings'), docsOnly).includes('this change touches none of settings'), true, 'docs only: Repo settings skips for want of settings')
  eq(localOf(jobOf('docs'), docsOnly), 'mise run ci:run -- docs', 'docs only: the Docs job runs here as ci:run')
  eq(localOf(jobOf('tests'), planOf(['statusline/io.ts'])), 'mise run ci:run -- tests', 'the status line alone: its specs run')

  const report = reportOf(docsOnly, { changes: 'success', check: 'skipped', docs: 'failure', tests: 'skipped', dependencies: 'success' }, 'https://x/runs/42')

  eq(report.startsWith(SECTION_MARKERS.ci), true, 'report: its marker first')
  eq(report.includes('**CI failed:** Docs.'), true, 'report: names the failed job')
  eq(report.includes('reproduce with `mise run ci:run -- docs`'), true, 'report: the local command')
  eq(report.includes('`gh run view 42 --log-failed`'), true, 'report: where the first errors are')
  eq(reportOf(docsOnly, { changes: 'success', check: 'skipped', docs: 'success' }, 'u').includes('**CI passed.**'), true, 'report: passed')
  eq(reportOf(undefined, { changes: 'failure' }, 'u').includes('The change detection failed'), true, 'report: no plan')

  const perf = `${SECTION_MARKERS.performance}\n## Performance\n\n**32 green**`
  const one = mergeComment(undefined, 'ci', report)
  const both = mergeComment(one, 'performance', perf)

  eq(both.indexOf('## CI') < both.indexOf('## Performance'), true, 'comment: CI first, then Performance')
  eq(mergeComment(both, 'ci', reportOf(docsOnly, { docs: 'success' }, 'u')).includes('**CI failed'), false, 'comment: a section is replaced, not added')
  eq(mergeComment(both, 'ci', report).split(SECTION_MARKERS.performance).length, 2, 'comment: the other section kept once')
  eq(mergeComment(perf, 'ci', report).includes('**32 green**'), true, 'comment: an old Performance comment becomes its section')
  let refused = false

  try {
    mergeComment(undefined, 'ci', 'not a section')
  } catch {
    refused = true
  }
  eq(refused, true, 'comment: a section without its marker is refused')

  const failure = failureOf('check', { id: 'lint', run: 'bun run lint' }, 'ok line\nsrc/a.ts:3 error: no-unused\n 12 pass\n 0 fail\n', 1)

  eq(failure.includes('src/a.ts:3 error: no-unused') && !failure.includes('0 fail'), true, 'failure: the error lines, not the pass counts')
  eq(failure.includes('`mise run ci:run -- check`'), true, 'failure: the job to rerun')
  eq(
    failureOf('check', { id: 'actionlint', run: 'if [ -n "$GITHUB_ACTIONS" ]; then actionlint -format x; fi', repro: 'actionlint' }, 'e: error', 1).includes(
      'Reproduce: `actionlint`'
    ),
    true,
    'failure: the local command, not the CI-only one'
  )
  console.log('ci.ts self-test: ok')
}

if (import.meta.main) {
  const [cmd, ...rest] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]?.startsWith('--')))

  if (args.includes('--self-test')) {
    selfTest()
  } else if (args.includes('--check')) {
    const problems = check()

    for (const p of problems) console.log(`::error::${p}`)
    if (problems.length > 0) process.exit(1)
    console.log(`ci map: ok (${RULES.length} rules, ${JOBS.length} jobs, every tracked file claimed)`)
  } else if (cmd === 'plan' || cmd === 'run') {
    const base = argOf('--base') ?? 'origin/main'
    const plan = planOf(localFiles(base))

    console.log(`CI plan for this branch against ${base}:\n\n${planText(plan)}`)
    if (cmd === 'run') {
      const only = rest
      const jobs = (only.length > 0 ? only.map(jobOf) : PR_JOBS.filter(j => runsIn(j, plan))).filter(j => j.steps !== undefined || j.local !== undefined)
      const failed: string[] = []

      for (const job of jobs) {
        console.log(`\n== ${job.name}${job.job === 'tests' ? ` (on this system only; CI runs it on three)` : ''}`)
        const steps = job.steps?.filter(s => only.length > 0 || stepRuns(s, plan)) ?? [{ id: job.job, run: job.local ?? '' }]

        for (const s of steps) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one step after another, as CI runs them, each output whole
          if ((await runStep(job.job, s)) !== 0) failed.push(`${job.job} ${s.id}`)
        }
      }
      console.log(failed.length === 0 ? '\nci:run: every step passed.' : `\nci:run: failed: ${failed.join(', ')}`)
      process.exit(failed.length === 0 ? 0 : 1)
    }
  } else if (cmd === 'settings') {
    const problems = settingsProblems()

    for (const p of problems) console.log(`::error::${p}`)
    if (problems.length > 0) process.exit(1)
    console.log('repo settings: every file parses and is formatted')
  } else if (cmd === 'step') {
    const [jobId, stepId] = rest
    const step = jobOf(jobId ?? '').steps?.find(s => s.id === stepId)

    if (step === undefined) throw new Error(`no step ${stepId} in job ${jobId}`)
    process.exit(await runStep(jobId ?? '', step))
  } else if (cmd === 'github') {
    const plan = githubPlan()
    const out = process.env['GITHUB_OUTPUT']
    const shown = planText(plan)

    console.log(shown)
    if (out !== undefined) appendFileSync(out, `${DECISION_IDS.map(d => `${d}=${plan.decisions[d]}`).join('\n')}\n`)
    const summary = process.env['GITHUB_STEP_SUMMARY']

    if (summary !== undefined) appendFileSync(summary, `## What CI runs\n\n${shown}\n`)
  } else if (cmd === 'report') {
    const needs: unknown = JSON.parse(process.env['NEEDS'] ?? '{}')
    const results = Object.fromEntries(entries(needs).map(([j, n]) => [j, text(field(n, 'result'))]))
    // The same plan the change-detection job made, from the same commits.
    const plan = results['changes'] === 'success' ? githubPlan() : undefined
    const runUrl = `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
    const section = reportOf(plan, results, runUrl)
    const out = argOf('--out')

    console.log(section)
    if (out !== undefined) writeFileSync(out, section)
    const summary = process.env['GITHUB_STEP_SUMMARY']

    if (summary !== undefined) appendFileSync(summary, `${section}\n`)
    process.exit(Object.values(results).every(r => r === 'success' || r === 'skipped') ? 0 : 1)
  } else if (cmd === 'comment') {
    const kindArg = argOf('--kind')
    const kind = KINDS.find(k => k === kindArg)
    const section = argOf('--section')
    const old = argOf('--old')

    if (kind === undefined || section === undefined) throw new Error('usage: ci.ts comment --kind <ci|performance> --section <file> [--old <file>]')
    process.stdout.write(mergeComment(old !== undefined && existsSync(old) ? readFileSync(old, 'utf8') : undefined, kind, readFileSync(section, 'utf8')))
  } else {
    throw new Error('usage: ci.ts plan | run [job…] | step <job> <id> | settings | github | report | comment | --check | --self-test')
  }
}

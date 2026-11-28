// What CI runs for a change (docs/development/ci.md): the one map from changed files to areas, and from areas to the
// jobs and steps that guard them, each rule with its reason. The change-detection job (.github/actions/changes),
// `mise run ci:plan` and `mise run ci:run` (tools/ci/ci.ts), the pull request's CI comment and the docs all read this
// file; nothing restates it. `bun tools/ci/ci.ts --check` fails when a workflow job is missing here, when this names a
// job or step no workflow has, or when a tracked file matches no rule but the catch-all.

/** What a changed file belongs to. `all` runs everything. */
export type Area = 'docs' | 'settings' | 'readme' | 'site' | 'site-input' | 'plugin' | 'statusline' | 'tests' | 'perf' | 'tools' | 'all'

/** One rule: the paths it claims (Bun.Glob patterns), the areas they touch, and why. The first rule a path matches decides. */
export type Rule = { id: string; paths: readonly string[]; areas: readonly Area[]; why: string }

export const RULES: readonly Rule[] = [
  // Moved out of shared setup: no workflow, action or tool reads these (a grep of .github/workflows, .github/actions,
  // tools/, hooks/, tests/, statusline/, mise.toml and hk.pkl for each name finds no reader). A path something reads
  // stays shared: .github/actionlint.yaml is actionlint's config.
  {
    id: 'repo-settings',
    paths: ['.github/rulesets/**', '.github/CODEOWNERS', '.github/ISSUE_TEMPLATE/**', '.github/dependabot.yml'],
    areas: ['settings'],
    why: "repo settings GitHub applies (rulesets, code owners, issue forms, Dependabot's schedule): nothing in CI reads them, so only their JSON and YAML validity and format are checked; actionlint lints none of them"
  },
  {
    id: 'pr-template',
    paths: ['.github/pull_request_template.md'],
    areas: ['settings', 'docs'],
    why: 'the pull request template: GitHub shows it and nothing in CI reads it; Markdown, so the docs checks too'
  },
  {
    id: 'shared-setup',
    paths: [
      '.github/workflows/**',
      '.github/actions/**',
      '.github/actionlint.yaml',
      'mise.toml',
      'hk.pkl',
      '**/package.json',
      '**/*.lock',
      '**/*.lockb',
      '**/tsconfig*.json',
      '.oxfmtrc.json',
      '.rumdl.toml',
      '**/oxlint.config.ts',
      '**/bunfig.toml',
      '.editorconfig',
      '.gitattributes',
      '.gitignore'
    ],
    areas: ['all'],
    why: 'shared setup (workflows, actions, the config actionlint reads, the toolchain mise.toml pins, dependencies, type-check, lint and format configs, git attributes): every job depends on it'
  },
  {
    id: 'release-config',
    paths: ['release-please-config.json', '.release-please-manifest.json'],
    areas: ['all'],
    why: 'release config: only the release workflow reads it, and only on main, so a pull request runs everything rather than nothing'
  },
  {
    id: 'manifest',
    paths: ['.claude-plugin/plugin.json'],
    areas: ['plugin', 'perf', 'readme', 'site'],
    why: "the plugin's manifest: what loads (its runtime), the engine range README's badge repeats, and the facts the site reads"
  },
  {
    id: 'readme-imports',
    paths: ['hooks/shared/look/width.ts', 'hooks/shared/range.ts'],
    areas: ['plugin', 'perf', 'readme'],
    why: "plugin code README's checks import: the cell width its boxes are measured by, and the range parser"
  },
  {
    id: 'runtime',
    paths: ['hooks/**', '.claude-plugin/**'],
    areas: ['plugin', 'perf'],
    why: 'the plugin runtime: its tests on three systems, and the Performance check, which measures it'
  },
  {
    id: 'engine-types',
    paths: ['types/**'],
    areas: ['plugin'],
    why: "the engine's types: the tests and the gate check against them; nothing measures them"
  },
  {
    id: 'site-render',
    paths: ['statusline/render.ts'],
    areas: ['statusline', 'perf', 'site'],
    why: "the status line's renderer: its specs and benchmark rows, and the eye thresholds the site's facts read from it"
  },
  {
    id: 'statusline',
    paths: ['statusline/**'],
    areas: ['statusline', 'perf'],
    why: 'the status line: its specs (beside it) on three systems, and its rows in the benchmark'
  },
  {
    id: 'bench-tests',
    paths: ['tests/bench/**'],
    areas: ['tests', 'perf'],
    why: 'the harness benchmark: test files the Performance check runs, so a change to them changes the measure'
  },
  {
    id: 'tests',
    paths: ['tests/**'],
    areas: ['tests'],
    why: 'tests alone: they run on three systems (a test can break on one), and nothing is measured'
  },
  {
    id: 'bench-tools',
    paths: ['tools/bench/**', 'tools/perf/**', 'tools/live/**'],
    areas: ['perf'],
    why: 'the benchmarks, the probe they load, and the live harness the report-only benchmarks drive'
  },
  {
    id: 'readme-checks',
    paths: ['tools/scripts/readme*', 'tools/scripts/engines.ts'],
    areas: ['tools', 'readme'],
    why: "README's checks themselves (readme.ts, readme-art.ts, engines.ts)"
  },
  {
    id: 'ci-map',
    paths: ['tools/ci/**'],
    areas: ['all'],
    why: 'this map and its runner: a change to them changes what every job does'
  },
  {
    id: 'dev-tools',
    paths: ['tools/**'],
    areas: ['tools'],
    why: 'the other dev tools (scripts, mockgen, commitlint): the gate lints, type-checks and runs them'
  },
  { id: 'site', paths: ['site/**'], areas: ['site'], why: 'the website: its job' },
  {
    id: 'site-changelog',
    paths: ['CHANGELOG.md'],
    areas: ['docs', 'site-input'],
    why: "the release notes: the Markdown checks, and the site's release pages read them (site/build/site-data)"
  },
  {
    id: 'readme',
    paths: ['README.md', 'docs/design/brand/**'],
    areas: ['docs', 'readme', 'site-input'],
    why: "README and the brand art it shows: the docs checks and README's own, and the site reads both (site/build/site-data)"
  },
  {
    id: 'readme-assets',
    paths: ['docs/assets/**'],
    areas: ['docs', 'readme'],
    why: "the art README shows: the docs checks and README's own"
  },
  {
    id: 'words',
    paths: ['**/*.md', 'docs/**', 'LICENSE', '.diagram-design', '.diagram-design/**', '**/*.{png,jpg,jpeg,gif,webp,svg,ico}'],
    areas: ['docs'],
    why: 'words and pictures (CONTRIBUTING, SECURITY, docs/, the licence, diagram sources): the Markdown and link checks'
  },
  { id: 'unclassified', paths: ['**'], areas: ['all'], why: 'a file no rule claims: everything runs, and `ci.ts --check` asks for a rule' }
]

/** A yes or no CI computes from the areas; the change-detection job outputs each under its id. */
export const DECISION_IDS = ['gate', 'docs', 'settings', 'tests', 'plugin_tests', 'perf', 'readme', 'site'] as const
export type Decision = (typeof DECISION_IDS)[number]

/** Each decision: the areas that turn it on (`all` turns on every one but `docs`), and what it guards. */
export const DECISIONS: Readonly<Record<Decision, { areas: readonly Area[]; guards: string }>> = {
  gate: {
    areas: ['plugin', 'statusline', 'tests', 'perf', 'tools', 'site'],
    guards: 'lint, type-check and format of the TypeScript (tools/ and tests/ included), workflow lint, module boundaries, the Markdown'
  },
  docs: { areas: ['docs'], guards: 'the Markdown and its links, for a change with no code (the Quality gate checks them otherwise)' },
  settings: {
    areas: ['settings'],
    guards: "the repo settings' JSON and YAML: that they parse and are formatted, for a change with no code (the Quality gate formats them otherwise)"
  },
  tests: { areas: ['plugin', 'statusline', 'tests'], guards: "the plugin's tests and the status line's specs on Ubuntu, Windows and macOS" },
  plugin_tests: { areas: ['plugin', 'tests'], guards: "the plugin's tests (claude plugin test); the status line alone runs its specs alone" },
  perf: { areas: ['perf'], guards: 'the speed of code on a measured path: the plugin runtime, the status line, the benchmarks, the runtime' },
  readme: { areas: ['readme'], guards: "README.md's boxes, badge and art, and the engine range it repeats" },
  site: { areas: ['site', 'site-input'], guards: 'the website' }
}

/** One step CI runs through `bun tools/ci/ci.ts step <job> <id>`, and `mise run ci:run` runs locally: the same command. */
export type Step = {
  id: string
  run: string
  when?: Decision
  /** The command a failure says to run here, when `run` holds CI-only parts (an annotation format). */
  repro?: string
}

/**
 * A workflow job: when it runs on a pull request (a decision, `always`, or `never` for jobs that run on main or on a
 * schedule only), why, and the steps CI runs through ci.ts. A job that runs always but does nothing outside its
 * decision (Performance) names that decision with `reports: true`: it never leaves a required check unreported.
 */
export type Job = {
  workflow: string
  job: string
  name: string
  runs: Decision | 'always' | 'never'
  why: string
  reports?: true
  steps?: readonly Step[]
  /** What `mise run ci:run` runs for a job CI runs without ci.ts steps; none when it runs on GitHub only. */
  local?: string
}

/** README's checks: its boxes and badge, its art, and the engine range it repeats. */
const README_CHECKS = [
  'bun tools/scripts/engines.ts --self-test',
  'bun tools/scripts/engines.ts --check',
  'bun tools/scripts/readme.ts --self-test',
  'bun tools/scripts/readme.ts --check',
  'bun tools/scripts/readme-art.ts --self-test',
  'bun tools/scripts/readme-art.ts --check'
].join(' && ')

const GATE_STEPS: readonly Step[] = [
  { id: 'lint-js', run: 'mise run lint-js' },
  { id: 'boundaries', run: 'bun tools/scripts/boundaries.ts --self-test && bun tools/scripts/boundaries.ts && bun tools/scripts/screens.ts --check' },
  { id: 'readme', when: 'readme', run: README_CHECKS },
  { id: 'typecheck-tools', run: 'bun run --cwd tools typecheck:tools' },
  { id: 'mockgen', run: 'bun tools/mockgen/gen/build.ts "$CI_TMP/cockpit-v7.md" && cmp docs/design/history/cockpit-v7.md "$CI_TMP/cockpit-v7.md"' },
  { id: 'validate', run: 'claude plugin validate .' },
  { id: 'rating-rules', run: 'bun tools/bench/compare.ts --self-test' },
  { id: 'drift-guard', run: 'bun tools/bench/drift.ts --self-test' },
  { id: 'ci-map', run: 'bun tools/ci/ci.ts --self-test && bun tools/ci/ci.ts --check' },
  { id: 'lint', run: 'bun run --cwd tools lint:ci' },
  { id: 'format', run: 'bun run --cwd tools fmt:check' },
  // On GitHub each finding is an annotation on its line (actionlint's template, zizmor's github format); here, plain text.
  {
    id: 'actionlint',
    repro: 'actionlint',
    run: `if [ -n "\${GITHUB_ACTIONS:-}" ]; then actionlint -format '{{range $err := .}}::error file={{$err.Filepath}},line={{$err.Line}},col={{$err.Column}},title=actionlint {{$err.Kind}}::{{$err.Message}}\n{{end}}'; else actionlint; fi`
  },
  {
    id: 'zizmor',
    repro: 'zizmor --offline --persona auditor .github',
    run: 'if [ -n "${GITHUB_ACTIONS:-}" ]; then zizmor --offline --persona auditor --format github .github; else zizmor --offline --persona auditor .github; fi'
  },
  { id: 'shellcheck', run: 'files=$(git ls-files "*.sh"); if [ -n "$files" ]; then shellcheck $files; else echo "No shell scripts."; fi' },
  { id: 'docs', run: 'mise run lint-docs' }
]

export const JOBS: readonly Job[] = [
  {
    workflow: 'ci.yml',
    job: 'changes',
    name: 'Changes',
    runs: 'always',
    why: "sorts the pull request's files with this map; every other job's yes or no comes from it"
  },
  { workflow: 'ci.yml', job: 'check', name: 'Quality gate', runs: 'gate', why: DECISIONS.gate.guards, steps: GATE_STEPS },
  {
    workflow: 'ci.yml',
    job: 'docs',
    name: 'Docs',
    runs: 'docs',
    why: DECISIONS.docs.guards,
    steps: [
      { id: 'docs', run: 'mise run lint-docs' },
      { id: 'readme', when: 'readme', run: README_CHECKS }
    ]
  },
  {
    workflow: 'ci.yml',
    job: 'tests',
    name: 'Tests',
    runs: 'tests',
    why: DECISIONS.tests.guards,
    steps: [
      { id: 'plugin', when: 'plugin_tests', run: 'claude plugin test .' },
      { id: 'statusline', run: 'bun test ./statusline' }
    ]
  },
  {
    workflow: 'ci.yml',
    job: 'site',
    name: 'Site',
    runs: 'site',
    why: DECISIONS.site.guards,
    steps: [
      { id: 'install', run: 'bun install --cwd site --frozen-lockfile --ignore-scripts' },
      { id: 'check', run: 'bun run --cwd site check' }
    ]
  },
  {
    workflow: 'ci.yml',
    job: 'settings',
    name: 'Repo settings',
    runs: 'settings',
    why: DECISIONS.settings.guards,
    steps: [{ id: 'settings', run: 'bun tools/ci/ci.ts settings' }]
  },
  {
    workflow: 'ci.yml',
    job: 'dependencies',
    name: 'Dependency review',
    runs: 'always',
    why: "a new dependency's known vulnerabilities, on every pull request"
  },
  { workflow: 'ci.yml', job: 'ci', name: 'CI', runs: 'always', why: 'the required check: passes only when every job above passed or skipped' },
  {
    workflow: 'pr.yml',
    job: 'title',
    name: 'Conventional title',
    runs: 'always',
    why: 'the squash commit takes the title, so it must pass commitlint; it runs on every event and never skips'
  },
  {
    workflow: 'performance.yml',
    job: 'performance',
    name: 'Performance',
    runs: 'perf',
    reports: true,
    why: `${DECISIONS.perf.guards}; it reports on every pull request and passes at once when nothing measured changed`,
    // Main's plugin and this checkout's, as the check compares them: main in a scratch worktree, removed after.
    local:
      'm="$CI_TMP/gf-perf-main"; git worktree add --detach "$m" origin/main && { bun tools/bench/check.ts --main "$m" --runs 3; s=$?; git worktree remove --force "$m"; exit $s; }'
  },
  {
    workflow: 'performance-comment.yml',
    job: 'comment',
    name: 'Post the pull request comment',
    runs: 'never',
    why: 'runs after CI or Performance finishes, from main'
  },
  { workflow: 'benchmarks.yml', job: 'changes', name: 'Changes', runs: 'never', why: "main's pushes and the nightly run: sorts a push's files" },
  { workflow: 'benchmarks.yml', job: 'bench', name: 'Benchmarks (report only)', runs: 'never', why: "main's pushes on a measured path, and nightly" },
  { workflow: 'benchmarks.yml', job: 'drift', name: 'Budget drift', runs: 'never', why: 'main held to the budgets, on pushes on a measured path and nightly' },
  { workflow: 'canary.yml', job: 'canary', name: 'Latest Claude Code', runs: 'never', why: 'weekly, against the latest engine' },
  { workflow: 'release.yml', job: 'release-please', name: 'Release', runs: 'never', why: 'pushes to main' },
  { workflow: 'scorecard.yml', job: 'analysis', name: 'OpenSSF Scorecard', runs: 'never', why: 'weekly and on pushes to main' }
]

const GLOBS = RULES.map(r => ({ rule: r, globs: r.paths.map(p => new Bun.Glob(p)) }))

/**
 * The rule a path falls under: the first that claims it.
 * @param path a repo-relative path, with forward slashes
 * @returns the rule (the catch-all when no other claims it)
 */
export function ruleOf(path: string): Rule {
  const hit = GLOBS.find(g => g.globs.some(glob => glob.match(path)))

  if (hit === undefined) throw new Error(`no rule, not even the catch-all, claims ${path}`)

  return hit.rule
}

/** What a change needs: each file's rule, the areas touched, and every decision. */
export type Plan = { files: { path: string; rule: string }[]; areas: Area[]; decisions: Record<Decision, boolean>; why: string }

/**
 * The plan for a set of changed files, or for everything (a push, a scheduled run, the release pull request).
 * @param files the changed files, repo-relative
 * @param everything why everything runs regardless of the files, when it does
 * @returns the plan
 */
export function planOf(files: readonly string[], everything?: string): Plan {
  const matched = files.filter(f => f.length > 0).map(path => ({ path, rule: ruleOf(path).id }))
  const touched = new Set<Area>(everything === undefined ? matched.flatMap(f => RULES.find(r => r.id === f.rule)?.areas ?? []) : ['all'])
  const all = touched.has('all')
  const on = (d: Decision): boolean => all || DECISIONS[d].areas.some(a => touched.has(a))
  const gate = on('gate')
  // Docs runs only where the gate does not, which checks the Markdown too.
  const decisions: Record<Decision, boolean> = {
    gate,
    docs: !gate && touched.has('docs'),
    settings: !gate && touched.has('settings'),
    tests: on('tests'),
    plugin_tests: on('plugin_tests'),
    perf: on('perf'),
    readme: on('readme'),
    site: on('site')
  }

  return { files: matched, areas: [...touched].toSorted(), decisions, why: everything ?? (all ? 'a file in a rule that runs everything' : 'the files changed') }
}

/**
 * Whether a job runs on a pull request with this plan.
 * @param job the job
 * @param plan the plan
 * @returns whether it does its work
 */
export const runsIn = (job: Job, plan: Plan): boolean => (job.runs === 'always' ? true : job.runs === 'never' ? false : plan.decisions[job.runs])

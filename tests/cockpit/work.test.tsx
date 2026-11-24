import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, VIEW } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { respond } from '../support/respond'

// Phase 6: [ TODO ], [ FILES ] and [ SOURCES ] from the main loop's calls, through the real hooks.
const URLS = ['https://docs.github.com/en/actions/workflow-syntax', 'https://bun.sh/docs/cli/publish', 'https://docs.sigstore.dev/cosign/overview/']
// Claude's own footnotes (7.4): `[n]` in the prose and its `[n]: url` lines; a link of its own numbers nothing.
const ANSWER = `Pin the workflow syntax [1] and publish with [bun publish](${URLS[1]}) [2].\n\n[1]: ${URLS[0]}\n[2]: ${URLS[1]}`

function engine(on: On, clock: { now: number }) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', (_, e) => {
    clock.now += 1_000
    const i = e as unknown as Record<string, unknown>

    switch (e.tool) {
      case 'TaskCreate':
        return { result: { task: { id: String(i['subject']).slice(0, 1), subject: i['subject'] } }, text: 'ok' }
      case 'Edit':
        return { result: { structuredPatch: [{ lines: ['+a', '+b', '-c'] }] }, text: 'ok' }
      case 'Write':
        return { result: { type: 'create', content: 'x\ny\n', structuredPatch: [] }, text: 'ok' }
      case 'WebFetch':
        return i['url'] === URLS[2]
          ? { result: 'Request failed with status code 404', isError: true, text: 'Request failed with status code 404' }
          : { result: { url: i['url'], code: 200 }, text: 'ok' }
      default:
        return { result: {}, text: 'ok' }
    }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

const call = ($: Engine, tool: string, id: string, input: Record<string, unknown>) => $.tool.call({ tool, ...input, tool_use_id: id } as never)

/** Every tab's rows (8.1): the pane focused, each tab shown in turn by its key, then the timeline again. */
async function paneText($: Engine): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  const rows: string[] = []

  for (const key of ['key-1', 'key-2', 'key-3', 'key-4', 'key-5']) {
    await ui.press({ key })
    await ui.redraw()
    rows.push(...(await ui.findAll({ type: 'Text' })).map(t => t.text.trimEnd()).filter(t => t.trim().length > 0 && !t.includes('\n')))
  }

  await ui.press({ key: 'key-1' })
  await ui.unmount()

  return [...new Set(rows)]
}

test('a turn`s to-dos, files and pages reach the pane; the answer`s marks match the left`s Sources frame', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'ship it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'ship it', turnId: 't1' })

  await call($, 'TaskCreate', 'k1', { subject: 'Audit the workflow', description: 'x' })
  await call($, 'TaskCreate', 'k2', { subject: 'Bump the runner', description: 'x' })
  await call($, 'TaskUpdate', 'k3', { taskId: 'A', status: 'in_progress' })
  await $.session.append(respond([use('f1', 'WebFetch', {}), use('f2', 'WebFetch', {}), use('f3', 'WebFetch', {})], 'm1'))

  for (const [n, url] of URLS.entries()) await call($, 'WebFetch', `f${n + 1}`, { url, prompt: 'x' })

  await call($, 'Edit', 'e1', { file_path: '/repo/.github/workflows/ci.yml', old_string: 'a', new_string: 'b' })
  await call($, 'Write', 'w1', { file_path: '/repo/docs/RELEASE.md', content: 'x\ny\n' })
  await call($, 'TaskUpdate', 'k4', { taskId: 'A', status: 'completed' })

  // While the turn runs: pages in fetch order, unmarked.
  let rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}1 of 2 done +turn \d+$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}✓  Audit the workflow/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}2 files changed +\+4  −1$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}\.github\/workflows\/ci\.yml +\+2 {3}−1  ■+$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}docs\/RELEASE\.md +\+2 {7}■+$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}3 pages read {3}0 cited +1 failed$/))
  expect(rows.filter(r => /^ {2}[·¹²³] \S/.test(r)).map(r => r.slice(2, 4))).toEqual(['· ', '· ', '· '])
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}· docs\.sigstore\.dev .* 404$/))

  // The answer cites two; the turn ends: those come first, marked as the answer marks them.
  await $.session.append(respond([text(ANSWER)], 'm2'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}3 pages read {3}2 cited/))
  expect(rows.filter(r => /^ {2}[·¹²³] \S/.test(r)).map(r => r.slice(0, 20))).toEqual(['  ¹ docs.github.com ', '  ² bun.sh   bun.sh/', '  · docs.sigstore.de'])

  // The left numbers the same pages the same way: the prose marks and its Sources frame.
  const left = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: ANSWER, isFirstOfReply: true }
  })
  const drawn = (await left.findAll({ type: 'Text' })).map(t => t.text)
  await left.unmount()
  // The prose's refs (7.4) and its footnote lines number the pages as the pane does.
  expect(drawn).toContainEqual(expect.stringMatching(/workflow syntax \[1\] and publish with bun publish \[2\]\./))
  expect(drawn).toContainEqual(expect.stringMatching(/^ {13}│  \[1\] docs\.github\.com\/en\/actions\/workflow-syntax {3}\[2\] bun\.sh\/docs\/cli\/publish *$/))

  // The next typed turn: files and pages start over; the list, not all done, stays.
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'next', turnId: 't2' })
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/FILES 0 {3}SOURCES 0 {3}TODO 1\/2/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}1 of 2 done +turn \d+$/))
})

test('a shell step`s writes reach [ FILES ] from the working copy`s diff: `printf >> notes3.txt` is a row', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  // Git as the work tree reads at the turn's start, after the printf, and after the formatter: README.md was changed
  // before the turn; the printf adds notes3.txt (new, untracked); the formatter changes src/app.ts.
  const tracked = ['4\t0\tREADME.md\n', '4\t0\tREADME.md\n', '4\t0\tREADME.md\n2\t1\tsrc/app.ts\n']
  const others = ['', 'notes3.txt\0', 'notes3.txt\0']
  let diffs = 0
  let lists = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    if (argv.startsWith('git diff --numstat')) return { value: { exitCode: 0, stdout: tracked[Math.min(diffs++, 2)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: others[Math.min(lists++, 2)] ?? '', stderr: '' } } as never
  })
  on('fs.read', () => ({ value: 'three\n' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })

  await call($, 'Bash', 'b1', { command: `printf 'three\n' >> "$PWD/notes3.txt"` })
  await call($, 'Bash', 'b2', { command: 'bun run fmt' })

  const rows = await paneText($)
  // README.md was changed before the turn: no row. The turn's own: notes3.txt (new), then src/app.ts.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}2 files changed +\+3  −1$/))
  expect([...new Set(rows.filter(r => /^ {4}\S+\.(txt|ts|md) /.test(r)).map(r => r.trim().split(/\s+/)[0]))]).toEqual(['notes3.txt', 'src/app.ts'])
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}notes3\.txt +\+1 {7}■+$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}src\/app\.ts +\+2 {3}−1  ■+$/))
})

/**
 * A turn that writes two files outside the project, one by a Write to its full path and one by a shell to a `~/` path,
 * then ends: what the engine printed on the main screen (not the debug log), and what it was asked to read.
 */
async function outsideTurn($: Engine, on: On): Promise<{ said: string[]; read: string[] }> {
  const clock = { now: T0 }
  engine(on, clock)
  const said: string[] = []
  const read: string[] = []
  on('session.id', () => ({ value: 's1' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.log', (_, e) => {
    if ((e as { to?: unknown }).to !== 'debug') said.push(e.text)

    return { value: undefined }
  })
  // A clean work tree, so a file no snapshot covers would fall back to Git.
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('fs.read', (_, e) => {
    const path = String((e as { path?: unknown }).path)
    read.push(path)

    if (path.includes('~')) throw new Error(`ENOENT: no such file or directory, open '${path}'`)

    return { value: 'x\n' }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'scratch', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'scratch', turnId: 't1' })
  await call($, 'Write', 'w1', { file_path: 'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\s\\scratchpad\\harness5.py', content: 'x\ny\n' })
  await call($, 'Bash', 'b1', { command: `printf 'x\n' > ~/AppData/Local/Temp/claude/s/scratchpad/notes.txt` })
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })

  return { said, read }
}

test('a file written outside the project is never diffed: nothing reaches the main screen, and Files shows it with no counts', ON, async ($, on) => {
  const { said, read } = await outsideTurn($, on)
  const rows = await paneText($)

  expect(said).toEqual([])
  expect(read.filter(p => /harness5|notes\.txt/.test(p))).toEqual([])
  // No counts: the change bar's empty track only.
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}~\/AppData\/.*\/scratchpad\/harness5\.py {2,}■{5}$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}~\/AppData\/.*\/scratchpad\/notes\.txt {2,}■{5}$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}2 files changed$/))
})

test('with Cockpit off, a file written outside the project prints nothing either', async ($, on) => {
  const { said } = await outsideTurn($, on)

  expect(said).toEqual([])
})

test('an append to a file the turn created counts too: its lines are read again at each shell step', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const content = ['', 'one\ntwo\n', 'one\ntwo\nthree\n']
  let lists = 0
  let reads = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    if (argv.startsWith('git diff --numstat')) return { value: { exitCode: 0, stdout: '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: lists++ === 0 ? '' : 'notes5.txt\0', stderr: '' } } as never
  })
  on('fs.read', () => ({ value: content[Math.min(++reads, 2)] ?? '' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })
  await call($, 'Bash', 'b1', { command: `printf 'one\ntwo\n' >> "$PWD/notes5.txt"` })
  await call($, 'Bash', 'b2', { command: `printf 'three\n' >> "$PWD/notes5.txt"` })

  expect(await paneText($)).toContainEqual(expect.stringMatching(/^ {4}notes5\.txt +\+3 {7}■+$/))
})

test('a repo with no commits yet: Git has seen nothing, so every file it lists is new, and no notice is printed', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const said: string[] = []
  on('ui.log', (_, e) => {
    said.push(e.text)

    return { value: undefined }
  })
  // `git init`, two files added, no commit: HEAD does not resolve, and `git diff HEAD` would fail.
  const listed = ['a.txt\0notes.txt\0', 'a.txt\0notes.txt\0new.txt\0']
  let lists = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 1, stdout: '', stderr: '' } } as never
    if (argv.startsWith('git diff')) return { value: { exitCode: 128, stdout: '', stderr: "fatal: bad revision 'HEAD'" } } as never
    if (argv === 'git ls-files --cached --others --exclude-standard -z')
      return { value: { exitCode: 0, stdout: listed[Math.min(lists++, 1)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 1, stdout: '', stderr: `unexpected: ${argv}` } } as never
  })
  on('fs.read', () => ({ value: 'one\n' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'add a file', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a file', turnId: 't1' })
  await call($, 'Bash', 'b1', { command: `printf 'one\n' > new.txt` })

  const rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}new\.txt +\+1 {7}■+$/))
  expect(rows.some(r => /a\.txt|notes\.txt/.test(r))).toBe(false)
  expect(said.filter(t => /git|unreadable/.test(t))).toEqual([])
})

test('an agent`s edit and fetch reach FILES and SOURCES marked ◇, never the main loop`s steps; its diff starts before its call', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: `ag-${e.description}` }))
  let content = 'old line\nkept\n'
  on('fs.read', () => ({ value: content }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })
  await call($, 'Agent', 'c1', { description: 'Edit note', prompt: 'go', run_in_background: true })
  await $.agent.spawn({
    tool_use_id: 'c1',
    prompt: 'go',
    description: 'Edit note',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'haiku',
    background: true,
    fork: false
  } as never)

  const agent = { agentId: 'ag-Edit note' }
  await call($, 'Edit', 'a1', { ...agent, file_path: '/repo/notes.md', old_string: 'old line', new_string: 'new line' })
  content = 'new line\nkept\n'
  await call($, 'WebFetch', 'a2', { ...agent, url: URLS[2], prompt: 'x' })
  await call($, 'Edit', 'e1', { file_path: '/repo/notes.md', old_string: 'kept', new_string: 'kept too' })
  content = 'new line\nkept too\n'

  const rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}◇ notes\.md +\+4 {3}−2  ■+$/))
  expect(rows.some(r => /^ {4}notes\.md /.test(r))).toBe(false)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}· docs\.sigstore\.dev .* 404$/))
  // The main loop's head counts its own two steps, the launch and its edit; the agent's fetch failed in its own log.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}2 steps/))
  expect(rows.some(r => /still failing/.test(r))).toBe(false)

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: 'file:notes.md' })
  await ui.redraw()
  const diff = (await ui.findAll({ type: 'Text' })).map(t => t.text.trimEnd()).filter(t => /^ {2}[ \d]{6} [−+ ] /.test(t))
  expect([...new Set(diff)]).toEqual(['   1     − old line', '   2     − kept', '       1 + new line', '       2 + kept too'])
  await ui.press({ key: 'key-b' })
  await ui.press({ key: 'key-1' })
  await ui.unmount()
})

test('an agent the roster does not list (a workflow`s, the engine`s memory fork) adds no file and no page', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })
  await call($, 'Write', 'x1', { agentId: 'fork-1', file_path: '/repo/memory/x.md', content: 'x\ny\n' })
  await call($, 'WebFetch', 'x2', { agentId: 'fork-1', url: URLS[0], prompt: 'x' })

  const rows = await paneText($)
  expect(rows.some(r => /x\.md/.test(r))).toBe(false)
  expect(rows).toContainEqual(expect.stringMatching(/FILES 0 {3}SOURCES 0/))
})

test('two agents` shells ending together count each change once, and a file two calls name is read once', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: `ag-${e.description}` }))
  // The work tree's diff: clean at the turn's start, then one line, then two, as the shells append.
  const tracked = ['', '1\t0\tlog.txt\n', '2\t0\tlog.txt\n']
  let diffs = 0
  let reads = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    if (argv.startsWith('git diff --numstat')) return { value: { exitCode: 0, stdout: tracked[Math.min(diffs++, 2)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('fs.read', (_, e) => {
    // The plugin's own manifest (the wordmark's version, 8.12) is not one of the turn's files.
    if (!String((e as { path?: unknown }).path).endsWith('plugin.json')) reads += 1

    return { value: 'x\n' }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'logs', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'logs', turnId: 't1' })

  for (const name of ['One', 'Two']) {
    await call($, 'Agent', `c${name}`, { description: name, prompt: 'go', run_in_background: true })
    await $.agent.spawn({
      tool_use_id: `c${name}`,
      prompt: 'go',
      description: name,
      subagentType: 'general-purpose',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'haiku',
      background: true,
      fork: false
    } as never)
  }

  await Promise.all([
    call($, 'Bash', 'b1', { agentId: 'ag-One', command: 'echo a >> log.txt' }),
    call($, 'Bash', 'b2', { agentId: 'ag-Two', command: 'echo b >> log.txt' })
  ])

  expect(await paneText($)).toContainEqual(expect.stringMatching(/^ {2}◇ log\.txt +\+2 {7}■+$/))
  // Both commands name log.txt as a write target: its turn-start content is read once.
  expect(reads).toBe(1)
})

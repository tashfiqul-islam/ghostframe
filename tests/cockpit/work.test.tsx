import { expect, mock, test } from 'claude-code/testing'

import { ON, PANE, SLOW, T0, VIEW, posixPath, statAsSpelled } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { respond } from '../support/respond'

// Phase 6: [ TODO ], [ FILES ] and [ SOURCES ] from the main loop's calls, through the real hooks.
const URLS = ['https://docs.github.com/en/actions/workflow-syntax', 'https://bun.sh/docs/cli/publish', 'https://docs.sigstore.dev/cosign/overview/']
// Claude's own footnotes (7.4): `[n]` in the prose and its `[n]: url` lines; a link of its own numbers nothing.
const ANSWER = `Pin the workflow syntax [1] and publish with [bun publish](${URLS[1]}) [2].\n\n[1]: ${URLS[0]}\n[2]: ${URLS[1]}`

/** A fetch's answer, for a test that answers its own (`round 6, 6b`). */
type Fetched = { result: unknown; text: string; isError?: true }

function engine(on: On, clock: { now: number }, fetch?: (url: string) => Promise<Fetched>) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', async (_, e) => {
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
        if (fetch !== undefined) return fetch(String(i['url']))

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

/** A command that ran and printed `stdout`, as `$.process.run` answers it. */
const ran = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never

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

test('a turn`s to-dos, files and pages reach the pane; the answer`s marks match the left`s Sources frame', SLOW, async ($, on) => {
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
  // Nothing cited: no order line in the card (round 6, 6b).
  expect(rows.some(r => /cited pages first/.test(r))).toBe(false)

  // The answer cites two; the turn ends: those come first, marked as the answer marks them.
  await $.session.append(respond([text(ANSWER)], 'm2'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}3 pages read {3}2 cited/))
  expect(rows).toContainEqual('  cited pages first, in answer order')
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

test('round 6, 6b. two fetches at once: Sources lists them in the order Claude fetched them, not the order they ended', ON, async ($, on) => {
  const clock = { now: T0 }
  let finishFirst: (() => void) | undefined
  const first = new Promise<void>(resolve => {
    finishFirst = resolve
  })
  engine(on, clock, async url => {
    // bun.sh is fetched first and answers last, as in the live run's step 6.
    if (url.includes('bun.sh')) await first

    return url.includes('example.com')
      ? { result: 'Request failed with status code 404', isError: true, text: 'Request failed with status code 404' }
      : { result: { url, code: 200, result: '**Title:** Test runner' }, text: 'ok' }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'read two pages', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'read two pages', turnId: 't1' })
  const bun = call($, 'WebFetch', 'f1', { url: 'https://bun.sh/docs/cli/test', prompt: 'x' })
  await call($, 'WebFetch', 'f2', { url: 'https://example.com/missing-page', prompt: 'x' })
  finishFirst?.()
  await bun

  const rows = (await paneText($)).filter(r => /^ {2}· \S/.test(r))
  expect(rows.map(r => r.trim().split(/\s+/)[1])).toEqual(['bun.sh', 'example.com'])
  expect(rows[0]).toMatch(/^ {2}· bun\.sh {3}Test runner +200$/)
})

test('a shell step`s writes reach [ FILES ] from the working copy`s diff: `printf >> notes3.txt` is a row', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  // Git as the work tree reads at the turn's start, after the printf, and after the formatter: README.md was changed
  // before the turn; the printf adds notes3.txt (new, untracked); the formatter changes src/app.ts.
  const tracked = ['4\t0\tREADME.md\0', '4\t0\tREADME.md\0', '4\t0\tREADME.md\x002\t1\tsrc/app.ts\0']
  const others = ['', 'notes3.txt\0', 'notes3.txt\0']
  let diffs = 0
  let lists = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    if (argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '\n', stderr: '' } } as never
    if (argv.startsWith('git diff --numstat')) return { value: { exitCode: 0, stdout: tracked[Math.min(diffs++, 2)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: others[Math.min(lists++, 2)] ?? '', stderr: '' } } as never
  })
  on('fs.read', () => ({ value: 'three\n' }))
  statAsSpelled(on)
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
 * A turn that writes four files outside the project, then ends: one by a Write to its full path, one by a shell to a
 * `~/` path, one by a Write to a path that climbs out (`sub/../../climbed.txt`), and one by a Write through a link
 * in the project (`link/`, a junction to `/outside`). What the engine printed on the main screen (not the debug log), and
 * what it was asked to read and to stat.
 */
async function outsideTurn($: Engine, on: On): Promise<{ said: string[]; read: string[]; statted: string[] }> {
  const clock = { now: T0 }
  engine(on, clock)
  const said: string[] = []
  const read: string[] = []
  const statted: string[] = []
  on('session.id', () => ({ value: 's1' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  // The home folder is known, so a `~/` path expands to a real one and only the guards keep it unread.
  mock.env(on, { USERPROFILE: 'C:/Users/me' })
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
  // Every path lands where it is spelled, but `/repo/link/`, which lands in `/outside/`. The engine hands a hook the
  // path made absolute, on Windows with its drive (`D:\repo\link\linked.txt`); the disk answers as POSIX does.
  on('fs.stat', (_, e) => {
    statted.push(e.path)

    return { value: { kind: 'file', size: 2, mtimeMs: 0, isLink: false, realPath: posixPath(e.path).replace(/^\/repo\/link(?=\/|$)/, '/outside') } }
  })
  on('fs.read', (_, e) => {
    read.push(e.path)

    return { value: 'x\n' }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'scratch', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'scratch', turnId: 't1' })
  await call($, 'Write', 'w1', { file_path: 'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\s\\scratchpad\\harness5.py', content: 'x\ny\n' })
  await call($, 'Bash', 'b1', { command: `printf 'x\n' > ~/AppData/Local/Temp/claude/s/scratchpad/notes.txt` })
  await call($, 'Write', 'w2', { file_path: 'sub/../../climbed.txt', content: 'x\ny\n' })
  await call($, 'Write', 'w3', { file_path: '/repo/link/linked.txt', content: 'x\ny\n' })
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })

  return { said, read, statted }
}

/** A FILES row's full diff (8.6): its rows, from the Files tab. */
async function fullDiff($: Engine, path: string): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: `file:${path}` })
  await ui.redraw()
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text.trimEnd())
  await ui.press({ key: 'key-b' })
  await ui.press({ key: 'key-1' })
  await ui.unmount()

  return rows
}

test('a file written outside the project is never read nor diffed: nothing reaches the main screen, Files shows no counts', ON, async ($, on) => {
  const { said, read, statted } = await outsideTurn($, on)
  const rows = await paneText($)

  expect(said).toEqual([])
  // Not read at the turn's start, at its end, or when its diff opens; the three spelled outside are not even looked at.
  expect(read.filter(p => /harness5|notes\.txt|climbed|linked/.test(p))).toEqual([])
  expect(statted.filter(p => /harness5|notes\.txt|climbed/.test(p))).toEqual([])
  // No counts: the change bar's empty track only.
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}~\/AppData\/.*\/scratchpad\/harness5\.py {2,}■{5}$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}~\/AppData\/.*\/scratchpad\/notes\.txt {2,}■{5}$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}sub\/\.\.\/\.\.\/climbed\.txt {2,}■{5}$/))

  // Each full diff opened (8.6): still nothing outside is read or looked at.
  for (const path of ['~/AppData/Local/Temp/claude/s/scratchpad/notes.txt', 'sub/../../climbed.txt', 'link/linked.txt'])
    expect((await fullDiff($, path)).some(r => r.includes(path.split('/').at(-1) ?? path))).toBe(true)

  expect(read.filter(p => /harness5|notes\.txt|climbed|linked/.test(p))).toEqual([])
  expect(statted.filter(p => /harness5|notes\.txt|climbed/.test(p))).toEqual([])
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
    if (argv.startsWith('git diff --numstat') || argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: lists++ === 0 ? '' : 'notes5.txt\0', stderr: '' } } as never
  })
  on('fs.read', () => ({ value: content[Math.min(++reads, 2)] ?? '' }))
  statAsSpelled(on)
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
    if (argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 1, stdout: '', stderr: '' } } as never
    if (argv.startsWith('git diff')) return { value: { exitCode: 128, stdout: '', stderr: "fatal: bad revision 'HEAD'" } } as never
    if (argv === 'git ls-files --cached --others --exclude-standard -z')
      return { value: { exitCode: 0, stdout: listed[Math.min(lists++, 1)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 1, stdout: '', stderr: `unexpected: ${argv}` } } as never
  })
  on('fs.read', () => ({ value: 'one\n' }))
  statAsSpelled(on)
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
  statAsSpelled(on)
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
  const tracked = ['', '1\t0\tlog.txt\0', '2\t0\tlog.txt\0']
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
  statAsSpelled(on)
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

// Where a session sits against the work tree Git names (macOS /tmp, a Windows junction): its folder, what a link in it
// leads to, Git's root (every link resolved), Git's path from that root down to the session's folder, and the folder
// Git is then run in. `isLong`: the disk spells real paths in Windows' long form (`\\?\D:\…`).
type Place = { name: string; cwd: string; link?: readonly [string, string]; root: string; prefix: string; gitAt: string; isLong?: true }
const PLACES: readonly Place[] = [
  {
    name: 'a project opened through a link to its root',
    cwd: '/link/repo',
    link: ['/link/repo', '/real/repo'],
    root: '/real/repo',
    prefix: '',
    gitAt: '/link/repo'
  },
  {
    name: 'a session started inside a linked subfolder',
    cwd: '/repo/linked',
    link: ['/repo/linked', '/repo/real/sub'],
    root: '/repo',
    prefix: 'real/sub/',
    gitAt: '/repo'
  },
  { name: 'a session in a plain subfolder', cwd: '/repo/app', root: '/repo', prefix: 'app/', gitAt: '/repo' },
  // `~/app` is a link to `/repo/app`: its name ends with Git's path, but `~` is not the root (a dotfiles repo there
  // must never be the one Git reads).
  {
    name: 'a session through a link named as its target',
    cwd: '/home/me/app',
    link: ['/home/me/app', '/repo/app'],
    root: '/repo',
    prefix: 'app/',
    gitAt: '/repo'
  },
  {
    // Windows: Git spells the root `D:/repo`, the disk the same folder `\\?\D:\repo`.
    name: 'a linked subfolder whose real path the disk spells long',
    cwd: '/repo/linked',
    link: ['/repo/linked', '/repo/real/sub'],
    root: 'D:/repo',
    prefix: 'real/sub/',
    gitAt: 'D:/repo',
    isLong: true
  },
  { name: 'a repo at the filesystem`s root', cwd: '/', root: '/', prefix: '', gitAt: '/' }
]

for (const place of PLACES) {
  test(`${place.name}: Git's root and the session's folder agree, and a shell's change is the project's own row`, ON, async ($, on) => {
    const clock = { now: T0 }
    engine(on, clock)
    let diffs = 0
    // Where each Git call after the two that find the work tree ran.
    const ranAt: string[] = []
    on('process.run', (_, e) => {
      const argv = e.argv.join(' ')

      if (argv === 'git rev-parse --show-toplevel') return ran(`${place.root}\n`)
      if (argv === 'git rev-parse --show-prefix') return ran(`${place.prefix}\n`)
      ranAt.push(String(e.init?.cwd))
      if (argv === 'git rev-parse --verify --quiet HEAD') return ran('f00d\n')
      if (argv.startsWith('git diff --numstat')) return ran(diffs++ === 0 ? '' : `1\t0\t${place.prefix}notes.txt\0`)

      return ran('')
    })
    // The disk answers as POSIX does: the engine hands the hook the path made absolute (on Windows with its drive).
    on('fs.stat', (_, e) => {
      const path = e.path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/') || '/'
      const real = place.link === undefined || !path.startsWith(place.link[0]) ? path : `${place.link[1]}${path.slice(place.link[0].length)}`

      return { value: { kind: 'file', size: 4, mtimeMs: 0, isLink: false, realPath: place.isLong === true ? `\\\\?\\D:${real.replaceAll('/', '\\')}` : real } }
    })
    on('fs.read', () => ({ value: 'one\n' }))
    await $.session.start({ cwd: place.cwd, surface: 'terminal', isInteractive: false })
    await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'notes', turnId: 't1' })
    await call($, 'Bash', 'b1', { command: `printf 'one\n' >> notes.txt` })

    const rows = await paneText($)
    expect(rows).toContainEqual(expect.stringMatching(/^ {4}notes\.txt +\+1 {7}■+$/))
    expect(rows.some(r => r.includes(`${place.root.replace(/\/$/, '')}/notes`))).toBe(false)
    expect([...new Set(ranAt)]).toEqual([place.gitAt])
  })
}

test('a session whose folder lands neither where Git`s root nor its path say: no work tree is guessed, and the notice says why', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const said: string[] = []
  on('ui.log', (_, e) => {
    said.push(e.text)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return ran('/repo\n')
    if (argv === 'git rev-parse --show-prefix') return ran('real/sub/\n')

    return ran('')
  })
  // `/repo/linked` lands in `/elsewhere/sub`, not in `/repo/real/sub` as Git's root and path would have it.
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, realPath: '/elsewhere/sub' } }))
  await $.session.start({ cwd: '/repo/linked', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })

  expect(said).toContainEqual(expect.stringMatching(/git work tree unreadable.*\/elsewhere\/sub is not real\/sub under Git's root \/repo/))
})

test('a session in a repo`s subfolder: an untracked file outside that folder is never read', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const read: string[] = []
  let lists = 0
  // The session is at `/repo/app`; Git lists the whole work tree's new files, one of them beside `app/`.
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return ran('/repo\n')
    if (argv === 'git rev-parse --show-prefix') return ran('app/\n')
    if (argv === 'git rev-parse --verify --quiet HEAD') return ran('f00d\n')
    if (argv.startsWith('git ls-files')) return ran(lists++ === 0 ? '' : 'app/new.txt\0secrets.env\0')

    return ran('')
  })
  statAsSpelled(on)
  on('fs.read', (_, e) => {
    read.push(e.path)

    return { value: 'one\n' }
  })
  await $.session.start({ cwd: '/repo/app', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })
  await call($, 'Bash', 'b1', { command: `printf 'one\n' > new.txt` })

  const rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}new\.txt +\+1 {7}■+$/))
  expect(read.filter(p => p.includes('secrets'))).toEqual([])
  expect(rows.some(r => r.includes('secrets'))).toBe(false)
})

test('an untracked link to a file outside the project is never read, so its lines are never counted', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const read: string[] = []
  let lists = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return ran('/repo\n')
    if (argv === 'git rev-parse --show-prefix') return ran('\n')
    if (argv === 'git rev-parse --verify --quiet HEAD') return ran('f00d\n')
    if (argv.startsWith('git ls-files')) return ran(lists++ === 0 ? '' : 'new.txt\0keys.txt\0')

    return ran('')
  })
  // `keys.txt` is a link Git lists as a new file; it leads to `/home/me/.ssh/keys.txt`.
  on('fs.stat', (_, e) => {
    const path = e.path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')

    return {
      value: { kind: 'file', size: 4, mtimeMs: 0, isLink: path.endsWith('keys.txt'), realPath: path.endsWith('keys.txt') ? '/home/me/.ssh/keys.txt' : path }
    }
  })
  on('fs.read', (_, e) => {
    read.push(e.path)

    return { value: 'one\ntwo\n' }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })
  await call($, 'Bash', 'b1', { command: 'make' })

  expect(await paneText($)).toContainEqual(expect.stringMatching(/^ {4}new\.txt +\+2 {7}■+$/))
  expect(read.filter(p => p.includes('keys'))).toEqual([])
})

// The project is `/repo/app`; `linked.txt` in it is a new file, a link to `/repo/App/secret.txt`, a sibling folder
// whose name differs only in case. Where the disk ignores case (Windows, macOS) that is the project's own folder;
// elsewhere, and where the platform is not known, it is another folder: outside, never read.
const CASES = [
  ['linux', false],
  ['wsl', false],
  ['unknown', false],
  ['windows', true],
  ['macos', true]
] as const

for (const [platform, isSameFolder] of CASES) {
  test(`on ${platform}, a link to a folder named as the project in another case is ${isSameFolder ? 'the project' : 'outside it'}`, ON, async ($, on) => {
    const clock = { now: T0 }
    engine(on, clock)
    on('session.info', () => ({ value: { platform } as never }))
    const read: string[] = []
    let lists = 0
    on('process.run', (_, e) => {
      const argv = e.argv.join(' ')

      if (argv === 'git rev-parse --show-toplevel') return ran('/repo/app\n')
      if (argv === 'git rev-parse --show-prefix') return ran('\n')
      if (argv === 'git rev-parse --verify --quiet HEAD') return ran('f00d\n')
      if (argv.startsWith('git ls-files')) return ran(lists++ === 0 ? '' : 'linked.txt\0')

      return ran('')
    })
    on('fs.stat', (_, e) => {
      const path = posixPath(e.path)
      const isLinked = path.endsWith('linked.txt')

      return { value: { kind: 'file', size: 4, mtimeMs: 0, isLink: isLinked, realPath: isLinked ? '/repo/App/secret.txt' : path } }
    })
    on('fs.read', (_, e) => {
      read.push(e.path)

      return { value: 'one\ntwo\n' }
    })
    await $.session.start({ cwd: '/repo/app', surface: 'terminal', isInteractive: false })
    await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'notes', turnId: 't1' })
    await call($, 'Bash', 'b1', { command: 'make' })

    const row = (await paneText($)).find(r => r.includes('linked.txt'))
    expect({ row, read: read.filter(p => p.includes('linked')).length }).toEqual(
      isSameFolder
        ? { row: expect.stringMatching(/^ {4}linked\.txt +\+2 {7}■+$/), read: 1 }
        : { row: expect.stringMatching(/^ {4}linked\.txt {2,}■{5}$/), read: 0 }
    )
  })
}

test('a file whose name Git would quote (`café.txt`, `my notes/a b.md`): its row and its diff name it as it is', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  const asked: string[] = []
  let diffs = 0
  // As Git prints them: without `-z` a non-ASCII name is quoted and escaped; with `-z` each path is as it is.
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')
    asked.push(argv)

    if (argv === 'git rev-parse --show-toplevel') return ran('/repo\n')
    if (argv === 'git rev-parse --verify --quiet HEAD') return ran('f00d\n')
    if (argv.startsWith('git diff --numstat')) {
      const isZ = e.argv.includes('-z')

      return ran(diffs++ === 0 ? '' : isZ ? '1\t0\tcafé.txt\x002\t0\tmy notes/a b.md\x00' : '1\t0\t"caf\\303\\251.txt"\n2\t0\tmy notes/a b.md\n')
    }

    return ran('')
  })
  statAsSpelled(on)
  on('fs.read', () => ({ value: 'one\n' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'fmt', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fmt', turnId: 't1' })
  await call($, 'Bash', 'b1', { command: 'bun run fmt' })

  const rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}café\.txt +\+1 {7}■+$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}my notes\/a b\.md +\+2 {7}■+$/))

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: 'file:café.txt' })
  await ui.redraw()
  await ui.press({ key: 'key-b' })
  await ui.press({ key: 'key-1' })
  await ui.unmount()
  expect(asked).toContain('git diff HEAD -- café.txt')
})

test('8.6: a file over the diff budget opens to its note in place of the diff; `n` and Escape still work from it', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  // A shell rewrites all 600 lines of big.txt (over the 500-line budget) and one line of small.txt.
  const lines = (word: string) => Array.from({ length: 600 }, (_, i) => `${word} ${i}`).join('\n')
  let big = lines('old')
  let small = 'one\ntwo\n'
  let diffs = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return ran('/repo\n')
    if (argv === 'git rev-parse --show-prefix') return ran('\n')
    if (argv === 'git rev-parse --verify --quiet HEAD') return ran('f00d\n')
    if (argv.startsWith('git diff --numstat')) return ran(diffs++ === 0 ? '' : '600\t600\tbig.txt\x001\t1\tsmall.txt\0')

    return ran('')
  })
  statAsSpelled(on)
  on('fs.read', (_, e) => ({ value: e.path.endsWith('big.txt') ? big : small }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'rewrite', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'rewrite', turnId: 't1' })
  await call($, 'Bash', 'b1', { command: 'gen > big.txt; fix > small.txt' })
  big = lines('new')
  small = 'one\nTWO\n'

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  const shown = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text.trimEnd())
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: 'file:big.txt' })
  await ui.redraw()
  expect(await shown()).toContainEqual('  no diff · over 500 changed lines')

  // `n`: the next file's diff, its hunk drawn and no note.
  await ui.press({ key: 'key-n' })
  await ui.redraw()
  const next = await shown()
  expect(next).toContainEqual(expect.stringMatching(/^ {2}small\.txt +\+1 −1  ·  1 hunk$/))
  expect(next.some(r => r.includes('no diff'))).toBe(false)

  // Back to the note, then Escape: the engine hands the keyboard back, and the pane draws its timeline, no note.
  await ui.press({ key: 'key-b' })
  await ui.press({ key: 'file:big.txt' })
  await ui.redraw()
  expect(await shown()).toContainEqual('  no diff · over 500 changed lines')
  await ui.unmount()
  const after = await $.ui.mount(PANE)
  expect((await after.findAll({ type: 'Text' })).some(t => t.text.includes('no diff'))).toBe(false)
  await after.unmount()
})

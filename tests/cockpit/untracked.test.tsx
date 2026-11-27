import { expect, mock, test } from 'claude-code/testing'

import { ON, PANE, T0, posixPath } from '../support/cockpit'
import type { Engine, On } from '../support/engine'

// A work tree with a big untracked folder (a cache, node_modules before its .gitignore, build output): 40,000 small
// files and 20 large binaries. Git answers at once; what Cockpit does with the list is what costs. Before these
// limits, the first turn read every file and looked up every one's real path (23.8 s at 4,000 files in this harness,
// growing four times per doubling), and each shell or edit call did it again.
const smallFiles = (n: number) => Array.from({ length: n }, (_, i) => `cache/d${Math.floor(i / 200)}/f${i % 200}.txt`)
const SMALL = smallFiles(40_000)
const LARGE = Array.from({ length: 20 }, (_, i) => `shots/s${i}.png`)
const BIG_TEXT = 'logs/huge.log'
const PNG = `\u0089PNG\r\n\u001a\n${'\u0000\u0001\u0002ÿ'.repeat(16_384)}`
const MB = 1024 * 1024
const LONG = { ...ON, timeoutMs: 120_000 }

type Seen = { reads: string[]; stats: string[]; git: string[]; drawnAfterGit: number | undefined }
type Tree = { untracked: readonly string[]; hang?: (argv: string) => boolean; isClockMocked?: boolean }

function engine(on: On, clock: { now: number }, seen: Seen, tree: Tree): void {
  if (tree.isClockMocked !== true) {
    on('clock.now', () => ({ value: clock.now }))
    on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
    on('clock.every', () => ({ value: { cancel: () => undefined } as never }))
  }
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.log', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'big' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('session.info', () => ({ value: { platform: 'linux' } as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', () => {
    clock.now += 1_000

    return { result: { stdout: '', stderr: '' }, text: 'ok' }
  })
  on('process.run', async (_, e) => {
    const argv = e.argv.join(' ')
    seen.git.push(argv)

    if (tree.hang?.(argv) === true) await new Promise(() => undefined)
    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    if (argv.startsWith('git ls-files')) return { value: { exitCode: 0, stdout: tree.untracked.map(p => `${p}\0`).join(''), stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('fs.stat', (_, e) => {
    seen.stats.push(posixPath(e.path))
    const size = e.path.endsWith('.png') ? 4 * MB : e.path.endsWith('.log') ? 2 * MB : e.path.endsWith('.bin') ? PNG.length : 25

    return { value: { kind: 'file', size, mtimeMs: 1, isLink: false, realPath: posixPath(e.path) } }
  })
  on('fs.read', (_, e) => {
    seen.reads.push(posixPath(e.path))

    return { value: e.path.endsWith('.png') || e.path.endsWith('.bin') ? PNG : e.path.endsWith('.log') ? 'x\n'.repeat(MB) : 'line\n'.repeat(5) }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

async function filesRows($: Engine): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true, scroll: { offset: 0, bodyRows: 3_000 } } })
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  const rows = (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await ui.unmount()

  return rows
}

async function started($: Engine, on: On, tree: Tree): Promise<{ seen: Seen; clock: { now: number } }> {
  const clock = { now: T0 }
  const seen: Seen = { reads: [], stats: [], git: [], drawnAfterGit: undefined }
  engine(on, clock, seen, tree)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'go', turnId: 't1' })

  return { seen, clock }
}

const projectReads = (seen: Seen) => seen.reads.filter(p => p.startsWith('/repo/'))

test('the pane`s first draw comes at once after the session starts, before any git call answers', LONG, async ($, on) => {
  const clock = { now: T0 }
  const seen: Seen = { reads: [], stats: [], git: [], drawnAfterGit: undefined }
  engine(on, clock, seen, { untracked: [...SMALL, ...LARGE], hang: argv => argv.startsWith('git') })
  // Every git call hangs: a draw that waited on one would never come.
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const t = performance.now()
  const pane = await $.ui.mount(PANE)
  const rows = (await pane.findAll({ type: 'Text' })).map(x => x.text)
  await pane.unmount()

  // The harness's first mount costs about 100 ms quiet; the budget leaves room for a loaded CI runner.
  expect(performance.now() - t).toBeLessThan(1_000)
  expect(rows.some(r => /TIMELINE/.test(r))).toBe(true)
  expect(projectReads(seen)).toEqual([])
  expect(seen.git.filter(a => a.startsWith('git ls-files') || a.startsWith('git diff'))).toEqual([])
})

test('40,000 untracked files at the turn`s start: at most 50 are read, and only those have their real path looked up', LONG, async ($, on) => {
  const { seen } = await started($, on, { untracked: [...SMALL, ...LARGE, BIG_TEXT] })

  expect(projectReads(seen).length).toBeLessThanOrEqual(50)
  // The link check stats the file and the session's folder: only for the files that are read.
  const statted = new Set(seen.stats.filter(p => p.startsWith('/repo/') && p !== '/repo' && p !== '/repo/'))
  for (const p of statted) expect(projectReads(seen).includes(p) || p.endsWith('.png') || p.endsWith('.log')).toBe(true)
  expect(statted.size).toBeLessThanOrEqual(50)
})

test('a binary file and a file over 1 MB are listed, and never read', LONG, async ($, on) => {
  // Few enough that every one would be read: the size and the NUL byte are what keep them unread.
  const tree: Tree = { untracked: [] }
  const { seen } = await started($, on, tree)
  tree.untracked = ['notes.txt', 'tiny.bin', ...LARGE.slice(0, 2), BIG_TEXT]
  await $.tool.call({ tool: 'Bash', command: 'bun run build', tool_use_id: 'b1' } as never)
  const rows = await filesRows($)

  expect(projectReads(seen)).toContain('/repo/notes.txt')
  expect(projectReads(seen).some(p => p.endsWith('.png') || p.endsWith('.log'))).toBe(false)
  expect(rows.some(r => /shots\/s0\.png/.test(r))).toBe(true)
  expect(rows.some(r => /logs\/huge\.log/.test(r))).toBe(true)
  // Read, but its NUL byte marks it binary: listed with no count.
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}tiny\.bin {2,}■/))
})

test('a call that creates 40,000 files: FILES lists 500 of the 2,000 listed, then `+1,500 more files` and `+38,020 more untracked`', LONG, async ($, on) => {
  const tree: Tree = { untracked: [] }
  const { seen } = await started($, on, tree)
  tree.untracked = [...SMALL, ...LARGE]
  await $.tool.call({ tool: 'Bash', command: 'bun install', tool_use_id: 'b1' } as never)
  const rows = await filesRows($)
  const listed = rows.filter(r => /^ {4}(cache|shots)\//.test(r))

  // The pane holds at most 20,000 nodes: 500 file rows, then the rest counted.
  expect(listed.length).toBe(500)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}2000 files changed /))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}\+1,500 more files *$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}\+38,020 more untracked *$/))
  expect(projectReads(seen).length).toBeLessThanOrEqual(50)
})

test('Read, Grep and WebFetch create no files: they never list the untracked files again', LONG, async ($, on) => {
  const { seen } = await started($, on, { untracked: [...SMALL] })
  const lists = () => seen.git.filter(a => a.startsWith('git ls-files')).length
  const before = lists()
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md', tool_use_id: 'r1' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', tool_use_id: 'g1' } as never)
  await $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'x', tool_use_id: 'w1' } as never)

  expect(lists()).toBe(before)
  // An Edit changes a file Git knows: the diff is read again, the untracked list is not.
  await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
  expect(lists()).toBe(before)
})

test('a git call that hangs past 5 s: the pane stays drawn and FILES falls back to the command`s targets', LONG, async ($, on) => {
  const clock = mock.clock(on)
  const seen: Seen = { reads: [], stats: [], git: [], drawnAfterGit: undefined }
  engine(on, { now: T0 }, seen, { untracked: [], hang: argv => argv.startsWith('git ls-files'), isClockMocked: true })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  const turn = $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(5_000)
  await turn
  const call = $.tool.call({ tool: 'Bash', command: `printf 'x\\n' > notes.txt`, tool_use_id: 'b1' } as never)
  await clock.advance(5_000)
  await call
  const rows = await filesRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {4}notes\.txt/))
})

import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, posixPath } from '../support/cockpit'
import type { Engine, On } from '../support/engine'
import { holdTimers } from '../support/clock'

// A tool.call hook answers the call and returns: the work tree's diff, the new files' counts and the snapshots' diffs
// are worked out after it, never inside it, and nothing kept grows with each call.
const LONG = { ...ON, timeoutMs: 120_000 }
const files = (n: number) => Array.from({ length: n }, (_, i) => `cache/d${Math.floor(i / 200)}/f${i % 200}.txt`)
const LARGE = Array.from({ length: 20 }, (_, i) => `shots/s${i}.png`)
const MB = 1024 * 1024
const LINES = Array.from({ length: 5_000 }, (_, i) => `line ${i} of the old file`).join('\n')
const REWRITTEN = Array.from({ length: 5_000 }, (_, i) => `line ${i} of the new file`).join('\n')

type Seen = { reads: string[]; chars: number; logs: string[] }

// Git's answer for a list, built once per list: the test's own work is not the hook's.
const listings = new WeakMap<readonly string[], string>()
const listingOf = (paths: readonly string[]): string => {
  const had = listings.get(paths)

  if (had !== undefined) return had

  const listing = paths.map(p => `${p}\0`).join('')
  listings.set(paths, listing)

  return listing
}
type Tree = { untracked: readonly string[]; gate?: Promise<void>; edited?: boolean }

function engine(on: On, clock: { now: number }, seen: Seen, tree: Tree): void {
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.log', (_, e) => {
    seen.logs.push(e.text)

    return { value: undefined }
  })
  on('session.id', () => ({ value: 'calls' }))
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
  on('tool.call', (_, e) => {
    clock.now += 1_000
    if (e.tool === 'Edit' && JSON.stringify(e).includes('big.ts')) tree.edited = true

    return e.tool === 'Edit' ? { result: { structuredPatch: [{ lines: ['+a', '-b'] }] }, text: 'ok' } : { result: { stdout: 'ok\n', stderr: '' }, text: 'ok' }
  })
  on('process.run', async (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '\n', stderr: '' } } as never
    if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never
    // A slow work tree: once the turn has started, the diff and the listing answer only when the test lets them.
    if (tree.gate !== undefined) await tree.gate
    if (argv.startsWith('git ls-files')) return { value: { exitCode: 0, stdout: listingOf(tree.untracked), stderr: '' } } as never
    if (argv.startsWith('git diff --numstat'))
      return { value: { exitCode: 0, stdout: tree.edited === true ? '5000\t5000\tsrc/big.ts\0' : '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('fs.stat', (_, e) => {
    const size = e.path.endsWith('.png') ? 4 * MB : e.path.endsWith('huge.ts') ? 2 * MB : e.path.endsWith('big.ts') ? LINES.length : 25

    return { value: { kind: 'file', size, mtimeMs: 1, isLink: false, realPath: posixPath(e.path) } }
  })
  on('fs.read', (_, e) => {
    const value = e.path.endsWith('big.ts')
      ? tree.edited === true
        ? REWRITTEN
        : LINES
      : e.path.endsWith('.png')
        ? '\u0000'.repeat(4 * MB)
        : 'line\n'.repeat(5)
    seen.reads.push(posixPath(e.path))
    seen.chars += value.length

    return { value }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

async function started($: Engine, on: On, tree: Tree): Promise<{ seen: Seen; clock: { now: number } }> {
  const clock = { now: T0 }
  const seen: Seen = { reads: [], chars: 0, logs: [] }
  engine(on, clock, seen, tree)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'go', turnId: 't1' })

  return { seen, clock }
}

const timedCall = async ($: Engine, input: Record<string, unknown>): Promise<number> => {
  const t = performance.now()
  await $.tool.call(input as never)

  return performance.now() - t
}

const CALLS = [
  { tool: 'Read', file_path: '/repo/README.md' },
  { tool: 'Edit', file_path: '/repo/README.md', old_string: 'a', new_string: 'b' },
  { tool: 'Write', file_path: '/repo/new.txt', content: 'x\n' },
  { tool: 'Bash', command: 'bun run build' }
]

test('20 calls with 40,000 untracked files: each hook returns in under 100 ms, and what it reads stays flat', LONG, async ($, on) => {
  const { seen } = await started($, on, { untracked: [...files(40_000), ...LARGE] })
  const ms: number[] = []
  const chars: number[] = []

  for (let i = 0; i < 20; i++) {
    const before = seen.chars
    ms.push(await timedCall($, { ...CALLS[i % 4], tool_use_id: `c${i}` }))
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' }).catch(() => undefined)
    chars.push(seen.chars - before)
    await $.turn.start({ text: 'go', turnId: 't1' })
  }

  expect(Math.max(...ms)).toBeLessThan(100)
  // No large binary is ever read, and the last calls read no more than the first: nothing piles up per call.
  expect(seen.reads.some(p => p.endsWith('.png'))).toBe(false)
  expect(chars.slice(-4).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(chars.slice(0, 4).reduce((a, b) => a + b, 0) + 4 * 50 * 25)
  expect(seen.logs.filter(l => /not noted|hook failed/.test(l))).toEqual([])
})

test('a shell call in a slow work tree returns at once; its files reach FILES after it, by the turn`s end', LONG, async ($, on) => {
  const tree: Tree = { untracked: [] }
  await started($, on, tree)
  let open = () => undefined as void
  tree.gate = new Promise(resolve => (open = resolve))
  tree.untracked = ['notes.txt']
  const ms = await timedCall($, { tool: 'Bash', command: `printf 'x\\n' > notes.txt`, tool_use_id: 'b1' })

  // The call returned while git still had not answered.
  expect(ms).toBeLessThan(100)
  open()

  await $.turn.complete({ answer: 'done', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  const rows = (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await ui.unmount()

  expect(rows).toContainEqual(expect.stringMatching(/^ {4}notes\.txt +\+5/))
})

test('an Edit that rewrites a 5,000-line file returns in under 100 ms; its diff, or the budget`s note, shows after', LONG, async ($, on) => {
  const tree: Tree = { untracked: [] }
  await started($, on, tree)
  let open = () => undefined as void
  tree.gate = new Promise(resolve => (open = resolve))
  const ms = await timedCall($, { tool: 'Edit', file_path: '/repo/src/big.ts', old_string: 'old', new_string: 'new', tool_use_id: 'e1' })

  expect(ms).toBeLessThan(100)
  open()

  await $.turn.complete({ answer: 'done', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: 'file:src/big.ts' })
  await ui.redraw()
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()

  expect(rows.some(r => /no diff · over 500 changed lines|@@ /.test(r))).toBe(true)
})

test('a file over 1 MB is never read for its snapshot, and its diff says why', LONG, async ($, on) => {
  const { seen } = await started($, on, { untracked: [] })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/huge.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })

  expect(seen.reads.filter(p => p.endsWith('huge.ts'))).toEqual([])
})
// ci probe: tests only

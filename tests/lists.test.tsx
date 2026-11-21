import { expect, test } from 'claude-code/testing'

import { stepOf } from '../hooks/transcript/activity/steps'
import { foldRow, foldSummary } from '../hooks/transcript/activity/fold'
import { splitBlocks } from '../hooks/transcript/blocks/split'
import { parseCited } from '../hooks/transcript/research/cites'
import { partsWidth } from '../hooks/shared/parts'

const VIEW = { columns: 120, rows: 40 }
const OK = { isRunning: false, isErrored: false, isInterrupted: false }

const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never

/** Every visible line of a reply's own blocks (the one-Text-per-block holders). */
async function linesOf(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' }))
    .filter(t => t.props['wrap'] === 'wrap')
    .flatMap(t => t.text.split('\n'))
    .map(l => l.trimEnd())
}

// ─── 1. Lists ─────────────────────────────────────────────────────────────────

test('lists parse: bullets and numbers, nesting by 2, a short title line, wrapped items continue', async () => {
  const [b] = splitBlocks('**Test runs**\n- normal runs, 3 times\n  - nested `one`\n- with the\n  timezone changed\n1. first\n10. tenth')
  expect(b?.kind).toBe('list')
  if (b?.kind !== 'list') throw new Error('not a list')
  expect(b.title).toBe('Test runs')
  expect(b.items.map(i => [i.depth, i.marker, i.text])).toEqual([
    [0, '·', 'normal runs, 3 times'],
    [1, '·', 'nested `one`'],
    [0, '·', 'with the timezone changed'],
    [0, '1.', 'first'],
    [0, '10.', 'tenth']
  ])

  const plain = splitBlocks("Why it's close to the limit\n- a")[0]
  expect(plain?.kind === 'list' ? plain.title : undefined).toBe("Why it's close to the limit")
  // A sentence above a list is not a title: the engine keeps the block.
  expect(splitBlocks('I changed these three files today, one at a time.\n- a')[0]?.kind).toBe('markdown')
})

test('a list draws `·` and numbers muted, a hanging indent, chips and bright bold; the title as a heading', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const long = 'this item is long enough that it has to wrap onto a second line under its own text, not under the marker'
  const text = `**Why it's close**\n- the limit is \`5000 ms\` per test\n- **slower** now: ${long}\n  - nested one\n2. numbered`
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text, isFirstOfReply: false }
  })
  const lines = await linesOf(ui)
  expect(lines[0]).toBe("Why it's close")
  expect(lines[1]).toBe('· the limit is  5000 ms  per test')
  expect(lines[2]?.startsWith('· slower now: this item is long')).toBe(true)
  expect(lines[3]?.startsWith('  ')).toBe(true) // hangs under the text, two cells in
  expect(lines[3]?.[2]).not.toBe(' ')
  expect(lines.some(l => l.startsWith('  · nested one'))).toBe(true)
  expect(lines.some(l => l.startsWith('2. numbered'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^ 5000 ms $/ })).toBeDefined() // the chip
  expect((await ui.find({ type: 'Text', text: /^slower$/ }))?.props['weight']).toBe('bold')
  expect((await ui.find({ type: 'Text', text: /^Why it's close$/ }))?.props['weight']).toBe('bold')
  expect((await ui.find({ type: 'Text', text: /^· $/ }))?.props['color']).toBe('#686874')
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.unmount()
})

test('a list streams stable: a finished item never re-lays out, a half-written last item never sends the list to the engine', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const FULL = [
    '**Findings**',
    '- the suite passes **three** times in a row on a quiet machine with `bun test`',
    '- under load one test times out at [5 s](https://github.com/anthropics/claude-code/issues/108931) because each redraw reads more state',
    '- nested:',
    '  - a probe showed the card cache does not leak between tests',
    '- the fix is a per-test `timeoutMs` or cheaper redraws'
  ].join('\n')
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: FULL.slice(0, 20), isFirstOfReply: false }
  })
  let prev: string[] = []

  for (let cut = 25; ; cut = Math.min(FULL.length, cut + 7)) {
    await ui.redraw({ text: FULL.slice(0, cut), isFirstOfReply: false })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    const lines = await linesOf(ui)
    // Every item but the last (the one being written), and the title, hold still.
    const itemStarts = prev.flatMap((l, i) => (/^\s*· /.test(l) ? [i] : []))
    const settled = prev.slice(0, itemStarts[itemStarts.length - 1] ?? 1)
    expect(lines.slice(0, settled.length)).toEqual(settled)
    prev = lines.filter(l => !l.startsWith('┄┄┄┄'))
    if (cut === FULL.length) break
  }
  await ui.unmount()
})

// ─── 2. Footnotes everywhere ─────────────────────────────────────────────────

test('bare URLs, `(https://…)` and `owner/repo#123 (https://…)` become markers; code keeps its URL', async () => {
  const n = new Map<string, number>()
  const a = parseCited('Same report in anthropics/claude-code#108931 (https://github.com/anthropics/claude-code/issues/108931).', n)
  expect(a?.runs.map(r => r.t).join('')).toBe('Same report in anthropics/claude-code#108931¹.')
  const b = parseCited('Bun has a 5000 ms default (https://bun.com/docs/test/runtime-behavior), see https://bun.sh/guides/test/timeout.md.', n)
  expect(b?.runs.map(r => r.t).join('')).toBe('Bun has a 5000 ms default², see bun.sh · timeout³.')
  expect(b?.cites.map(c => c.url)).toEqual(['https://bun.com/docs/test/runtime-behavior', 'https://bun.sh/guides/test/timeout.md'])
  expect(parseCited('run `curl https://x.dev/a` first', new Map())).toBe(undefined) // the only URL is code
})

test('a list item with a link gets its marker; the list gets one footnote line under it', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const text = '- see anthropics/claude-code#108931 (https://github.com/anthropics/claude-code/issues/108931)\n- and https://bun.com/docs/test'
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text, isFirstOfReply: false }
  })
  expect(await ui.find({ type: 'Text', text: /^¹$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^²$/ })).toBeDefined()
  // The labels alone: no engine Link (its fallback appends the raw URL), no raw URL.
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /^claude-code#108931$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /https:\/\// })).toBeUndefined()
  await ui.unmount()
})

// ─── 3. Fold row ─────────────────────────────────────────────────────────────

test('fold row: a long time is never clipped; unknown tools read `N other`', async () => {
  expect(foldSummary(['Mystery', 'Mystery', 'Read'])).toBe('2 other, 1 read')
  const row = foldRow({ isAnchor: true, count: 9, summary: '9 reads', failed: 0, wall: 72_000 }, 96)
  expect(row.map(p => p.t).join('')).toMatch(/ 1m 12s$/)
  expect(partsWidth(row)).toBe(96)
  const hour = foldRow({ isAnchor: true, count: 9, summary: '9 reads', failed: 0, wall: 3_900_000 }, 60)
  expect(hour.map(p => p.t).join('')).toMatch(/1h 05m$/)
})

// ─── 4. Permission denials ───────────────────────────────────────────────────

test('a call the permission system refused is `✕ denied` in red, with no detail line', async () => {
  const msg = 'Permission to use Bash with command rm -rf ab has been denied.'
  const step = stepOf('Bash', { command: 'rm -rf ab' }, msg, { ...OK, isErrored: true })
  expect(step?.dot).toEqual({ text: '✕', color: '#ec84a0' })
  expect(step?.result).toEqual([{ text: 'denied', color: '#ec84a0' }])
  expect(step?.detail).toBe(undefined)
})

// ─── 5. Narration ────────────────────────────────────────────────────────────

test('narration: prose a tool call follows is dim; the final answer and plain Q&A are normal', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.session.append(respond([{ type: 'text', text: 'Reading the config first.' }], 'a'))
  await $.session.append(respond([{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'a' } }], 'b'))
  await $.session.append(respond([{ type: 'text', text: 'Fixed. The **config** was wrong.' }], 'c'))

  const color = async (text: string) => {
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: VIEW,
      props: { text, isFirstOfReply: true }
    })
    // The coloured spans, not the line Text that holds them.
    const spans = (await ui.findAll({ type: 'Text' })).filter(t => t.props['color'] !== undefined)
    const found = spans.find(t => /^(Reading|Fixed\.)$/.test(t.text)) // one span per word
    const bold = spans.find(t => t.text === 'config')
    await ui.unmount()
    return [found?.props['color'], bold?.props['color']]
  }

  expect((await color('Reading the config first.'))[0]).toBe('#4e4e5a')
  expect(await color('Fixed. The **config** was wrong.')).toEqual(['#b2b2bc', '#ececf1'])

  await $.turn.start({ text: 'q', turnId: 't2' })
  await $.session.append(respond([{ type: 'text', text: 'Reading a worktree is like a branch.' }], 'd'))
  expect((await color('Reading a worktree is like a branch.'))[0]).toBe('#b2b2bc')
})

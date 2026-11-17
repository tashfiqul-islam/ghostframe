import { expect, test } from 'claude-code/testing'

import { layoutStep, stepOf } from '../hooks/activity'
import { INSET, layout, vw } from '../hooks/grid'
import { footnoteLines, sourcesFrame } from '../hooks/research'
import { spansOf } from '../hooks/prose'
import { partsWidth } from '../hooks/states'
import { shippedFrame, testsFrame } from '../hooks/outcome'
import { browserTop, urlBar } from '../hooks/browser'

const OK = { isRunning: false, isErrored: false, isInterrupted: false }
const WIDTHS = [90, 70, 50] as const

const respond = (content: unknown[], uuid: string) => ({
  message: { type: 'assistant', role: 'assistant', content },
  door: 'response',
  origin: { kind: 'model' },
  uuid
}) as never

/** Every row the mod drew: its one-line Texts, and each line of its block Texts. */
async function rows(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  const texts = await ui.findAll({ type: 'Text' })

  return texts
    .filter(t => t.props.wrap === 'truncate' || t.props.wrap === 'wrap')
    .flatMap(t => t.text.split('\n'))
    // A rule's filler: a long ┄ run in a one-row, overflow-hidden box, cut to its room.
    .filter(l => !/^┄{100,}$/.test(l))
}

// ─── Part A ──────────────────────────────────────────────────────────────────

test('footnotes: every marker a block uses is listed, on more lines rather than fewer markers', async () => {
  const cites = [1, 2, 3, 4].map(n => ({ n, url: `https://example.dev/a/long/path/number/${n}`, title: `t${n}` }))
  for (const width of [96, 48, 30]) {
    const lines = footnoteLines(cites, width)
    const text = lines.map(l => l.map(p => p.t).join(''))
    for (const l of lines) expect(partsWidth(l)).toBeLessThanOrEqual(width)
    for (const m of ['¹', '²', '³', '⁴']) expect(text.join('\n')).toContain(m)
    expect(text.join('\n')).not.toContain('https://')
  }
  expect(footnoteLines(cites, 96)).toHaveLength(1)
  expect(footnoteLines(cites, 30).length).toBeGreaterThan(1)
})

test('footnotes: a list lists its own ³ even when a later paragraph reuses it', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const text = [
    '**Options**',
    '- one [a](https://bun.com/docs/test/runtime-behavior) with `timeoutMs`; ok',
    '- two [b](https://bun.sh/guides/test/timeout.md)',
    '- three [c](https://github.com/anthropics/claude-code/issues/108931)',
    '',
    'Background: https://github.com/anthropics/claude-code/issues/108931'
  ].join('\n')
  const ui = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'AssistantMessage', viewport: { columns: 120, rows: 40 }, props: { text, isFirstOfReply: false } })
  const notes = (await rows(ui)).filter(l => l.startsWith('┄┄┄┄'))
  expect(notes).toHaveLength(2)
  expect(notes[0]).toMatch(/¹ .*² .*³ /)
  expect(notes[1]).toMatch(/^┄┄┄┄ ³ claude-code#108931/)
  await ui.unmount()
})

test('chips: tight against punctuation, padded before a space and at the end', async () => {
  const t = (runs: { t: string; s: 'plain' | 'code' }[]) => spansOf(runs, '#b2b2bc').map(s => s.t).join('')
  expect(t([{ t: 'set ', s: 'plain' }, { t: 'timeoutMs', s: 'code' }, { t: '; ok', s: 'plain' }])).toBe('set  timeoutMs; ok')
  expect(t([{ t: 'took ', s: 'plain' }, { t: '1m 12s', s: 'code' }, { t: ', then', s: 'plain' }])).toBe('took  1m 12s, then')
  expect(t([{ t: 'run ', s: 'plain' }, { t: 'bun test', s: 'code' }, { t: ' now', s: 'plain' }])).toBe('run  bun test  now')
  expect(t([{ t: 'run ', s: 'plain' }, { t: 'bun test', s: 'code' }])).toBe('run  bun test ')
})

test('the hot-reload note is one short line', async ($, on) => {
  // Beneath the mod: what reaches the store.
  const kept: string[] = []
  on('session.append', (_, e, next) => {
    const c = (e.message as { content: unknown }).content
    kept.push(Array.isArray(c) ? String((c[0] as { text?: unknown }).text) : String(c))
    return next(e)
  })
  const note = (text: string, uuid: string) =>
    $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] }, door: 'notice', origin: { kind: 'engine' }, uuid } as never)

  await note('graticule: reloaded (13 hooks: ui.render, session.start, tool.call)', 'n1')
  await note('something else', 'n2')
  expect(kept).toEqual(['graticule reloaded · 13 hooks', 'something else'])
})

// ─── Part B: narrow terminals ────────────────────────────────────────────────

test('layout: under 100 columns the gutter folds to a 2-column inset at full width', async () => {
  expect(layout(120)).toEqual({ width: 96, gutter: 12, narrow: false })
  expect(layout(100)).toEqual({ width: 86, gutter: 12, narrow: false })
  for (const c of WIDTHS) expect(layout(c)).toEqual({ width: c - INSET, gutter: INSET, narrow: true })
})

test('narrow step rows: verb and target, result and time right; the time goes before the target clips', async () => {
  const step = stepOf('Bash', { command: 'claude plugin test .', description: 'Run the plugin tests for the graticule mod' }, { stdout: ' 56 pass\n 0 fail', stderr: '' }, OK)
  if (step === undefined) throw new Error('no step')
  for (const c of WIDTHS) {
    const w = c - INSET
    const l = layoutStep(step, '1m 12s', w)
    expect(2 + vw(l.verb) + vw(l.target) + vw(l.gap) + vw('56 pass') + vw(l.timeCell)).toBe(w)
  }
  expect(layoutStep(step, '1m 12s', 88).timeCell).toMatch(/1m 12s$/)
  const tight = layoutStep(step, '1m 12s', 34)
  expect(tight.timeCell).toBe('') // dropped first
  expect(tight.target.length).toBeGreaterThan(0)
})

test('narrow frames go full width, every row exactly the content width', async () => {
  for (const c of WIDTHS) {
    const w = c - INSET
    const frames = [
      testsFrame(w, { id: 'x', runner: 'claude plugin test', passed: 145, failed: 3, skipped: 2 }, { id: 'w', runner: 'claude plugin test', passed: 140, failed: 8, skipped: 2 }, 72_000),
      shippedFrame(w, { id: 'x', commit: { sha: 'a1b2c3d', subject: 'fix(toast): dedupe by message key across the queue', files: 3, adds: 48, dels: 12 }, pr: { n: 148, url: 'https://github.com/me/app/pull/148', head: 'feature/toast-rebuild', base: 'main' } }),
      sourcesFrame([1, 2, 3, 4, 5].map(n => ({ n, url: `https://docs.example.dev/${'deep/'.repeat(8)}${n}`, title: `A rather long source title ${n}` })), w),
      [browserTop(w, 'playwright'), urlBar(w, 'http://localhost:5173/products?page=6&mode=lunar', { t: '●', color: '' }, '0.4s')]
    ]
    for (const lines of frames) for (const l of lines) expect(partsWidth(l)).toBe(w)
  }
})

for (const columns of WIDTHS) {
  test(`at ${columns} columns: captions above blocks, no row wider than the screen`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('tool.call', () => ({ result: { stdout: ' 145 pass\n 3 fail', stderr: '', interrupted: false } }))
    const VIEW = { columns, rows: 40 }
    const w = columns - INSET

    await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'run the tests' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'p' } as never)
    await $.turn.start({ text: 'run the tests', turnId: 't1' })
    await $.session.append(respond([{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'claude plugin test .', description: 'Run the plugin tests' } }], 'r1'))
    await $.tool.call({ tool: 'Bash', command: 'claude plugin test .', description: 'Run the plugin tests', tool_use_id: 'b1' } as never)

    // Your message: `you` on its own caption line, the text inset 2.
    const you = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'UserMessage', viewport: VIEW, props: { text: 'Run the tests and tell me which fail, with a long enough line to wrap at fifty columns.', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await you.find({ type: 'Text', text: /^you$/ })).toBeDefined()
    expect((await you.findAll({ type: 'Box' })).some(b => b.props.paddingLeft === INSET)).toBe(true)
    for (const l of await rows(you)) expect(vw(l)).toBeLessThanOrEqual(w)
    await you.unmount()

    // The step row and its card.
    const row = await $.ui.mount({
      plugin: 'graticule', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
      props: { tool_use_id: 'b1', tool: 'Bash', input: { command: 'claude plugin test .', description: 'Run the plugin tests' }, isRunning: false, isErrored: true, isInterrupted: false, output: 'Exit code 1\n 145 pass\n 3 fail' }
    })
    expect(await row.find({ type: 'Text', text: /^claude$/ })).toBeDefined()
    for (const l of await rows(row)) expect(vw(l)).toBeLessThanOrEqual(w)
    await row.unmount()

    const card = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props: { tool_use_id: 'b1', tool: 'Bash', isErrored: true, output: 'Exit code 1' } })
    const cardRows = (await rows(card)).filter(l => /^[+┆]/.test(l))
    expect(cardRows.length).toBeGreaterThan(3)
    for (const l of cardRows) expect(vw(l)).toBe(w)
    await card.unmount()

    // Prose with a list, chips and footnotes; a table too wide for the screen.
    const reply = [
      'Three fail; the cause is the `timeoutMs`, see https://bun.com/docs/test/runtime-behavior.',
      '',
      '**Failing**',
      '- `a reply taller than the window`: times out at 5 s under load (https://github.com/anthropics/claude-code/issues/108931)',
      '  - only under CPU load',
      '',
      '| Test | File | Time | Cause | Fix | Owner |',
      '|---|---|---|---|---|---|',
      '| stream | stream-stable.test.tsx | 5.1 s | timeout | timeoutMs | me |'
    ].join('\n')
    await $.session.append(respond([{ type: 'text', text: reply }], 'r2'))
    const prose = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: reply, isFirstOfReply: true } })
    expect(await prose.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    const lines = await rows(prose)
    for (const l of lines) expect(vw(l)).toBeLessThanOrEqual(w)
    expect(lines.some(l => l.startsWith('┄┄┄┄ ¹'))).toBe(true)
    expect(lines.join('\n')).not.toContain('https://')
    if (columns === 50) expect(lines.some(l => /columns? hidden/.test(l))).toBe(true)
    await prose.unmount()
  })
}

test('narrow streaming: a reply streamed at 70 columns never repeats a line, finished blocks never change', async $ => {
  const FULL = [
    'The suite passes on a quiet machine; under load one test times out at 5 s.',
    '',
    '**Why**',
    '- each redraw reads more state than before, see anthropics/claude-code#108931 (https://github.com/anthropics/claude-code/issues/108931)',
    '- the kit gives every test 5000 ms unless it sets `timeoutMs`',
    '',
    'Raising that one test to 15 s is the quick fix; making redraws cheaper is the real one.'
  ].join('\n')
  const ui = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'AssistantMessage', viewport: { columns: 70, rows: 40 }, props: { text: FULL.slice(0, 30), isFirstOfReply: false } })
  let prevBlocks: string[][] = []

  for (let cut = 40; ; cut = Math.min(FULL.length, cut + 9)) {
    await ui.redraw({ text: FULL.slice(0, cut), isFirstOfReply: false })
    const blocks = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'wrap').map(t => t.text.split('\n'))
    const all = blocks.flat().filter(l => l.trim().length > 0)
    expect(new Set(all).size).toBe(all.length)
    for (const l of all) expect(vw(l)).toBeLessThanOrEqual(68)
    for (let i = 0; i < prevBlocks.length - 1; i++) expect(blocks[i]).toEqual(prevBlocks[i])
    prevBlocks = blocks
    if (cut === FULL.length) break
  }
  await ui.unmount()
})

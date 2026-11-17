import { expect, test } from 'claude-code/testing'

import { stepOf, foldRow } from '../hooks/activity'
import { splitBlocks } from '../hooks/blocks'
import { C, clip, clipMiddle, vw } from '../hooks/grid'
import { footnoteLines, sourceLabel, sourcesFrame } from '../hooks/research'
import { commandNotice } from '../hooks/states'
import { textAt } from './text'

const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never
const engine = ($: { ui: { resolve: (e: never) => { Text: (p: { children: string }) => unknown } } }, e: never) => $.ui.resolve(e).Text({ children: 'engine' })

// ─── 1. Tokens ───────────────────────────────────────────────────────────────

test('tokens: one small set, the names the design uses; add/del share ok/err', async () => {
  expect(Object.keys(C).toSorted()).toEqual(
    ['accent', 'add', 'bg', 'del', 'dim', 'err', 'hairline', 'link', 'muted', 'ok', 'rule', 'ruleStrong', 'surface', 'text', 'textBright', 'warn'].toSorted()
  )
  expect(C.add).toBe(C.ok)
  expect(C.del).toBe(C.err)
  for (const v of Object.values(C)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  // Every value is distinct apart from the two diff aliases.
  expect(new Set(Object.values(C)).size).toBe(Object.keys(C).length - 2)
})

// ─── 2. Measure ──────────────────────────────────────────────────────────────

for (const [columns, edge] of [
  [140, 12 + 96],
  [120, 12 + 96],
  [110, 12 + 96],
  [90, 90]
] as const) {
  test(`measure at ${columns} columns: turn and footer rules end at ${edge} (gutter + measure; narrow: full)`, async ($, on) => {
    on('ui.render', engine as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_, e) => ({ text: e.answer }))
    await $.turn.start({ text: 'q', turnId: 'm1' })
    await $.turn.complete({ answer: '', durationMs: 3100, isAborted: false, turnId: 'm1', reason: 'answer', usage: { output_tokens: 412 } } as never)

    const foot = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'TurnDuration',
      viewport: { columns, rows: 40 },
      props: { word: 'Baked', durationMs: 3100 }
    })
    const rows = textAt(await foot.drawn(), columns)
    expect(rows[0]).toBe('') // one blank row before the footer rule
    expect(vw(rows[1] ?? '')).toBe(edge)
    expect(rows[1]).toMatch(/ 3s · 412 tokens ┄┄\+$/) // meta right-aligned to the edge
    await foot.unmount()

    const you = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'UserMessage',
      viewport: { columns, rows: 40 },
      props: { text: 'next question', origin: { kind: 'composer' }, isExpanded: false }
    })
    const urows = textAt(await you.drawn(), columns)
    expect(urows[0]).toBe('') // never touching the footer rule above
    expect(vw(urows[1] ?? '')).toBe(edge)
    await you.unmount()
  })
}

// ─── 3. Rhythm ───────────────────────────────────────────────────────────────

test('rhythm: narration and the activity row after it have one blank row between them', async ($, on) => {
  on('ui.render', engine as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { stdout: 'a', stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'x', turnId: 'r1' })
  await $.session.append(respond([{ type: 'tool_use', id: 's0', name: 'Bash', input: { command: 'ls', description: 'list files' } }], 'a0'))
  await $.tool.call({ tool: 'Bash', tool_use_id: 's0', command: 'ls', description: 'list files' } as never)
  await $.session.append(respond([{ type: 'text', text: 'Now checking the queue.' }], 'a1'))
  await $.session.append(respond([{ type: 'tool_use', id: 's1', name: 'Bash', input: { command: 'ls q', description: 'list the queue' } }], 'a2'))
  await $.tool.call({ tool: 'Bash', tool_use_id: 's1', command: 'ls q', description: 'list the queue' } as never)
  await $.session.append(respond([{ type: 'tool_use', id: 's2', name: 'Bash', input: { command: 'ls r', description: 'list the rest' } }], 'a3'))
  await $.tool.call({ tool: 'Bash', tool_use_id: 's2', command: 'ls r', description: 'list the rest' } as never)

  const row = async (id: string, command: string, description: string) => {
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolUse',
      viewport: { columns: 120, rows: 40 },
      props: {
        tool_use_id: id,
        tool: 'Bash',
        input: { command, description },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { stdout: 'a', stderr: '' }
      }
    })
    const rows = textAt(await ui.drawn(), 120)
    await ui.unmount()
    return rows
  }

  const afterNarration = await row('s1', 'ls q', 'list the queue')
  expect(afterNarration[0]).toBe('')
  expect(afterNarration[1]).toMatch(/● shell +list the queue/)
  // The next row in the same run: no blank row.
  const next = await row('s2', 'ls r', 'list the rest')
  expect(next[0]).toMatch(/● shell +list the rest/)
})

test('rhythm: a bulleted list running into a numbered one gets one blank row between', async ($, on) => {
  on('ui.render', engine as never)
  const text = 'Two kinds:\n\n- alpha\n- beta\n1. first\n2. second'
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40 },
    props: { text, isFirstOfReply: false }
  })
  const rows = textAt(await ui.drawn(), 120).map(r => r.trim())
  const beta = rows.indexOf('· beta')
  expect(beta).toBeGreaterThan(0)
  expect(rows[beta + 1]).toBe('')
  expect(rows[beta + 2]).toBe('1. first')
  expect(rows[rows.indexOf('1. first') + 1]).toBe('2. second')
  await ui.unmount()
})

// ─── 4. URLs ─────────────────────────────────────────────────────────────────

test('urls: one label everywhere; link colour on markers and numbers only, labels muted', async () => {
  expect(sourceLabel('https://github.com/anthropics/claude-code/issues/108931')).toBe('claude-code#108931')
  expect(sourceLabel('https://github.com/anthropics/claude-code/pull/12')).toBe('claude-code#12')
  expect(sourceLabel('https://github.com/oven-sh/bun')).toBe('oven-sh/bun')
  expect(sourceLabel('https://www.vitest.dev/guide/cli/')).toBe('vitest.dev · cli')
  expect(sourceLabel('https://bun.sh')).toBe('bun.sh')

  const cites = [
    { n: 1, url: 'https://vitest.dev/guide/cli', title: 'cli' },
    { n: 2, url: 'https://github.com/oven-sh/bun', title: 'bun' }
  ]
  const line = footnoteLines(cites, 96)[0] ?? []
  expect(line.find(p => p.t === '¹ ')?.color).toBe(C.link)
  expect(line.find(p => p.t === 'vitest.dev · cli')?.color).toBe(C.muted)
  expect(line.find(p => p.t === 'oven-sh/bun')?.color).toBe(C.muted)

  const frame = sourcesFrame(
    [1, 2, 3, 4, 5].map(n => ({ n, url: `https://e.dev/docs/p${n}`, title: `page ${n}` })),
    96
  )
  const row = frame[1] ?? []
  expect(row.find(p => p.t.trim() === '1')?.color).toBe(C.link)
  expect(row.find(p => p.t === 'e.dev · p1')?.color).toBe(C.muted)

  const fetch = stepOf(
    'WebFetch',
    { url: 'https://github.com/oven-sh/bun/issues/42', prompt: 'x' },
    { code: 200 },
    { isRunning: false, isErrored: false, isInterrupted: false }
  )
  expect(fetch?.target).toBe('bun#42')
  expect(fetch?.targetColor).toBe(C.muted)

  const table = splitBlocks('| doc | size |\n|---|---:|\n| https://vitest.dev/guide/cli | 12 |\n| [bun docs](https://bun.sh/docs) | 9 |')[0]
  if (table?.kind !== 'table') throw new Error('not a table')
  expect(table.table.rows[0]?.[0]?.runs).toEqual([{ t: 'vitest.dev · cli', s: 'label' }])
  expect(table.table.rows[1]?.[0]?.runs).toEqual([{ t: 'bun.sh · docs', s: 'label' }]) // only a link: its URL label
})

// ─── 5. Result words ─────────────────────────────────────────────────────────

test('result words: always words in state colour, never a bare ✓ or ✗', async () => {
  const OK = { isRunning: false, isErrored: false, isInterrupted: false }
  const ERR = { ...OK, isErrored: true }
  const cases: [string, unknown, unknown, typeof OK, string, string][] = [
    ['WebFetch', { url: 'https://x.dev/a' }, { code: 200 }, OK, '200', C.ok],
    ['Bash', { command: 'bun test' }, { stdout: ' 56 pass\n 0 fail', stderr: '' }, OK, '56 pass', C.ok],
    ['Bash', { command: 'bun test' }, 'Exit code 1\n 50 pass\n 6 fail', ERR, '6 fail', C.err],
    ['Bash', { command: 'ls' }, { stdout: 'a', stderr: '' }, OK, 'ok', C.ok],
    ['Bash', { command: 'make' }, 'Error: Exit code 2\nmake: no rule', ERR, 'exit 2', C.err],
    ['Bash', { command: 'rm x' }, 'Permission to use Bash has been denied.', ERR, 'denied', C.err],
    ['WebSearch', { query: 'q' }, { results: [1, 2, 3] }, OK, '3 results', C.muted],
    ['Edit', { file_path: 'a.ts' }, { filePath: 'a.ts', structuredPatch: [{ lines: ['+a', '+b', '-c'] }] }, OK, '+2 −1', C.add],
    ['Read', { file_path: 'a.ts' }, 'oops', ERR, 'failed', C.err],
    ['Skill', { skill: 'x' }, {}, OK, 'ok', C.ok]
  ]
  for (const [tool, input, output, flags, words, color] of cases) {
    const step = stepOf(tool, input, output, flags)
    expect(`${tool}: ${step?.result.map(r => r.text).join(' ')}`).toBe(`${tool}: ${words}`)
    expect(step?.result[0]?.color).toBe(color)
    expect(step?.result.some(r => /^[✓✗]/.test(r.text))).toBe(false)
  }
  expect(stepOf('Read', { file_path: 'a' }, undefined, { ...OK, isInterrupted: true })?.result[0]?.text).toBe('interrupted')
  expect(
    foldRow({ isAnchor: true, count: 4, summary: '4 reads', failed: 0, wall: 2000 }, 96)
      .map(p => p.t)
      .join('')
  ).toMatch(/ ok +2s$/)
  expect(
    foldRow({ isAnchor: true, count: 4, summary: '4 reads', failed: 2, wall: 2000 }, 96)
      .map(p => p.t)
      .join('')
  ).toContain('2 fail')
})

// ─── 6. Clipping ─────────────────────────────────────────────────────────────

test('clipping: prose at a word boundary, never punctuation before …; paths keep middle-clipping', async () => {
  expect(clip('The queue dedupes by key, then flushes', 20)).toBe('The queue dedupes…')
  expect(clip('Fixed the race. Then the toast', 17)).toBe('Fixed the race…')
  expect(clip('one, two, three, four', 10)).toBe('one, two…')
  for (const s of ['Wait, then retry. Then wait again, then go', 'a.b.c.d.e.f.g.h', 'x, y, z, w, v, u']) {
    for (let n = 3; n < vw(s); n++) {
      const c = clip(s, n)
      expect(vw(c)).toBeLessThanOrEqual(n)
      expect(c).not.toMatch(/[\s.,;:!?]…$/)
    }
  }
  // One long word: cut inside it rather than lose the room.
  expect(clip('supercalifragilistic', 10)).toBe('supercali…')
  // Paths still clip in the middle, characters exact.
  expect(clipMiddle('src/components/ProductSearch.tsx', 20)).toBe('src/compo…Search.tsx')
})

// ─── 7. Engine lines ─────────────────────────────────────────────────────────

test('engine lines: info notices and command output are one muted/dim line clipped at the measure', async ($, on) => {
  on('ui.render', engine as never)
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'InfoNotice',
    viewport: { columns: 120, rows: 40 },
    props: { text: 'Using the model from your settings, which overrides the default for this project and every session started in it', command: '/model' }
  })
  const rows = textAt(await ui.drawn(), 120)
  expect(rows).toHaveLength(1)
  expect(vw(rows[0] ?? '')).toBeLessThanOrEqual(12 + 96)
  expect(rows[0]).toMatch(/^ {12}› Using the model/)
  // Visible text only: a clip pads with blank cells, whose colour shows nothing.
  const colours = (await ui.findAll({ type: 'Text' }))
    .filter(t => t.text.trim().length > 0)
    .map(t => t.props['color'])
    .filter(c => c !== undefined)
  for (const c of colours) expect([C.muted, C.dim]).toContain(c)
  await ui.unmount()

  const notice = commandNotice('effort', 'high', 'Applies from next turn', 96) ?? []
  for (const p of notice) expect([C.muted, C.dim]).toContain(p.color)
})

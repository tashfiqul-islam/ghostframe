import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { splitBlocks } from '../hooks/blocks'
import { figureLines } from '../hooks/figure'
import type { FigureBlock } from '../hooks/figure'
import { vw } from '../hooks/grid'
import { sourcesFrame } from '../hooks/research'
import { frameLines, partsWidth, tasksFrame } from '../hooks/states'
import type { Part } from '../hooks/states'

const RULE = '#3a3a48'
const DIM = '#4e4e5a'
const PEACH = '#fab387'

/** An mdxcn fence: the official 50-cell frame around `rows`. */
const frame = (title: string, rows: string[]) => {
  const t = ` [ ${title} ] `
  const l = Math.floor((50 - t.length) / 2)
  const row = (r: string) => `|${` ${r}`.padEnd(50)}|`

  return [`+${'-'.repeat(l)}${t}${'-'.repeat(50 - l - t.length)}+`, row(''), ...rows.map(row), row(''), `+${'-'.repeat(50)}+`].join('\n')
}

const STEPS = [
  ['SessionStart', 'inject context'],
  ['UserPromptSubmit', 'add context or block the prompt'],
  ['PreToolUse', 'allow, deny, or rewrite tool input'],
  ['PermissionRequest', undefined],
  ['PostToolUse', 'read result, feed notes back'],
  ['Stop', 'end turn, or block and continue'],
  ['SessionEnd', 'cleanup']
] as const

const stepRows = STEPS.flatMap(([title, desc], i) => [
  `${i + 1}  ${title}`,
  ...(desc === undefined ? [] : [`   ${desc}`]),
  ...(i < STEPS.length - 1 ? ['│'] : [])
])

const LOOPS = ['repeat: 3-5 per tool call', 'back: 6->3 continue', '']
const HOOKS = frame('HOOKS', [...LOOPS, ...stepRows])
const LATE = frame('HOOKS', [...stepRows, '', 'repeat: 3-5 per tool call', 'back: 6->3 continue'])
const BUILD = frame('BUILD', [...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(n => [`●  p${n}  phase ${n}`, '│']), '○  p9  narrow-terminal mode'])
const PLAIN = frame('BUILD', [...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(n => [`●  p${n}  phase ${n}`, '│']), '●  p9  narrow-terminal mode'])

const fig = (body: string): FigureBlock => {
  const f = splitBlocks('```\n' + body + '\n```\n').find(b => b.kind === 'figure')
  if (f?.kind !== 'figure') throw new Error('not a figure')
  return f
}

const text = (l: Part[]) => l.map(p => p.t).join('')

/** The character at visible column `col` of a line and the colour it is drawn in. */
function cellAt(l: Part[], col: number) {
  let at = 0
  for (const p of l) {
    for (const ch of p.t) {
      if (at === col) return { ch, color: p.color }
      at += vw(ch)
    }
  }
  return { ch: '', color: '' }
}

/** A frame's body rows (top and bottom rules dropped, notes under the frame dropped). */
const body = (lines: Part[][]) => {
  const bottom = lines.findIndex((l, i) => i > 0 && text(l).startsWith('+'))
  return lines.slice(1, bottom)
}

const SPINE = 2 // `┆ ` then the figure's first column

test('compact figures: the spine has its own column, one space left of the markers, unbroken first to last', async () => {
  const COMPACT_STEPS = frame('PATH', ['1  request', '│', '2  middleware', '│', '3  handler'])

  for (const [name, src, n] of [
    ['timeline', BUILD, 9],
    ['steps', COMPACT_STEPS, 3]
  ] as const) {
    const rows = body(figureLines(fig(src), 96))
    expect(rows).toHaveLength(n) // still no gaps
    rows.forEach((r, i) => {
      const spine = cellAt(r, SPINE)
      expect(`${name} row ${i}: ${spine.ch}`).toBe(`${name} row ${i}: │`)
      expect(spine.color).toBe(RULE)
      // One space, then the marker: `│ ●`, never touching the spine.
      expect(cellAt(r, SPINE + 1).ch).toBe(' ')
      expect(cellAt(r, SPINE + 2).ch).toMatch(/[0-9●○]/)
    })
  }

  // The same spacing in a narrow frame.
  for (const r of body(figureLines(fig(BUILD), 50, true))) expect(text(r).slice(2, 5)).toMatch(/^│ [●○]$/)

  // A one-item compact figure: one spine cell beside it.
  const one = body(figureLines(fig(frame('ONE', ['●  only'])), 96))
  expect(one.map(r => text(r).slice(2, -2).trimEnd())).toEqual(['│ ●  only'])
})

test('spaced figures: one continuous │ in the rule colour from the first marker to the last, never past it', async () => {
  for (const [name, src] of [
    ['steps', HOOKS],
    [
      'timeline',
      frame('NIGHT', ['●  14:02  p95 crossed', '│', '●  14:11  rolled back', '           flag off', '│', '○  14:40  postmortem', '           still open'])
    ]
  ] as const) {
    const rows = body(figureLines(fig(src), 96))
    const marks = rows.map((r, i) => ({ i, ch: cellAt(r, SPINE).ch })).filter(c => /[0-9●○]/.test(c.ch))
    const first = marks[0]?.i ?? -1
    const last = marks[marks.length - 1]?.i ?? -1
    expect(first).toBe(0)

    for (let i = first; i <= last; i++) {
      const c = cellAt(rows[i] ?? [], SPINE)
      if (/[0-9●○]/.test(c.ch)) continue
      // No gap anywhere between the markers: spacer and description rows carry it.
      expect(`${name} row ${i}: ${c.ch}`).toBe(`${name} row ${i}: │`)
      expect(c.color).toBe(RULE)
    }
    // It ends on the last marker: the last step's description has no spine.
    for (const r of rows.slice(last + 1)) expect(cellAt(r, SPINE).ch).toBe(' ')
  }
})

test('density: all one-line items sit on consecutive rows; any description spaces every item', async () => {
  // Nine one-line items are nine content rows.
  const build = figureLines(fig(BUILD), 96)
  expect(body(build)).toHaveLength(9)
  expect(build).toHaveLength(11)

  const rows = body(figureLines(fig(HOOKS), 96)).map(r =>
    text(r)
      .slice(2, -2)
      .trimEnd()
      .replace(/\s+[┐│┤┘\]].*$/, '')
  )
  expect(rows.slice(0, 7)).toEqual([
    '1  SessionStart',
    '│  inject context',
    '│',
    '2  UserPromptSubmit',
    '│  add context or block the prompt',
    '│',
    '3  PreToolUse'
  ])
  // Step 4 has no description, but the figure has some: a spacer before step 5 too.
  const four = rows.findIndex(r => r.startsWith('4  '))
  expect(rows[four + 1]).toBe('│')
  expect(rows[four + 2]?.startsWith('5  ')).toBe(true)
  // Every item but the last ends on one spacer row; never two in a row.
  for (let i = 1; i < rows.length; i++) expect(rows[i] === '│' && rows[i - 1] === '│').toBe(false)
  // The last step: its description, no spacer, no spine.
  expect(rows.slice(-2)).toEqual(['7  SessionEnd', '   cleanup'])

  // A timeline with one description: every item spaced the same way.
  const mixed = body(
    figureLines(
      fig(
        frame('NIGHT', [
          '●  14:02  p95 crossed 800ms',
          '│',
          '●  14:11  rolled back the flag',
          '           cache flag off',
          '│',
          '○  14:40  write the postmortem'
        ])
      ),
      96
    )
  ).map(r => text(r).slice(2, -2).trimEnd())
  expect(mixed).toEqual([
    '●  14:02  p95 crossed 800ms',
    '│',
    '●  14:11  rolled back the flag',
    '│          cache flag off',
    '│',
    '○  14:40  write the postmortem'
  ]) // the source's own indent kept
})

test('bracket placement: two cells after the widest bracketed row, ┐ │ ┤ label │ ┘, label one cell after', async () => {
  const rows = body(figureLines(fig(HOOKS), 96))
  const top = rows.findIndex(r => text(r).includes('┐'))
  const end = rows.findIndex(r => text(r).includes('┘'))
  const col = text(rows[top] ?? []).indexOf('┐')
  // The widest row in steps 3–5 is `│  allow, deny, or rewrite tool input` (37 cells).
  const widest = Math.max(...rows.slice(top, end + 1).map(r => text(r).slice(2, col).trimEnd().length))
  expect(widest).toBe(37)
  expect(col).toBe(2 + widest + 2)

  const glyphs = rows.slice(top, end + 1).map(r => cellAt(r, col))
  const mid = Math.floor((glyphs.length - 1) / 2)
  expect(glyphs.map(g => g.ch).join('')).toBe('┐' + '│'.repeat(mid - 1) + '┤' + '│'.repeat(glyphs.length - mid - 2) + '┘')
  for (const g of glyphs) expect(g.color).toBe(RULE)
  const labelRow = rows[top + mid] ?? []
  expect(text(labelRow).slice(col, col + 15)).toBe('┤ per tool call')

  // Clamped to the frame: a narrow frame (bracket still fits) keeps every row the width.
  for (const w of [60, 52]) {
    const lines = figureLines(fig(HOOKS), w)
    for (const l of lines) expect(partsWidth(l)).toBe(w)
    const c = text(body(lines).find(r => text(r).includes('┐')) ?? []).indexOf('┐')
    expect(c).toBeLessThanOrEqual(2 + (w - 4) - 2 - 'per tool call'.length)
  }
})

test('loops: a ┐ │ ┘ bracket on steps 3–5 in the rule colour, its label dim beside the middle; ↩ after step 6', async () => {
  const rows = body(figureLines(fig(HOOKS), 96))
  const col = rows.map(r => text(r).indexOf('┐')).find(i => i >= 0) ?? -1
  expect(col).toBeGreaterThan(20)
  expect(col).toBeLessThan(50) // beside the steps, not out at the frame's edge

  const at = rows.map(r => cellAt(r, col))
  const top = at.findIndex(c => c.ch === '┐')
  const end = at.findIndex(c => c.ch === '┘')
  expect(
    text(rows[top] ?? [])
      .slice(2)
      .startsWith('3  PreToolUse')
  ).toBe(true)
  expect(
    text(rows[end] ?? [])
      .slice(2)
      .startsWith('│  read result')
  ).toBe(true)

  for (let i = top; i <= end; i++) {
    expect(at[i]?.color).toBe(RULE)
    if (i > top && i < end) expect(at[i]?.ch).toMatch(/[│┤]/)
  }
  const mid = Math.floor((top + end) / 2)
  const label = rows[mid]?.find(p => p.t.includes('per tool call'))
  expect(label?.color).toBe(DIM)
  expect(rows.filter(r => text(r).includes('per tool call'))).toHaveLength(1)
  // Outside the span, nothing on the right.
  for (const r of [...rows.slice(0, top), ...rows.slice(end + 1)]) expect(cellAt(r, col).ch).toBe(' ')

  const six = rows.find(r => text(r).slice(2).startsWith('6  Stop'))
  const jump = six?.find(p => p.t.includes('↩'))
  expect(jump?.t.trim()).toBe('↩ continue to 3')
  expect(jump?.color).toBe(DIM)
  // The loop lines themselves are never drawn as rows.
  expect(rows.some(r => /repeat:|back:/.test(text(r)))).toBe(false)
})

test('loops in narrow mode: no bracket, a dim ↺ line under the figure', async () => {
  const lines = figureLines(fig(HOOKS), 60, true)
  for (const l of lines) expect(partsWidth(l)).toBe(60)
  expect(lines.some(l => /[┐┘]/.test(text(l)))).toBe(false)
  const note = lines[lines.length - 1] ?? []
  expect(text(note).trimEnd()).toBe('↺ 3–5 repeat per tool call')
  expect(note[0]?.color).toBe(DIM)
  expect(text(lines[lines.length - 2] ?? []).startsWith('+┄')).toBe(true)
  // The jump still reads after step 6.
  expect(lines.some(l => text(l).includes('6  Stop  ↩ continue to 3'))).toBe(true)
})

test('loop lines written after the steps never redraw rows: they become notes under the figure', async () => {
  const lines = figureLines(fig(LATE), 96)
  expect(lines.some(l => /[┐┘]|↩ continue/.test(text(l.slice(0, -1))) && text(l).startsWith('┆'))).toBe(false)
  expect(lines.slice(-2).map(l => text(l).trimEnd())).toEqual(['↺ 3–5 repeat per tool call', '↩ 6 continue to 3'])
})

test('figure meta: a dim count at the right of the top rule, once the fence closes', async () => {
  const top = (src: string) => text(figureLines(fig(src), 96)[0] ?? [])
  expect(top(HOOKS)).toMatch(/ 7 steps \+$/)
  expect(top(BUILD)).toMatch(/ 8 of 9 done \+$/)
  // Every marker done: done of all, not a bare count.
  expect(top(PLAIN)).toMatch(/ 9 of 9 done \+$/)
  // Mixed states.
  const six = frame('BUILD', [...[1, 2, 3, 4, 5, 6].flatMap(n => [`●  p${n}  done`, '│']), '◐  p7  now', '│', '○  p8  next', '│', '○  p9  next'])
  expect(top(six)).toMatch(/ 6 of 9 done \+$/)
  // Markers with no state: a count.
  const bullets = frame(
    'NOTES',
    [1, 2, 3].flatMap(n => [`•  n${n}  note`, ...(n < 3 ? ['│'] : [])])
  )
  expect(top(bullets)).toMatch(/ 3 items \+$/)
  expect(figureLines(fig(HOOKS), 96)[0]?.find(p => p.t === '7 steps')?.color).toBe('#686874')
  for (const l of figureLines(fig(HOOKS), 96)) expect(partsWidth(l)).toBe(96)

  // While the fence is open there is no count yet.
  const open = splitBlocks('```\n' + BUILD.split('\n').slice(0, 6).join('\n') + '\n').find(b => b.kind === 'figure')
  if (open?.kind !== 'figure') throw new Error('not a figure')
  expect(text(figureLines(open, 96)[0] ?? [])).toMatch(/┄  \+$/)
})

test('labels: every frame title is accent, normal weight, with dim brackets', async ($, on) => {
  const tops: Part[][] = [
    figureLines(fig(HOOKS), 80)[0] ?? [],
    figureLines(fig(frame('ROUTES', ['/docs  [====]  12'])), 80)[0] ?? [],
    tasksFrame(80, { newTodos: [{ content: 'a', status: 'completed' }] })?.[0] ?? [],
    sourcesFrame(
      [1, 2, 3, 4, 5].map(n => ({ n, title: `t${n}`, url: `https://e.com/${n}` })),
      80
    )[0] ?? [],
    frameLines(80, 'TESTS', { t: 'all passing', color: '' }, [])[0] ?? []
  ]
  for (const t of tops) {
    const open = t.findIndex(p => p.t === '[ ')
    expect(open).toBeGreaterThan(0)
    expect(t[open]?.color).toBe(DIM)
    expect(t[open + 1]?.color).toBe(PEACH)
    expect(t[open + 1]?.bold).toBeUndefined()
    expect(t.find(p => p.t === ' ]')?.color).toBe(DIM)
  }

  // The diff card draws its label through the same pieces.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolResult',
    viewport: { columns: 120, rows: 40 },
    props: {
      tool_use_id: 'e1',
      tool: 'Write',
      isErrored: false,
      output: { type: 'create', filePath: 'src/new.ts', content: 'one\ntwo\n', structuredPatch: [], originalFile: null }
    }
  })
  const texts = await ui.findAll({ type: 'Text' })
  const at = (re: RegExp) => texts.find(t => re.test(t.text))?.props
  expect(at(/^\[ $/)?.['color']).toBe(DIM)
  expect(at(/^ \]$/)?.['color']).toBe(DIM)
  expect(at(/^src\/new\.ts$/)?.['color']).toBe(PEACH)
  expect(at(/^src\/new\.ts$/)?.['weight']).toBeUndefined()
  await ui.unmount()
})

// ─── Streaming: a looped Steps figure, wide and narrow ───────────────────────

const reply = `Every request passes through the lifecycle hooks.\n\n\`\`\`\n${HOOKS}\n\`\`\`\n\nThe mod draws the transcript.`

async function stream($: Parameters<TestBody>[0], columns: number) {
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns, rows: 60 },
    props: { text: reply.slice(0, 20), isFirstOfReply: false }
  })
  const grab = async () => (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  let prev: string[] = []
  let sawBracketOpen = false

  for (let cut = 24; ; cut = Math.min(reply.length, cut + 11)) {
    await ui.redraw({ text: reply.slice(0, cut), isFirstOfReply: false })
    const all = await grab()
    const rows = all.filter(l => /^[+┆]/.test(l))
    const closed = reply.slice(0, cut).split('```').length > 2

    for (const l of rows) expect(vw(l)).toBe(columns < 100 ? columns - 2 : 96)
    // Once drawn, a row never changes (the top rule only gains its count at close).
    expect(rows.slice(1, prev.length)).toEqual(prev.slice(1))
    if (!closed) {
      // While open: never a half bracket (┐ drawn means its ┘ is drawn too), no bottom.
      const opened = rows.some(l => l.includes('┐'))
      if (opened) sawBracketOpen = true
      expect(opened).toBe(rows.some(l => l.includes('┘')))
      expect(rows.some(l => /^\+┄+\+$/.test(l))).toBe(false)
      prev = rows
    }

    if (cut === reply.length) {
      await ui.unmount()
      return { rows, all, sawBracketOpen }
    }
  }
}

test('streaming a looped Steps figure: rows never change, the bracket arrives whole', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const { rows, sawBracketOpen } = await stream($, 120)
  expect(sawBracketOpen).toBe(true)
  expect(rows[0]).toMatch(/ 7 steps \+$/)
  expect(rows.filter(l => l.includes('┤ per tool call'))).toHaveLength(1)
  expect(rows[rows.length - 1]).toMatch(/^\+┄+\+$/)
})

test('streaming a looped Steps figure in narrow mode: no bracket, the ↺ line under it at close', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const { rows, all, sawBracketOpen } = await stream($, 80)
  expect(sawBracketOpen).toBe(false)
  expect(rows.some(l => /[┐┘]/.test(l))).toBe(false)
  const bottom = all.findIndex(l => /^\+┄+\+$/.test(l))
  expect(all[bottom + 1]?.trimEnd()).toBe('↺ 3–5 repeat per tool call')
})

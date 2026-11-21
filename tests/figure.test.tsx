import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../hooks/transcript/blocks/split'
import { WIDER_NOTE, figureLines } from '../hooks/transcript/figure/draw'
import { toneRow } from '../hooks/transcript/figure/tone'
import { partsWidth } from '../hooks/shared/parts'
import { vw } from '../hooks/shared/text'
import { cellLines } from '../hooks/transcript/table/cells'
import { layoutTable } from '../hooks/transcript/table/layout'

// Verbatim from https://mdxcn.dev/llms.txt `## MDX`: one fence per recipe type in the
// mdxcn skill's recipes.md that has fenced ASCII (Flow has none).
const FENCES: Record<string, string> = {
  timeline:
    '+------------------ [ SHIPPED ] -------------------+\n|                                                  |\n| ●  Mar 12  CLI copies the files                  |\n| │                                                |\n| ●  Mar 18  Docs, live previews                   |\n| │                                                |\n| ○  Apr 02  Registry listed                       |\n|                                                  |\n+--------------------------------------------------+',
  uptime:
    '+-------------------- [ API ] ---------------------+\n|                                                  |\n| ██████████████████▒███████████                   |\n| ███████████··█████████████████                   |\n| ▒█████████████████████████████                   |\n| 96%  Jun 1  Aug 29                               |\n| █ up  ▒ slow  · down                             |\n|                                                  |\n+--------------------------------------------------+',
  compare:
    '+------------------- [ PLANS ] --------------------+\n|                                                  |\n|                | Solo | Studio                   |\n| ---------------+------+-------                   |\n| Registry       |    ✓ |      ✓                   |\n| Accent picker  |    ✓ |      ✓                   |\n| Private source |    – |      ✓                   |\n| Price          |   $0 |    $24                   |\n|                                                  |\n+--------------------------------------------------+',
  rank: '+------------------- [ ROUTES ] -------------------+\n|                                                  |\n| /docs     [====================]  12,400         |\n| /install  [=======-------------]   4,100         |\n| /plot     [=-------------------]     860         |\n| /rank     [=-------------------]     420         |\n|                                                  |\n+--------------------------------------------------+',
  diff: '+------------------- [ BUNDLE ] -------------------+\n|                                                  |\n|   vendor       84 kb                             |\n| + app          31 kb                             |\n| - sourcemaps   12 kb                             |\n| --------------------                             |\n|   shipped     103 kb                             |\n|                                                  |\n+--------------------------------------------------+',
  slope:
    '+------------------ [ TRAFFIC ] -------------------+\n|                                                  |\n|        2025       2026                           |\n| docs  8,200  →  12,400                           |\n| copy  5,100  →   4,100                           |\n| ship    640  →     860                           |\n|                                                  |\n+--------------------------------------------------+',
  gantt:
    '+------------------- [ LAUNCH ] -------------------+\n|                                                  |\n|                      ▾                           |\n| design  ████████----------------                 |\n| build   -----███████░░░░░░------                 |\n| docs    -------------██░░░░░░░--                 |\n| ship    --------------------░░░░                 |\n|         q1     q2      q3     q4                 |\n|                                                  |\n+--------------------------------------------------+',
  stat: '+----------------- [ THIS WEEK ] ------------------+\n|                                                  |\n| 12,400   4,100    860                            |\n| docs     copies   shipped                        |\n|                                                  |\n+--------------------------------------------------+',
  meter:
    '+------------------ [ SHIPPED ] -------------------+\n|                                                  |\n| [=========-----]  67%                            |\n| characters, not a progress bar                   |\n|                                                  |\n+--------------------------------------------------+',
  kpi: '+------------------- [ READS ] --------------------+\n|                                                  |\n| 12,400                                           |\n| this week  +18%                                  |\n| ▃▄▄▄▅▅▆▅▇▆▇█                                     |\n|                                                  |\n+--------------------------------------------------+'
}

const TITLES: Record<string, string> = {
  timeline: 'SHIPPED',
  uptime: 'API',
  compare: 'PLANS',
  rank: 'ROUTES',
  diff: 'BUNDLE',
  slope: 'TRAFFIC',
  gantt: 'LAUNCH',
  stat: 'THIS WEEK',
  meter: 'SHIPPED',
  kpi: 'READS'
}

const fenced = (body: string) => `Here is the figure.\n\n\`\`\`\n${body}\n\`\`\`\n\nAnd prose after it.`

/** Each one-line Text the mod drew (frame rows are one each). */
async function rows(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
}

const colorOf = (line: string, ch: string) => toneRow(line).find(p => p.t.includes(ch))?.color

for (const [name, body] of Object.entries(FENCES)) {
  test(`figure: ${name} parses and draws in our frame, every row the measure`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    const blocks = splitBlocks(fenced(body))
    const fig = blocks.find(b => b.kind === 'figure')
    if (fig?.kind !== 'figure') throw new Error(`${name}: not a figure`)
    expect(fig.title).toBe(TITLES[name] ?? '')
    expect(fig.closed).toBe(true)
    expect(fig.rows.length).toBeGreaterThan(0)
    expect(fig.rows[0]?.length).toBeGreaterThan(0) // the frame's own blank padding row is gone
    expect(blocks.map(b => b.kind)).toEqual(['para', 'figure', 'para'])

    for (const width of [96, 68, 48]) {
      const lines = figureLines(fig, width)
      for (const l of lines) expect(partsWidth(l)).toBe(width)
      expect(lines[0]?.map(p => p.t).join('')).toContain(`[ ${fig.title} ]`)
      expect(lines[lines.length - 1]?.map(p => p.t).join('')).toMatch(/^\+┄+/)
    }

    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: { columns: 120, rows: 40 },
      props: { text: fenced(body), isFirstOfReply: false }
    })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    const frame = (await rows(ui)).filter(l => /^[+┆]/.test(l))
    expect(frame.length).toBe(figureLines(fig, 96).length)
    for (const l of frame) expect(vw(l)).toBe(96)
    await ui.unmount()
  })
}

test('figure tones: box lines in the rule colour, text in text, hue only where the figure marks state', async () => {
  const FRAME = '#2c2c36'
  expect(colorOf('●  Mar 12  CLI copies the files', '●')).toBe('#96d292') // done
  expect(colorOf('○  Apr 02  Registry listed', '○')).toBe('#686874') // next
  expect(colorOf('│', '│')).toBe(FRAME)
  expect(colorOf('●  Mar 12  CLI copies the files', 'CLI')).toBe('#b2b2bc')
  expect(colorOf('                     ▾', '▾')).toBe('#fab387') // now
  expect(colorOf('██████▒███', '▒')).toBe('#e8b98a') // slow
  expect(colorOf('█████··████', '·')).toBe('#ec84a0') // down
  expect(colorOf('+ app          31 kb', '+')).toBe('#96d292')
  expect(colorOf('- sourcemaps   12 kb', '-')).toBe('#ec84a0')
  expect(colorOf('--------------------', '-')).toBe(FRAME)
  expect(colorOf('Registry       |    ✓ |      ✓', '✓')).toBe('#96d292')
  expect(colorOf('Registry       |    ✓ |      ✓', '|')).toBe(FRAME)
  const bar = toneRow('/install  [=======-------------]   4,100')
  expect(bar.find(p => p.t.startsWith('='))?.color).toBe('#b2b2bc') // text (bar fill)
  expect(bar.find(p => p.t.startsWith('-'))?.color).toBe('#2c2c36') // hairline (track)
  expect(bar.find(p => p.t === '[')?.color).toBe(FRAME)
})

test('a streaming figure: the frame opens at the measure, drawn rows never change, the bottom only when the fence closes', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const FULL = fenced(FENCES['timeline'] ?? '')
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40 },
    props: { text: FULL.slice(0, 25), isFirstOfReply: false }
  })
  let prev: string[] = []
  let sawOpen = false

  for (let cut = 30; ; cut = Math.min(FULL.length, cut + 13)) {
    await ui.redraw({ text: FULL.slice(0, cut), isFirstOfReply: false })
    const frame = (await rows(ui)).filter(l => /^[+┆]/.test(l))
    const closed = FULL.slice(0, cut).split('```').length > 2

    // A closed fence always draws its frame: the checks below never pass on nothing.
    if (closed) expect(frame.length).toBeGreaterThan(0)
    if (frame.length > 0) {
      for (const l of frame) expect(vw(l)).toBe(96) // fixed width from the first row on
      // Rows already drawn never change; while open there is no bottom edge. The top
      // rule gains its count once, when the fence closes (the count is known only then).
      expect(frame.slice(1, prev.length)).toEqual(prev.slice(1))
      const label = (l: string | undefined) => l?.slice(0, l.indexOf(' ]') + 2)
      if (prev.length > 0) expect(label(frame[0])).toBe(label(prev[0]))
      if (!closed) expect(frame[0]).toMatch(/┄  \+$/)
      if (!closed) {
        sawOpen = true
        expect(frame.some(l => /^\+┄+\+$/.test(l))).toBe(false)
        // Never a half-written row: every row is a whole source row.
        for (const l of frame.slice(1)) expect(l.trimEnd().endsWith('┆')).toBe(true)
      }
      prev = closed ? prev : frame
    }

    if (cut === FULL.length) {
      expect(frame[frame.length - 1]).toMatch(/^\+┄+\+$/)
      break
    }
  }
  expect(sawOpen).toBe(true)
  await ui.unmount()
})

test('a figure wider than the frame is cut at the right, never wrapped, with a dim note on the bottom rule', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const wide = '+' + '-'.repeat(60) + ' [ WIDE ] ' + '-'.repeat(60) + '+'
  const body = [wide, '|' + ' '.repeat(128) + '|', '| ' + 'x'.repeat(126) + ' |', '| short row' + ' '.repeat(118) + '|', '+' + '-'.repeat(128) + '+'].join('\n')
  const fig = splitBlocks(fenced(body)).find(b => b.kind === 'figure')
  if (fig?.kind !== 'figure') throw new Error('not a figure')
  const lines = figureLines(fig, 96).map(l => l.map(p => p.t).join(''))
  for (const l of lines) expect(vw(l)).toBe(96)
  expect(lines[1]).toMatch(/x…\s┆$/)
  expect(lines[lines.length - 1]).toContain(WIDER_NOTE)
  expect(figureLines(fig, 96)[lines.length - 1]?.find(p => p.t === WIDER_NOTE)?.color).toBe('#4e4e5a')

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40 },
    props: { text: fenced(body), isFirstOfReply: false }
  })
  const drawn = (await rows(ui)).filter(l => /^[+┆]/.test(l))
  expect(drawn).toHaveLength(4)
  for (const l of drawn) expect(vw(l)).toBe(96)
  await ui.unmount()
})

for (const columns of [90, 70, 50]) {
  test(`narrow at ${columns} columns: a figure takes the full width less the inset`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: { columns, rows: 40 },
      props: { text: fenced(FENCES['gantt'] ?? ''), isFirstOfReply: false }
    })
    const frame = (await rows(ui)).filter(l => /^[+┆]/.test(l))
    expect(frame.length).toBeGreaterThan(3)
    for (const l of frame) expect(vw(l)).toBe(columns - 2)
    await ui.unmount()
  })
}

test('an unknown or malformed fence stays a plain code block', async () => {
  // A bare fence of ordinary code.
  expect(splitBlocks('```\nconst a = 1\n```').map(b => b.kind)).toEqual(['markdown'])
  // A fence with a language, even holding a frame.
  expect(splitBlocks('```text\n+---- [ X ] ----+\n| a |\n+------+\n```').map(b => b.kind)).toEqual(['markdown'])
  // A figure top edge, then a row that isn't railed.
  expect(splitBlocks('```\n+---- [ X ] ----+\n| a |\nnot a row\n+------+\n```').map(b => b.kind)).toEqual(['markdown'])
  // Closed with no bottom edge.
  expect(splitBlocks('```\n+---- [ X ] ----+\n| a |\n```').map(b => b.kind)).toEqual(['markdown'])
  // An indented fence in a list keeps the list's own handling.
  expect(splitBlocks('- item\n  ```\n  +---- [ X ] ----+\n  ```')[0]?.kind).toBe('markdown')
})

test('tables: a short number starting a prose cell stays with the next word', async () => {
  // Two prose columns competing, the case seen on screen: without the glue, Fixes
  // shrinks to its longest word (`regressions,`, 12) and `2` sits alone on its line.
  const t = splitBlocks(
    [
      '| Version | Fixes | Highlights |',
      '|---|---|---|',
      '| v1.4.2 | 2 regressions, plus crashes and hangs | Elysia and AsyncLocalStorage regressions, a hang in the websocket client, CMYK JPEG decoding, a JIT crash and a GC crash on musl |'
    ].join('\n')
  )[0]
  if (t?.kind !== 'table') throw new Error('no table')
  const cell = t.table.rows[0]?.[1]
  if (cell === undefined) throw new Error('no cell')
  for (const room of [46, 44, 43, 42]) {
    const width = layoutTable(t.table, room).widths[1] ?? 0
    const first = cellLines(cell, width, 'prose')[0]
      ?.map(r => r.t)
      .join('')
    expect(first?.startsWith('2 regressions,')).toBe(true)
  }
})

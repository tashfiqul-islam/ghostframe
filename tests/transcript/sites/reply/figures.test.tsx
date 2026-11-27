import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { splitBlocks } from '../../../../hooks/transcript/blocks/split'
import { WIDER_NOTE, figureLines } from '../../../../hooks/transcript/figure/draw'
import { layout } from '../../../../hooks/shared/layout'
import { partsWidth } from '../../../../hooks/shared/parts'
import { vw } from '../../../../hooks/shared/text'
import { HOOKS } from '../../../support/figures'
import { OFF } from '../../../support/cockpit'

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

/** The figure block a reply holding `body` in a fence splits out. */
function figureOf(body: string) {
  const fig = splitBlocks(fenced(body)).find(b => b.kind === 'figure')
  if (fig?.kind !== 'figure') throw new Error('not a figure')

  return fig
}

// The site draws every figure kind the same way, `figureLines` at the reply's measure (blocks.tsx), so the recipes
// are checked here without the engine and one mounted reply below checks that route.
for (const [name, body] of Object.entries(FENCES)) {
  test(`figure: ${name} parses and draws in our frame, every row the measure`, () => {
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
  })
}

for (const columns of [120, 50]) {
  test(`a reply with a figure draws \`figureLines\` at the measure, row for row, never the engine: ${columns} columns`, OFF, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    const body = FENCES['timeline'] ?? ''
    const lay = layout(columns)
    if (lay === undefined) throw new Error(`no measure at ${columns} columns`)
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: { columns, rows: 40 },
      props: { text: fenced(body), isFirstOfReply: false }
    })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    const frame = (await rows(ui)).filter(l => /^[+┆]/.test(l))
    expect(frame).toEqual(figureLines(figureOf(body), lay.width, lay.narrow).map(l => l.map(p => p.t).join('')))
    await ui.unmount()
  })
}

test('a streaming figure: the frame opens at the measure, drawn rows never change, the bottom only when the fence closes', OFF, async ($, on) => {
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

test('a figure wider than the frame is cut at the right, never wrapped, with a dim note on the bottom rule', () => {
  const wide = '+' + '-'.repeat(60) + ' [ WIDE ] ' + '-'.repeat(60) + '+'
  const body = [wide, '|' + ' '.repeat(128) + '|', '| ' + 'x'.repeat(126) + ' |', '| short row' + ' '.repeat(118) + '|', '+' + '-'.repeat(128) + '+'].join('\n')
  const fig = figureOf(body)
  const lines = figureLines(fig, 96).map(l => l.map(p => p.t).join(''))
  expect(lines).toHaveLength(4) // top, the two rows (the frame's blank padding row is gone), bottom
  for (const l of lines) expect(vw(l)).toBe(96)
  expect(lines[1]).toMatch(/x…\s┆$/)
  expect(lines[lines.length - 1]).toContain(WIDER_NOTE)
  expect(figureLines(fig, 96)[lines.length - 1]?.find(p => p.t === WIDER_NOTE)?.color).toBe('#4e4e5a')
})

for (const columns of [90, 70, 50]) {
  test(`narrow at ${columns} columns: a figure takes the full width less the inset`, () => {
    const lay = layout(columns)
    if (lay === undefined) throw new Error(`no layout at ${columns} columns`)
    const frame = figureLines(figureOf(FENCES['gantt'] ?? ''), lay.width, lay.narrow)
    expect(frame.length).toBeGreaterThan(3)
    for (const l of frame) expect(partsWidth(l)).toBe(columns - 2)
  })
}

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

test('streaming a looped Steps figure: rows never change, the bracket arrives whole', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const { rows, sawBracketOpen } = await stream($, 120)
  expect(sawBracketOpen).toBe(true)
  expect(rows[0]).toMatch(/ 7 steps \+$/)
  expect(rows.filter(l => l.includes('┤ per tool call'))).toHaveLength(1)
  expect(rows[rows.length - 1]).toMatch(/^\+┄+\+$/)
})

test('streaming a looped Steps figure in narrow mode: no bracket, the ↺ line under it at close', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const { rows, all, sawBracketOpen } = await stream($, 80)
  expect(sawBracketOpen).toBe(false)
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.some(l => /[┐┘]/.test(l))).toBe(false)
  const bottom = all.findIndex(l => /^\+┄+\+$/.test(l))
  expect(all[bottom + 1]?.trimEnd()).toBe('↺ 3–5 repeat per tool call')
})

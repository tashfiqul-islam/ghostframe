import { expect, test } from 'claude-code/testing'

import { planRow, stepNodeRow } from '../../../hooks/cockpit/v8/events'
import { receiptRow } from '../../../hooks/cockpit/v8/left'
import { GLYPH } from '../../../hooks/shared/look/glyphs'
import { TOKEN } from '../../../hooks/shared/look/palette'
import { spineOnly } from '../../../hooks/shared/look/spine'
import { answerRows } from '../../../hooks/transcript/v8/markdown'
import { planCard, tableCard } from '../../../hooks/transcript/v8/tables'
import { agentHeader, messageCard, thoughtRow, turnHeader } from '../../../hooks/transcript/v8/turn'
import { widthOf } from '../../../hooks/shared/look/width'
import { blocksOf } from '../../support/live'
import { screen, shown } from '../../support/screens'
import { at, counts, TRACE_7, W } from '../../support/v8left'

test('7.1: the header`s label states and the day, in machine and bold (screen 07)', () => {
  const rows = [
    turnHeader({ at: at(18, 20, 44), turnNo: 30, after: 'compact', isLive: false }, W),
    turnHeader({ at: new Date(2026, 10, 24, 9, 2, 10).getTime(), turnNo: 31, after: 'resume', day: 'Tue', isLive: false }, W)
  ]

  expect(shown(rows)).toEqual([screen('07')[2], screen('07')[14]])
  expect(rows[1]?.find(p => p.t === ' · RESUMED · Tue')).toMatchObject({ color: TOKEN.machine, bold: true })
  expect(shown([receiptRow(counts({ durationMs: 66_000, steps: 8, files: 1, shipped: 'c41d9e0', levels: TRACE_7 }), W)])).toEqual([screen('07')[23]])
})

test('7.1, 7.2: an agent`s header in its colour, its brief from main (screen 27)', () => {
  const head = agentHeader(at(10, 25, 20), 'Audit tests', W)

  expect(shown([head])).toEqual([screen('27')[0]])
  expect(head.find(p => p.t === GLYPH.agent)?.color).toBe(TOKEN.agent)
  // The brief wraps inside its card at 86 cells, `from main` on its first row.
  expect(shown(messageCard('Check whether the width tests fail only because of the Bun version. Run them twice and report.', 'toAgent', W))).toEqual(
    screen('27').slice(1, 5)
  )
  expect(shown([stepNodeRow(6_000, true, 'shell', 'bun test hooks/width', '14 pass', W)])).toEqual([screen('27')[8]])
})

test('7.2: an added message carries its clock and `added`; a queued one `QUEUED` and when it sends (screens 02, 14)', () => {
  expect(shown(messageCard('also check whether the lockfile pins bun anywhere', 'added', W, at(10, 26, 31)))).toEqual(screen('02').slice(12, 15))
  expect(shown(messageCard('when you’re done, also update the README', 'queued', W, at(16, 45, 12)))).toEqual(screen('14').slice(10, 14))

  const queued = messageCard('x', 'queued', W, at(16, 45, 12))

  expect(queued.flat().find(p => p.t === 'QUEUED')).toMatchObject({ color: TOKEN.muted, bold: true })
  expect(queued.flat().find(p => p.t === GLYPH.queued)?.color).toBe(TOKEN.muted)
})

test('7.9: the plan card with the engine`s keys, then the PLAN node (screen 05)', () => {
  const rows = [
    turnHeader({ at: at(10, 52, 30), turnNo: 10, isLive: false }, W),
    ...messageCard('plan how to add a Windows job to CI, don’t change anything yet', 'typed', W),
    spineOnly(),
    thoughtRow(9_000),
    spineOnly(),
    ...answerRows('Here is the plan. Nothing has been changed.', { width: W, hasLead: true }),
    spineOnly(),
    ...planCard(
      [
        'Add a windows-latest job that reuses the Bun pin from mise.toml',
        'Set LANG=C.UTF-8 for that job only',
        'Run the width tests on both runners',
        'Report any test that behaves differently on Windows'
      ],
      [
        ['enter', 'approve'],
        ['e', 'edit']
      ],
      W
    ),
    spineOnly(),
    planRow(72_000, 'ready · waiting for your approval · 7 steps, all reads', W)
  ]

  expect(shown(rows)).toEqual(screen('05'))
  expect(rows.flat().find(p => p.t === 'PLAN')).toMatchObject({ color: TOKEN.machine, bold: true })
})

test('7.4: every markdown element (screen 18): headings with dim markers, numbered, nested bullets, a quote, tasks', () => {
  const md = [
    '## The rule',
    '1. At 144 columns or more the pane docks on its own.',
    '2. From 110 to 143 it docks only if you asked with /cockpit or /steps.',
    '3. Below 110 the engine seats it inline, and Cockpit closes it unless you asked.',
    '',
    '### While you drag the window',
    '- the pane holds its width until the size is stable for 150 ms',
    '- an unasked pane leaves at the first width below 144',
    '  - so the conversation only ever widens, never squeezes',
    '',
    '> Rows already drawn are redrawn in the new mode, so a finished turn gains its',
    '> work node when the pane leaves and loses it when the pane returns.',
    '',
    '[x] docks at 200 · [x] asked open at 120 · [ ] tmux, untested',
    '',
    'See amendment 10 and the drag test in the feasibility report [1].'
  ].join('\n')
  const rows = answerRows(md, { width: W, hasLead: false })

  expect(shown(rows)).toEqual(screen('18').slice(10, 26))
  expect(rows[0]?.find(p => p.t === '## ')?.color).toBe(TOKEN.dim)
  expect(rows.flat().find(p => p.t === '1')?.color).toBe(TOKEN.machine)
  expect(rows.flat().find(p => p.t === '▏ ')?.color).toBe(TOKEN.machine)
  expect(rows.flat().find(p => p.t === '[x] ')?.color).toBe(TOKEN.ok)
  expect(rows.flat().find(p => p.t === '[ ')?.color).toBe(TOKEN.dim)
  expect(rows.flat().find(p => p.t === '[1]')?.color).toBe(TOKEN.machine)
})

test('7.4: code inside bold drops its backticks and is bright and bold (the live session`s turn 5)', () => {
  const rows = answerRows('- **`https://bun.sh/docs/cli/test`:** the fetch worked', { width: W, hasLead: false })
  const row = rows.flat()

  expect(shown(rows).join('\n')).not.toMatch(/[`*]/)
  expect(row.find(p => p.t === 'https://bun.sh/docs/cli/test')).toMatchObject({ color: TOKEN.textBright, bold: true })
})

test('7.6: the live session`s turn 7 table: no backticks in the header; every cell column starts at the same cell', () => {
  const [, table] = blocksOf(7, 'text')
  const lines = (table ?? '').split('\n').filter(l => l.startsWith('|'))
  const rows = tableCard(lines, W)
  const texts = shown(rows)
    .slice(0, -1)
    .filter(r => !/[▄▀]/.test(r))

  expect(texts[0]).toMatch(/Input +width returns +Terminal shows +Severity/)
  // Each row is exactly the card's width, and the third column starts at the same cell on every row.
  for (const r of shown(rows)) expect(widthOf(r.trimEnd())).toBeLessThanOrEqual(16 + W)
  const starts = texts.map(r => {
    const i = r.search(/ (1|2|3|usually 2|Terminal shows) +(bug|risk|Severity)\s*$/)

    return widthOf(r.slice(0, i))
  })
  expect(new Set(starts).size).toBe(1)
})

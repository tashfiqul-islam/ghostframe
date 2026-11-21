import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../hooks/transcript/blocks/split'
import { footnoteLines } from '../hooks/transcript/research/footnotes'
import { sourcesFrame } from '../hooks/transcript/research/sources'
import { cellLines } from '../hooks/transcript/table/cells'
import { layoutTable } from '../hooks/transcript/table/layout'
import { sourceLabel } from '../hooks/shared/url'

const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never

// ─── 2. One blank row before the answer ──────────────────────────────────────

test('the final answer after an activity row gets one blank row; after a drawn card, none; decided once', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let out = ' 5 pass\n 0 fail'
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  const VIEW = { columns: 120, rows: 40 }
  const topGap = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Box' }))[1]?.props['marginTop']

  // A plain ● row, then the answer: one blank row.
  await $.turn.start({ text: 'look', turnId: 't1' })
  await $.session.append(respond([{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'a' } }], 'a1'))
  await $.session.append(respond([{ type: 'text', text: 'Found it: the queue fires twice.' }], 'a2'))
  const answer = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'Found it: the queue fires twice.', isFirstOfReply: true }
  })
  expect(await topGap(answer)).toBe(1)
  await answer.unmount()

  // A test run that drew its card, then prose: the card's own blank row is enough.
  await $.turn.start({ text: 'test', turnId: 't2' })
  await $.session.append(respond([{ type: 'tool_use', id: 'k1', name: 'Bash', input: { command: 'bun test' } }], 'b1'))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'k1' } as never)
  const card = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolResult',
    viewport: VIEW,
    props: { tool_use_id: 'k1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } }
  })
  await $.session.append(respond([{ type: 'text', text: 'All five pass now, running again.' }], 'b2'))
  const prose = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'All five pass now, running again.', isFirstOfReply: true }
  })
  expect(await topGap(prose)).toBe(0)

  // A later run takes the card; the earlier card collapses. The prose already drawn keeps its gap.
  out = ' 6 pass\n 0 fail'
  await $.session.append(respond([{ type: 'tool_use', id: 'k2', name: 'Bash', input: { command: 'bun test' } }], 'b3'))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'k2' } as never)
  await card.redraw({ tool_use_id: 'k1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } })
  expect(await card.find({ type: 'Text', text: /^TESTS$/ })).toBeUndefined()
  await prose.redraw({ text: 'All five pass now, running again.', isFirstOfReply: true })
  expect(await topGap(prose)).toBe(0)
  await card.unmount()
  await prose.unmount()
})

// ─── 3. Prose columns keep their longest word ────────────────────────────────

const BUN = `| Version | Released | Fixes | Highlights | Post |
|---|---|---|---|---|
| v1.4.4 | Oct 22, 2026 | 271 issues, 544 👍 | — (the blog index gives counts only) | bun.com/blog/bun-v1.4.4 |
| v1.4.2 | Sep 5, 2026 | 2 regressions, plus crashes and hangs | Elysia and AsyncLocalStorage regressions, a \`@discordjs/ws\` hang, CMYK JPEG decoding in \`Bun.Image\`, a JIT crash and a GC crash on musl | bun.com/blog/bun-v1.4.2 |`

test('a prose column is never narrower than its longest word (≤ 24); the fixed columns give first', async () => {
  const b = splitBlocks(BUN)[0]
  if (b?.kind !== 'table') throw new Error('no table')
  const t = b.table

  for (const room of [96, 88, 86, 76, 68]) {
    const { widths, hidden } = layoutTable(t, room)
    if (hidden > 0) continue
    expect(widths[3]).toBeGreaterThanOrEqual(17) // `AsyncLocalStorage`
    expect(widths[2]).toBeGreaterThanOrEqual(12) // `regressions,`
    // No word in a prose cell is cut: every drawn line ends in a whole word.
    for (const row of t.rows) {
      for (const ci of [2, 3]) {
        const cell = row[ci]
        if (cell === undefined) continue
        const text = cellLines(cell, widths[ci] ?? 1, 'prose')
          .map(l => l.map(r => r.t).join(''))
          .join(' ')
        expect(text).not.toMatch(/AsyncLocalStora…/)
      }
    }
  }

  // A word past 24 cells doesn't hold the column wider than 24.
  const long = splitBlocks(`| a | b |\n|---|---|\n| x | ${'w'.repeat(40)} and more words here to wrap |`)[0]
  if (long?.kind !== 'table') throw new Error('no table')
  expect(layoutTable(long.table, 30).widths[1]).toBeLessThanOrEqual(26)
})

// ─── 4. Footnote labels ──────────────────────────────────────────────────────

test('source labels: repo#N for issues and PRs, owner/repo for a repo, host · last segment otherwise', async () => {
  expect(sourceLabel('https://github.com/anthropics/claude-code/issues/108931')).toBe('claude-code#108931')
  expect(sourceLabel('https://github.com/oven-sh/bun/pull/2201/files')).toBe('bun#2201')
  expect(sourceLabel('https://github.com/oven-sh/bun')).toBe('oven-sh/bun')
  expect(sourceLabel('https://github.com/oven-sh/bun/')).toBe('oven-sh/bun')
  expect(sourceLabel('https://bun.com/docs/test/runtime-behavior')).toBe('bun.com · runtime-behavior')
  expect(sourceLabel('https://bun.sh/guides/test/timeout.md')).toBe('bun.sh · timeout')
  expect(sourceLabel('https://www.example.dev/a/index.html?x=1#y')).toBe('example.dev · a')
  expect(sourceLabel('https://bun.com/')).toBe('bun.com')
  expect(sourceLabel('https://bun.com')).toBe('bun.com')

  // The footnote line and the [ SOURCES ] frame use the same labels; only the end clips.
  const cites = [{ n: 1, url: 'https://github.com/anthropics/claude-code/issues/108931', title: 'x' }]
  expect(
    footnoteLines(cites, 96)[0]
      ?.map(p => p.t)
      .join('')
  ).toBe('┄┄┄┄ ¹ claude-code#108931')
  // A URL label clips in the middle: the issue number stays.
  expect(
    footnoteLines(cites, 20)[0]
      ?.map(p => p.t)
      .join('')
  ).toBe('┄┄┄┄ ¹ claude…108931')
  const frame = sourcesFrame(
    [1, 2, 3, 4, 5].map(n => ({ n, url: `https://bun.com/docs/page-${n}`, title: `Page ${n}` })),
    96
  )
  expect(frame[1]?.some(p => p.t === 'bun.com · page-1')).toBe(true)
})

import { expect, test } from 'claude-code/testing'

import { figureLines } from '../../hooks/transcript/figure/draw'
import { partsWidth } from '../../hooks/shared/parts'
import type { Part } from '../../hooks/shared/parts'
import { sourcesFrame } from '../../hooks/transcript/research/sources'
import { frameLines } from '../../hooks/transcript/frame'
import { tasksFrame } from '../../hooks/transcript/states'
import { INSET } from '../../hooks/shared/layout'
import { shippedFrame, testsFrame } from '../../hooks/transcript/outcome'
import { browserTop, urlBar } from '../../hooks/transcript/browser'
import { DIM, frame, HOOKS, fig } from '../support/figures'
import { WIDTHS } from '../support/narrow'
import { TODOS } from '../support/states'
import { OFF } from '../support/cockpit'

const PEACH = '#fab387'

test('labels: every frame title is accent, normal weight, with dim brackets', OFF, async ($, on) => {
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

test('narrow frames go full width, every row exactly the content width', async () => {
  for (const c of WIDTHS) {
    const w = c - INSET
    const frames = [
      testsFrame(
        w,
        { id: 'x', runner: 'claude plugin test', passed: 145, failed: 3, skipped: 2 },
        { id: 'w', runner: 'claude plugin test', passed: 140, failed: 8, skipped: 2 },
        72_000
      ),
      shippedFrame(w, {
        id: 'x',
        commit: { sha: 'a1b2c3d', subject: 'fix(toast): dedupe by message key across the queue', files: 3, adds: 48, dels: 12 },
        pr: { n: 148, url: 'https://github.com/me/app/pull/148', head: 'feature/toast-rebuild', base: 'main' }
      }),
      sourcesFrame(
        [1, 2, 3, 4, 5].map(n => ({ n, url: `https://docs.example.dev/${'deep/'.repeat(8)}${n}`, title: `A rather long source title ${n}` })),
        w
      ),
      [browserTop(w, 'playwright'), urlBar(w, 'http://localhost:5173/products?page=6&mode=lunar', { t: '●', color: '' }, '0.4s')]
    ]
    for (const lines of frames) for (const l of lines) expect(partsWidth(l)).toBe(w)
  }
})

test('every framed line is exactly the frame width, at any measure', async () => {
  for (const width of [96, 70, 40, 24]) {
    for (const lines of [
      tasksFrame(width, TODOS),
      frameLines(width, 'A VERY LONG TITLE '.repeat(9), { t: 'meta', color: '' }, [[{ t: 'x'.repeat(300), color: '' }]])
    ]) {
      expect(lines).toBeDefined()
      expect(lines?.length).toBeGreaterThan(0)
      for (const l of lines ?? []) expect(partsWidth(l)).toBe(width)
    }
  }
})

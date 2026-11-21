import { expect, test } from 'claude-code/testing'

import { browserTarget, browserTool, browserVerb, openRunBefore, urlBar, browserTop, browserBottom } from '../../hooks/transcript/browser'
import { partsWidth } from '../../hooks/shared/parts'

test('browser: tools, verbs and targets from the real Playwright shapes', async () => {
  const b = browserTool('mcp__playwright__browser_navigate')
  expect(b).toEqual({ engine: 'playwright', action: 'navigate' })
  expect(browserTool('mcp__github__list_pull_requests')).toBe(undefined)
  expect(browserTool('Read')).toBe(undefined)
  if (b === undefined) throw new Error('no tool')
  expect(browserVerb(b, { url: 'http://localhost:5173/products?page=6' })).toBe('goto')
  expect(browserTarget(b, { url: 'http://localhost:5173/products?page=6' })).toBe('/products?page=6')
  const type = { engine: 'playwright', action: 'type' }
  expect(browserVerb(type, {})).toBe('fill')
  expect(browserTarget(type, { element: 'search', ref: 'e3', text: 'teal mug' })).toBe('search  ›  "teal mug"')
  expect(browserVerb({ engine: 'chrome', action: 'computer' }, { action: 'left_click' })).toBe('click')
  expect(browserVerb({ engine: 'playwright', action: 'take_screenshot' }, {})).toBe('capture')

  for (const width of [96, 50]) {
    expect(partsWidth(browserTop(width, 'playwright'))).toBe(width)
    expect(partsWidth(browserBottom(width, 5))).toBe(width)
    expect(partsWidth(urlBar(width, 'http://localhost:5173/' + 'deep/'.repeat(30), { t: '●', color: '' }, '0.4s'))).toBe(width)
  }

  const flow = [
    { turn: 't', kind: 'text' as const, key: 'a' },
    { turn: 't', kind: 'tool' as const, key: '1', tool: 'mcp__playwright__browser_navigate' },
    { turn: 't', kind: 'tool' as const, key: '2', tool: 'mcp__playwright__browser_click' }
  ]
  expect(openRunBefore(flow, 1, 't')).toBe(0)
  expect(openRunBefore(flow, 2, 't')).toBe(1)
  expect(openRunBefore(flow, 3, 't')).toBe(2)
  expect(openRunBefore(flow, 3, 'other')).toBe(0)
})

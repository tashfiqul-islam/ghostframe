import { expect, test } from 'claude-code/testing'

import { PILL, TINT, TOKEN, TRACE_STEPS } from '../../../hooks/shared/look/palette'

test('section 2: the tokens, tints, pills and trace steps, with exactly the spec`s hexes', () => {
  expect(TOKEN).toEqual({
    bg: '#0B0B0E',
    surface: '#14141B',
    code: '#0F0F14',
    codeHead: '#16161D',
    pane: '#0D0E12',
    paneCard: '#13141A',
    hairline: '#1E1E26',
    spine: '#24242E',
    textBright: '#ECECF1',
    text: '#B2B2BC',
    muted: '#7C7C88',
    dim: '#5E5E6A',
    accent: '#FAB387',
    machine: '#7EC8BE',
    machineDim: '#4E7A75',
    ok: '#96D292',
    err: '#EC84A0',
    warn: '#E8B98A',
    agent: '#B4A0DE',
    link: '#8FB8DE',
    barDone: '#3F6E68',
    wordmark: '#3A4846',
    wordmarkVersion: '#56706B'
  })
  // The trace's seven steps, from its low end to `machine`.
  expect(TRACE_STEPS).toEqual(['#2E3A39', '#3B524F', '#496965', '#56817C', '#639992', '#71B0A8', '#7EC8BE'])
  expect(TRACE_STEPS.at(-1)).toBe(TOKEN.machine)
  expect(Object.keys(TINT)).toEqual(['addedLine', 'addedWord', 'removedLine', 'removedWord', 'errCard', 'zebra', 'drawer', 'selected', 'dividerFocused'])
  expect(PILL).toEqual({ done: '#132019', live: '#2A1D15', failed: '#24141A', needsYou: '#241C12', plan: '#10201E', agent: '#1C1726' })
  for (const v of [...Object.values(TOKEN), ...Object.values(TINT), ...Object.values(PILL), ...TRACE_STEPS]) {
    expect(v).toMatch(/^#[0-9A-F]{6}$/)
  }
})

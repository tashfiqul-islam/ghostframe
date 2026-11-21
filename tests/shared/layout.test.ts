import { expect, test } from 'claude-code/testing'

import { measure, INSET, layout } from '../../hooks/shared/layout'
import { WIDTHS } from '../support/narrow'

test('one measure: min(96, viewport − 14)', async () => {
  expect(measure(120)).toBe(96)
  expect(measure(100)).toBe(86)
  expect(measure(undefined)).toBe(undefined)
})
test('layout: under 100 columns the gutter folds to a 2-column inset at full width', async () => {
  expect(layout(120)).toEqual({ width: 96, gutter: 12, narrow: false })
  expect(layout(100)).toEqual({ width: 86, gutter: 12, narrow: false })
  for (const c of WIDTHS) expect(layout(c)).toEqual({ width: c - INSET, gutter: INSET, narrow: true })
})

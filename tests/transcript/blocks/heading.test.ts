import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'
import { LINEAR_MS, ms } from '../../support/linear'

test('heading: a long run of spaces parses in linear time, closing hashes still go', () => {
  expect(ms(() => splitBlocks(`# a${' '.repeat(3000)}b`))).toBeLessThan(LINEAR_MS)
  expect(splitBlocks('# Title ##')).toEqual([{ kind: 'heading', text: 'Title' }])
  expect(splitBlocks('## Next steps')).toEqual([{ kind: 'heading', text: 'Next steps' }])
  expect(splitBlocks('### A #')).toEqual([{ kind: 'heading', text: 'A' }])
})

test('heading: a `#` that ends a word stays; only a closing run after a space goes', () => {
  expect(splitBlocks('## C#')).toEqual([{ kind: 'heading', text: 'C#' }])
  expect(splitBlocks('# F# and C# ##')).toEqual([{ kind: 'heading', text: 'F# and C#' }])
  expect(splitBlocks('# Issue #')).toEqual([{ kind: 'heading', text: 'Issue' }])
})

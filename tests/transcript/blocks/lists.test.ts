import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'

test('lists parse: bullets and numbers, nesting by 2, a short title line, wrapped items continue', async () => {
  const [b] = splitBlocks('**Test runs**\n- normal runs, 3 times\n  - nested `one`\n- with the\n  timezone changed\n1. first\n10. tenth')
  expect(b?.kind).toBe('list')
  if (b?.kind !== 'list') throw new Error('not a list')
  expect(b.title).toBe('Test runs')
  expect(b.items.map(i => [i.depth, i.marker, i.text])).toEqual([
    [0, '·', 'normal runs, 3 times'],
    [1, '·', 'nested `one`'],
    [0, '·', 'with the timezone changed'],
    [0, '1.', 'first'],
    [0, '10.', 'tenth']
  ])

  const plain = splitBlocks("Why it's close to the limit\n- a")[0]
  expect(plain?.kind === 'list' ? plain.title : undefined).toBe("Why it's close to the limit")
  // A sentence above a list is not a title: the engine keeps the block.
  expect(splitBlocks('I changed these three files today, one at a time.\n- a')[0]?.kind).toBe('markdown')
})

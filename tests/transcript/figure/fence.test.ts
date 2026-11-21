import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'

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

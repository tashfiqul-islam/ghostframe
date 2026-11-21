import { expect, test } from 'claude-code/testing'

import { NO_CAPS, NO_TALLY, capsLine, hookOutcome, tallyText } from '../../hooks/transcript/live'
import { partsWidth } from '../../hooks/shared/parts'
import { W } from '../support/view'

test('capability line: words not icons, kind then names, thought last; nothing used → no line', async () => {
  const line = capsLine({ skills: ['systematic-debugging', 'debug'], hooks: ['PreToolUse allowed'], mcp: ['github'], thoughtMs: 6200 }, W) ?? []
  expect(line.map(p => p.t).join('')).toBe('skills systematic-debugging, debug · hook PreToolUse allowed · mcp github · thought 6s')
  expect(line.map(p => p.t).join('')).not.toMatch(/[◈⚑⊕◦]/)
  expect(line.find(p => p.t === 'skills')?.color).toBe('#686874') // kind muted
  expect(line.find(p => p.t === ' github')?.color).toBe('#4e4e5a') // names dim

  expect(
    capsLine({ ...NO_CAPS, thoughtMs: 6000 }, W)
      ?.map(p => p.t)
      .join('')
  ).toBe('thought for 6s · ctrl+o to read')
  expect(capsLine({ ...NO_CAPS, thoughtMs: 400 }, W)).toBe(undefined)
  expect(capsLine(NO_CAPS, W)).toBe(undefined)
  expect(partsWidth(capsLine({ ...NO_CAPS, skills: ['x'.repeat(300)] }, 40) ?? [])).toBeLessThanOrEqual(40)
})

test('hooks: only a hook that changed something counts (blocked, denied, rewrote)', async () => {
  expect(hookOutcome('PreToolUse', {})).toBe(undefined)
  expect(hookOutcome('PreToolUse', { allow: true })).toBe(undefined)
  expect(hookOutcome('PreToolUse', { ask: 'sure?' })).toBe(undefined)
  expect(hookOutcome('UserPromptSubmit', { additionalContext: ['caveman'] })).toBe(undefined)
  expect(hookOutcome('SessionStart', { additionalContext: ['x'] })).toBe(undefined)
  expect(hookOutcome('PreToolUse', { deny: 'no' })).toBe('PreToolUse denied')
  expect(hookOutcome('PreToolUse', { allow: true, updatedInput: { command: 'ls' } })).toBe('PreToolUse rewrote')
  expect(hookOutcome('UserPromptSubmit', { block: 'stop' })).toBe('UserPromptSubmit blocked')
  expect(hookOutcome('UserPromptSubmit', { suppressOriginalPrompt: true })).toBe('UserPromptSubmit rewrote')
})

test('tally: §5.17 order, plural words, only at level 3', async () => {
  expect(tallyText(NO_TALLY)).toBe('')
  expect(tallyText({ ...NO_TALLY, files: ['a.ts'] })).toBe('') // level 2: files alone
  expect(tallyText({ ...NO_TALLY, skills: ['a', 'b'], hooks: 1, sources: ['u1', 'u2', 'u3'], browser: 5, files: ['a.ts'] })).toBe(
    '2 skills · 1 hook · 3 sources · 5 browser actions · 1 file changed'
  )
})

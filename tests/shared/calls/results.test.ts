import { expect, test } from 'claude-code/testing'

import { stepOf } from '../../../hooks/transcript/activity/steps'
import { changeParts, firstErrorLine } from '../../../hooks/shared/calls/results'
import { clean } from '../../../hooks/shared/calls/tests'
import { OK, ERR } from '../../support/step'

test('change counts never show +0 or −0', async () => {
  const edit = (lines: string[]) =>
    stepOf('Edit', { file_path: 'a' }, { filePath: 'a', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }] }, OK)?.result.map(
      r => r.text
    )

  expect(edit([' a', '+b'])).toEqual(['+1'])
  expect(edit([' a', '-b'])).toEqual(['−1'])
  expect(edit([' a'])).toEqual(['ok'])
  expect(changeParts(0, 0)).toEqual([])
})

test('error detail and shell output lose every escape and control', () => {
  expect(firstErrorLine('\x1b[31merror: boom\x1b[0m')).toBe('error: boom')
  expect(stepOf('Bash', { command: 'x' }, '\x1b[31merror: boom\x1b[0m', ERR)?.detail).toBe('error: boom')
  expect(clean('\x1b]8;;https://x.dev\x07link\x1b]8;;\x1b\\ \x1b(Bok\x07\x00 \x9bdone\ta\r\nb')).toBe('link ok done\ta\nb')
})

test('a read`s result counts the file`s lines: one is `1 line`, and a trailing newline ends a line, never adds one', async () => {
  const read = (file: Record<string, unknown>) =>
    stepOf('Read', { file_path: 'notes.txt' }, { type: 'text', file: { filePath: 'notes.txt', ...file } }, OK)?.result.map(r => r.text)

  // The same file, whatever the engine counted: `hello` and its newline is one line.
  expect(read({ content: 'hello\r\n', numLines: 2 })).toEqual(['1 line'])
  expect(read({ content: 'hello\n', numLines: 1 })).toEqual(['1 line'])
  expect(read({ content: 'hello', numLines: 1 })).toEqual(['1 line'])
  // A blank line before the last newline is a line.
  expect(read({ content: 'a\n\n', numLines: 3 })).toEqual(['2 lines'])
  // No content in the result: the engine's count, its word singular for one.
  expect(read({ numLines: 1 })).toEqual(['1 line'])
  expect(read({ numLines: 12 })).toEqual(['12 lines'])
})

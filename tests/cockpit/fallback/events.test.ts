import { expect, test } from 'claude-code/testing'

import { decisive, failureOf, failureRows } from '../../../hooks/cockpit/fallback/events'
import { newLog, newTurn, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import { vw } from '../../../hooks/shared/text'
import { T0, failed } from '../../support/cockpit'
import { must } from '../../support/fallback'

const text = (rows: { t: string }[][]) => rows.map(r => r.map(p => p.t).join(''))
const settled = (tool: string, input: Record<string, unknown>, said: string) => {
  const log = startStep(newTurn(newLog(null, null), 't1', T0), { id: 'x', tool, input, at: T0 + 30_000 })

  return must(settleStep(log, { id: 'x', tool, input, outcome: failed(said), at: T0 + 41_000 }).steps[0])
}

test('a failed test draws `✕ failed · test · <subject> · <result>` on the turn clock, its decisive lines under it', () => {
  const step = settled('Bash', { command: 'bun test width' }, 'Exit code 1\n 12 pass\n 2 fail\n')
  const excerpt = ['bun test v1.4.4', '', 'expect(width("e\\u0301")).toBe(1) · received 2', '      at tests/width.test.tsx:41:27', 'Exit code 1']
  const failure = failureOf(step, excerpt)
  const rows = text(failureRows(must(failure), 79))

  expect(rows[0]).toMatch(/^✕ failed · test · bun test width · 2 of 14 fail +41s$/)
  expect(vw(rows[0] ?? '')).toBe(79)
  expect(rows.slice(1)).toEqual(['    expect(width("e\\u0301")).toBe(1) · received 2', '    at tests/width.test.tsx:41:27'])
})

test('at a narrow width the failure row still draws whole: the subject is cut, the state word and the clock stay', () => {
  const step = settled('Bash', { command: 'bun test tests/a-very-long-path/that-goes-on/width.test.tsx --bail' }, 'Exit code 1\n 0 pass\n 1 fail\n')
  const rows = text(failureRows(must(failureOf(step, ['error: expected 1, received 2'])), 58))

  expect(rows[0]).toMatch(/^✕ failed · test · bun test tests\/a-very-long-pat.*… +41s$/)
  expect(vw(rows[0] ?? '')).toBe(58)
  expect(rows[1]).toBe('    error: expected 1, received 2')
})

test('a fetch or search that fails draws no row (amendment 6); a step that passed or still runs draws none', () => {
  expect(failureOf(settled('WebFetch', { url: 'https://httpbin.org/status/404' }, 'Request failed with status code 404'), [])).toBeUndefined()

  const running = startStep(newTurn(newLog(null, null), 't1', T0), { id: 'r', tool: 'Bash', input: { command: 'sleep 9' }, at: T0 }).steps[0]
  expect(failureOf(must(running), [])).toBeUndefined()
})

test('decisive lines: the ones that name the error or its place, at most three; else the last line; never the exit code', () => {
  expect(decisive(['a', 'Error: boom', 'b', 'at x.ts:3:1', 'TypeError: y', 'ReferenceError: z'], [])).toEqual(['Error: boom', 'at x.ts:3:1', 'TypeError: y'])
  expect(decisive(['building…', 'done in 3s', 'Exit code 2'], [])).toEqual(['done in 3s'])
  expect(decisive(['exit 1'], ['exit 1'])).toEqual([])
})

test('the tool`s wrapper tags are not part of the error; a line that only repeats the result is not said twice', () => {
  const said = 'No changes to make: old_string and new_string are exactly the same.'
  expect(decisive([`<tool_use_error>${said}</tool_use_error>`], ['notes.txt', said])).toEqual([])
  expect(decisive(['<tool_use_error>Error: File has not been read yet.</tool_use_error>'], [])).toEqual(['Error: File has not been read yet.'])
})

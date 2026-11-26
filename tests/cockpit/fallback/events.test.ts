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

test('a failed test draws the `×` node, its kind, subject and result, and its first decisive line under it (13.1)', () => {
  const step = settled('Bash', { command: 'bun test width' }, 'Exit code 1\n 12 pass\n 2 fail\n')
  const excerpt = ['bun test v1.4.4', '', 'expect(width("e\\u0301")).toBe(1) · received 2', '      at tests/width.test.tsx:41:27', 'Exit code 1']
  const failure = failureOf(step, excerpt)
  const rows = text(failureRows(must(failure), 78))

  expect(rows).toEqual(['             ×  test bun test width   2 of 14 fail', '             │  └ expect(width("e\\u0301")).toBe(1) · received 2'])
})

test('at a narrow width the failure row still draws whole: the title is cut, the result stays', () => {
  const step = settled('Bash', { command: 'bun test tests/a-very-long-path/that-goes-on/width.test.tsx --bail' }, 'Exit code 1\n 0 pass\n 1 fail\n')
  const rows = text(failureRows(must(failureOf(step, ['error: expected 1, received 2'])), 40))

  expect(rows[0]).toMatch(/^ {13}×  test bun test tests\/a-ver.*…   1 of 1 fail$/)
  expect(vw(rows[0] ?? '')).toBe(16 + 40)
  expect(rows[1]).toBe('             │  └ error: expected 1, received 2')
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

// The real output of a live run's first step (README hero, turn 1): `bun test src/width.test.ts 2>&1` chained with
// `Get-Content` of four files, so it ends in settings.json's closing brace. Kept as the engine returned it.
const CHAINED =
  String.raw`Exit code 1
bun test v1.4.4 (38afee6c8)

src\width.test.ts:
error: expect(received).toBe(expected)

Expected: 1
Received: 2

(fail) combining mark [0.08ms]
error: expect(received).toBe(expected)

Expected: 2
Received: 4

(fail) emoji

 1 pass
 2 fail
 3 expect() calls
Ran 3 tests across 1 file. [5.00ms]
// Cells a string takes. Bug: counts UTF-16 code units.
export const width = (s: string): number => s.length
-----
import { expect, test } from 'bun:test'
import { width } from './width'

test('ascii', () => expect(width('abc')).toBe(3))
test('combining mark', () => expect(width('e\u0301')).toBe(1))
test('emoji', () => expect(width('👍🏽')).toBe(2))
-----
# Blocks any ` +
  '`git push`' +
  String.raw` (exit 2 tells Claude Code to block the call and show stderr).
$call = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($call.tool_input.command -match '\bgit\s+push\b') {
  [Console]::Error.WriteLine('pushing is blocked in this repo')
  exit 2
}
exit 0
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -File .claude/hooks/guard-main.ps1"
          }
        ]
      }
    ]
  }
}`

test('a line of only brackets or punctuation is never the decisive line: real bun test output that ends in `}`', () => {
  // The failed step's kept excerpt is its output's last 10 rows (keys/details.ts): here all settings.json.
  const excerpt = CHAINED.split('\n').slice(-10)

  expect(excerpt.at(-1)).toBe('}')
  expect(decisive(excerpt, ['src/width.test.ts', '2 of 3'])).toEqual(['"command": "pwsh -NoProfile -File .claude/hooks/guard-main.ps1"'])
  // Nothing but brackets and punctuation: no line at all, so the row draws no `└` line rather than a lone brace.
  expect(decisive(['{', '  }', '];', '})', '---'], [])).toEqual([])
})

test('the tool`s wrapper tags are not part of the error; a line that only repeats the result is not said twice', () => {
  const said = 'No changes to make: old_string and new_string are exactly the same.'
  expect(decisive([`<tool_use_error>${said}</tool_use_error>`], ['notes.txt', said])).toEqual([])
  expect(decisive(['<tool_use_error>Error: File has not been read yet.</tool_use_error>'], [])).toEqual(['Error: File has not been read yet.'])
})

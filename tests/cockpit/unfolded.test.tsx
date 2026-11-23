import { expect, test } from 'claude-code/testing'

import { ON } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine } from '../support/engine'
import { fallbackEngine, mixedTurn, rowsOf, site } from '../support/fallback'
import { respond } from '../support/respond'

// The ctrl+o view (E.4, F.8, correction D, screen 30): every step a row under the sentence that announced it, an edit's diff
// in place; `/steps n all` prints the same rows; `/copy` adds code, link, steps, turn and diff (E.24, G.78).
const T = new Date(2026, 10, 22, 9, 0, 0).getTime()

const expanded = (id: string, tool: string, input: Record<string, unknown>, output: unknown, columns: number) =>
  site('ToolUse', `u-${id}`, columns, { tool_use_id: id, tool, input, output, isRunning: false, isErrored: false, isInterrupted: false, isExpanded: true })

/** The view says it is ctrl+o's, as the engine's expanded rows do; a folded group says it is not. */
const unfold = async ($: Engine, isExpanded: boolean) =>
  (await $.ui.mount(site('TurnDuration', 'td-view', 200, { word: 'Baked', durationMs: 1_000, isExpanded }))).unmount()

test(
  'ctrl+o: a step row (screen 30): its kind, subject, result 8 cells before the column`s end, its own time; an edit`s diff card under it',
  ON,
  async ($, on) => {
    fallbackEngine(on, { now: T })
    await mixedTurn($, { now: T }, 1)
    await unfold($, true)

    // 200 columns: the text column's 86 cells, from column 16.
    const rows = await rowsOf($, expanded('sh1', 'Bash', { command: 'echo hi' }, { stdout: 'hi\n', stderr: '' }, 200))
    expect(rows[0]).toMatch(/^ {16}shell {3}echo hi +hi +1s$/)
    expect(rows[0]).toHaveLength(16 + 86)
    expect(rows[0]?.lastIndexOf('hi')).toBe(16 + 78 - 2)
    // A command's output stays in the pane's drawer: no frame under the row.
    expect(rows).toHaveLength(1)

    // An edit: its diff in place, as a code card (7.5).
    const edit = await rowsOf($, expanded('ed1', 'Edit', { file_path: 'src/a.ts', old_string: 'a', new_string: 'a\nb' }, {}, 200))
    expect(edit[0]).toMatch(/^ {16}edit {4}src\/a\.ts +\+2 −1 +2s$/)
    expect(edit).toContainEqual(expect.stringMatching(/^ {13}│ {4}TS {3}src\/a\.ts +\+2 −1 {5}c copy *$/))
    expect(edit.some(r => /\+ b *$/.test(r))).toBe(true)

    // Narrow: the text column narrows, the result and the time keep their cells.
    expect((await rowsOf($, expanded('sh1', 'Bash', { command: 'echo hi' }, {}, 100)))[0]).toMatch(/^ {16}shell {3}echo hi +hi +1s$/)
    expect((await rowsOf($, expanded('sh1', 'Bash', { command: 'echo hi' }, {}, 100)))[0]?.length).toBe(16 + 78)

    // Never `ok`; a result row draws nothing (its output is the pane's).
    expect(rows.join('\n')).not.toMatch(/\bok\b/)
    expect(await rowsOf($, site('ToolResult', 'r-sh1', 200, { tool_use_id: 'sh1', tool: 'Bash', output: {}, isErrored: false, isExpanded: true }))).toEqual([])
  }
)
test('ctrl+o: a sentence Claude said while working is a `│` row with the turn clock; the answer and receipt stay', ON, async ($, on) => {
  fallbackEngine(on, { now: T })
  await mixedTurn($, { now: T }, 2)
  await unfold($, true)

  const said = await rowsOf($, site('AssistantMessage', 'm2-ed2', 200, { text: 'Next, Edit for turn 2.', isFirstOfReply: true }))
  expect(said).toEqual(['    09:00:01 │  Next, Edit for turn 2.'])

  // The answer draws as the docked record does, with no capsule, at any width: the view keeps its look across a resize.
  const at = async (columns: number) =>
    rowsOf(
      $,
      site('AssistantMessage', 'm2-answer', columns, {
        text: 'Turn 2: the shell said hi, the edit landed, the page loaded, ls failed, the agent counted two files.',
        isFirstOfReply: true
      })
    )
  const wide = await at(200)
  const narrow = await at(100)
  for (const rows of [wide, narrow]) {
    expect(rows.some(r => /◇  worked/.test(r))).toBe(false)
    expect(rows.at(-1)).toMatch(/×  FAILED   [⣀-⣿]+   5 steps · 1 still failing/)
  }

  // Folded again: the sentence leaves the left.
  await unfold($, false)
  expect(await rowsOf($, site('AssistantMessage', 'm2-ed2', 200, { text: 'Next, Edit for turn 2.', isFirstOfReply: true }))).toEqual([])
})

test('/steps n all prints the turn`s step rows only, no sentences and no diffs, as the command`s output', ON, async ($, on) => {
  fallbackEngine(on, { now: T })
  on('session.messages', () => ({ value: [] }))
  await mixedTurn($, { now: T }, 3)

  const out = await $.command.run({ command: 'steps', args: '1 all', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const lines = (out.text ?? '').split('\n')
  expect(lines[0]).toMatch(/^ {16}shell {3}echo hi +hi +1s$/)
  // One row per step, nothing between them (7.15).
  expect(lines.map(l => l.slice(16, 24).trim())).toEqual(['shell', 'edit', 'fetch', 'shell', 'agent'])
  expect(
    (await $.command.run({ command: 'steps', args: '9 all', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })).text
  ).toBe('no step log for turn 9 · kept: turn 1')
})

const ANSWER = [
  'Here it is, from [the docs](https://example.com/docs):',
  '',
  '```ts',
  'const a = 1',
  '  const b = 2',
  '```',
  '',
  '- nested:',
  '  ```sh',
  '  bun test',
  '  ```',
  '',
  'See https://bun.sh/x.'
].join('\n')

test('/copy code n, link n, steps n, turn n and diff <path>: each copies through $.ui.copy and says so in one notice', ON, async ($, on) => {
  const copied: string[] = []
  fallbackEngine(on, { now: T })
  on('ui.copy', (_, e) => {
    copied.push(e.text)

    return { value: { isCopied: true } }
  })
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'show me the code', toolUses: [], uuid: 'u1' },
      { role: 'assistant', text: ANSWER, toolUses: [], uuid: 'a1' }
    ]
  }))
  on('command.run', () => ({ text: 'the engine`s /copy' }))
  await $.prompt.submit({ text: 'show me the code', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'show me the code', turnId: 'c1' })
  await $.session.append(respond([text('Reading it.'), use('rd', 'Read', { file_path: 'a.ts' })], 'n1'))
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'rd' } as never)
  await $.session.append(respond([text(ANSWER)], 'a1'))
  await $.turn.complete({ answer: ANSWER, durationMs: 2_000, isAborted: false, turnId: 'c1', reason: 'answer' })
  const copy = async (args: string) =>
    (await $.command.run({ command: 'copy', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })).text

  expect(await copy('code 1')).toBe('Copied code block 1 · 2 lines · ts')
  expect(copied.at(-1)).toBe('const a = 1\n  const b = 2')
  expect(await copy('code 2')).toBe('Copied code block 2 · 1 line · sh')
  expect(copied.at(-1)).toBe('bun test')
  expect(await copy('code 3')).toBe('There is no code block 3 · the last answer has 2')

  expect(await copy('link 1')).toBe('Copied link 1 · https://example.com/docs')
  expect(await copy('link 2')).toBe('Copied link 2 · https://bun.sh/x')
  expect(copied.at(-1)).toBe('https://bun.sh/x')

  expect(await copy('turn 1')).toBe('Copied turn 1 · prompt and answer')
  expect(copied.at(-1)).toBe(`> show me the code\n\n${ANSWER}`)

  expect(await copy('steps 1')).toMatch(/^Copied the steps of turn 1 · 2 rows$/)
  expect(copied.at(-1)).toMatch(/^ {4}09:00:00 │  Reading it\.\n {16}read {4}a\.ts +1s$/)
  expect(await copy('steps 4')).toBe('no step log 4 · kept: turn 1')

  expect(await copy('diff nope.ts')).toBe('no diff for nope.ts · no file diffs kept')

  // Plain `/copy`, and any form Cockpit does not add, are the engine's.
  const count = copied.length
  expect(await copy('')).toBe('the engine`s /copy')
  expect(await copy('2')).toBe('the engine`s /copy')
  expect(copied.length).toBe(count)
})

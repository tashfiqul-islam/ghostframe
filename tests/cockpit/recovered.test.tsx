import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { ANSWER, engine, message, text } from '../support/docked'
import { respond } from '../support/respond'
import type { Call } from '../support/docked'
import type { Engine, On } from '../support/engine'

// A failure a later step of the same kind on the same target recovered from is fixed, never still failing (13.1).
// Seen live: an Edit refused because the file had not been read, then the next Edit of the same file succeeded, and
// the receipt said `FAILED · 1 still failing`.

/** A drawn tree's rows, trailing blanks dropped, blank rows and rows another row contains kept out. */
async function rowsIn(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }): Promise<string[]> {
  const texts = (await ui.findAll({ type: 'Text' })).map(x => x.text)

  return texts.filter((x, i) => x.trim().length > 0 && !texts.slice(0, i).some(o => o !== x && o.includes(x))).map(x => x.trimEnd())
}

const NOT_READ = '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>'
const EDITED = { result: { structuredPatch: [{ lines: ['+a', '-b'] }] }, text: 'ok' }
const FILE = 'D:\\repo\\hooks\\width.ts'

/** Runs one typed turn of these calls, in order, and returns its receipt row and the pane's rows. */
async function turnOf($: Engine, on: On, calls: readonly Call[]) {
  const clock = { now: T0 }
  engine(on, calls, clock)
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'fix it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  for (const c of calls) await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
  await $.session.append(respond([text(ANSWER)], 'r1'))
  clock.now += 5_000
  await $.turn.complete({ answer: ANSWER, durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount(message(ANSWER))
  const rows = await rowsIn(ui)
  await ui.unmount()
  const paneRows = await rowsIn(pane)
  await pane.unmount()

  return { receipt: rows.find(r => /DONE|FAILED/.test(r)) ?? '', rows, paneRows }
}

test('an Edit refused because the file was not read, then an Edit of the same file that succeeds: 1 fixed, DONE', ON, async ($, on) => {
  const { receipt, rows } = await turnOf($, on, [
    {
      id: 'e1',
      tool: 'Edit',
      input: { file_path: FILE, old_string: 'a', new_string: 'b' },
      result: { isError: true, text: NOT_READ, result: NOT_READ },
      ms: 1_000
    },
    { id: 'r1', tool: 'Read', input: { file_path: FILE }, result: { result: { file: { content: 'a' } }, text: 'a' }, ms: 1_000 },
    { id: 'e2', tool: 'Edit', input: { file_path: FILE, old_string: 'a', new_string: 'b' }, result: EDITED, ms: 1_000 }
  ])

  expect(receipt).toMatch(/✓ {2}DONE .* 3 steps · 1 fixed · 1 file$/)
  expect(rows.some(r => /still failing/.test(r))).toBe(false)
})

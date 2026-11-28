import { expect, test } from 'claude-code/testing'

import { ON, PANE } from '../support/cockpit'
import { text, use } from '../support/docked'
import { fallbackEngine, MIXED } from '../support/fallback'
import { respond } from '../support/respond'

// What a main-loop tool call costs ghostframe inside its hook, in a long session. A hook's own time is mostly what
// it moves through `$.state`: every value read is copied into ghostframe's worker and every value written is copied
// out, whole, and the copy grows with the value (the harness benchmark, tools/bench, measured a 24 kB list costing
// five times a 2 kB one per write). The budget counts those bytes, which are the same on every runner, unlike a clock.
const LONG = { ...ON, timeoutMs: 300_000 }
const TURNS = 30
// Bytes one call may move through `$.state`, read and written, once the session is long: its step stamps and its
// details written once each at its end, and the step log's two small writes, 42 kB at most here. Before this budget a
// call read and wrote the whole step stamps, details and log twice each, never reading what it had just written: 158 kB.
const CALL_BYTES = 48_000

test('a long session: one tool call moves at most its budget of bytes through $.state', LONG, async ($, on) => {
  const clock = { now: new Date(2026, 10, 21, 10, 0, 0).getTime() }
  const moved = { bytes: 0 }
  fallbackEngine(on, clock, true)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } as never }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } }) as never)
  on('state.get', async (_, e, next) => {
    const got = await next(e)

    moved.bytes += JSON.stringify(got ?? null).length

    return got
  })
  on('state.set', (_, e, next) => {
    moved.bytes += JSON.stringify(e.value ?? null).length

    return next(e)
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()

  const perCall: number[] = []

  for (let n = 1; n <= TURNS; n++) {
    await $.prompt.submit({ text: `turn ${n}`, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: `turn ${n}`, turnId: `turn${n}` })
    for (const c of MIXED(n)) {
      await $.session.append(respond([text(`Next, ${c.tool} for turn ${n}.`), use(c.id, c.tool, c.input)], `m${n}-${c.id}`))
      const before = moved.bytes

      await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
      if (n > TURNS / 2) perCall.push(moved.bytes - before)
    }
    clock.now += 1_000
    await $.turn.complete({ answer: 'done', durationMs: 17_000, isAborted: false, turnId: `turn${n}`, reason: 'answer' })
  }

  expect(Math.max(...perCall)).toBeLessThanOrEqual(CALL_BYTES)
})

import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { groupOf, rowsOf, site } from '../support/fallback'
import { aTurn } from '../support/history'
import { respond } from '../support/respond'
import { holdTimers } from '../support/clock'

// E.47: no turn is left without its numbers. A turn that wrote no answer row draws its receipt (in fallback with its
// capsule) under the row of its last call, which the receipt names (`lastCall`). Nothing comes from what an earlier
// draw decided, so the receipt is there after a reload (`/tui` loads the hooks module again, probe 19) and a resume.
type Store = Map<string, unknown>

function engine(on: On, clock: { now: number }, store: Store, session: string, isPlaced: boolean) {
  let placed = false
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => {
    placed = isPlaced

    return { value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }
  })
  on('ui.panes', () => ({ value: placed ? [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('session.id', () => ({ value: session }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', () => {
    clock.now += 1_000

    return { result: { stdout: 'hi\n', stderr: '' }, text: 'hi' }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

const shell = (id: string) => ({ id, tool: 'Bash', input: { command: 'echo hi' } })

/** A typed turn of two shell calls that ends with no text. */
async function silentTurn($: Engine, clock: { now: number }) {
  await $.prompt.submit({ text: 'run them', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'run them', turnId: 'quiet' })

  for (const id of ['q1', 'q2']) {
    await $.session.append(respond([use(id, 'Bash', { command: 'echo hi' })], `m-${id}`))
    await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: id } as never)
  }

  clock.now += 1_000
  await $.turn.complete({ answer: '', durationMs: 3_000, isAborted: false, turnId: 'quiet', reason: 'answer' })
}

for (const mode of ['docked', 'fallback'] as const) {
  const isDocked = mode === 'docked'
  const columns = isDocked ? 127 : 100

  test(`${mode}: a turn with no text has its receipt under its last call, and still after a reload`, ON, async ($, on) => {
    const clock = { now: T0 }
    engine(on, clock, new Map(), 's1', isDocked)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    if (isDocked) await (await $.ui.mount(PANE)).unmount()
    await silentTurn($, clock)

    // One worked node (7.13): the whole turn's docked, its last stretch's in fallback; then the receipt (7.12).
    const expected = [
      expect.stringMatching(isDocked ? /^ {10}3s ◇  worked   [⣀-⣿]+   2 steps$/ : /^ {10}2s ◇  worked   [⣀-⣿]+   2 steps$/),
      expect.stringMatching(/^ {13}│$/),
      expect.stringMatching(/^ {10}3s ✓  DONE   [⣀-⣿]+   2 steps$/)
    ]
    expect(await rowsOf($, groupOf(shell('q2'), columns))).toEqual(expected)
    // The earlier call's row draws no receipt, and nor does the footer.
    expect(await rowsOf($, groupOf(shell('q1'), columns))).toEqual([])
    expect(await rowsOf($, site('TurnDuration', 'td', columns, { word: 'Baked', durationMs: 3_000 }))).toEqual([])
    // A reload: the row is drawn again under a request the module never saw. It reads only what is kept.
    expect(await rowsOf($, { ...(groupOf(shell('q2'), columns) as object), requestId: 'after-reload' } as never)).toEqual(expected)
  })

  test(`${mode}: after a resume, a kept turn with no text draws its receipt with its counts under its last call`, ON, async ($, on) => {
    const clock = { now: T0 + 999_000 }
    const kept = aTurn(1, T0)
    const last = kept.steps.at(-1)?.id ?? ''
    const receipt = {
      turn: 'e1',
      turnNo: 1,
      answer: '',
      lastCall: last,
      state: 'done' as const,
      agents: 0,
      steps: 20,
      failures: 0,
      fixed: 0,
      files: 3,
      commit: '',
      open: [],
      durationMs: 61_000
    }
    engine(on, clock, new Map([['history:resumed', { savedAt: T0, turns: [{ ...kept, receipts: [receipt] }] }]]), 'resumed', isDocked)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    if (isDocked) await (await $.ui.mount(PANE)).unmount()

    // No flow survives a resume, so no capsule is drawn: the receipt carries the steps itself (amendment 9).
    const receiptRow = expect.stringMatching(/^ {6}1m 01s ✓  DONE   [⣀-⣿]+   20 steps · 3 files$/)
    const rows = await rowsOf($, groupOf(shell(last), columns))

    expect(rows).toEqual(
      isDocked
        ? [expect.stringMatching(/^ {6}1m 01s ◇  worked   [⣀-⣿]+   20 steps$/), expect.stringMatching(/^ {13}│$/), receiptRow]
        : [expect.stringMatching(/^ {13}│$/), receiptRow]
    )
  })
}

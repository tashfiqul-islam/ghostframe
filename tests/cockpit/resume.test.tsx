import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { On } from '../support/engine'
import { rowsOf, site } from '../support/fallback'
import { aTurn } from '../support/history'
import { respond } from '../support/respond'

// Narration after a resume (amendment 10): live, a text block that a tool call follows leaves the left, decided from
// the flow in the session's state. A resumed session starts with no flow, so each kept turn records its narration's
// row ids in history (the store), and a resumed block with such an id stays hidden too.
type Store = Map<string, unknown>

function engine(on: On, clock: { now: number }, store: Store, session: string, isPlaced: boolean) {
  on('clock.now', () => ({ value: clock.now }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
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

const SAID = 's1-s5 done; running ls /nope next.'
const ANSWER = 'All of it ran; ls /nope failed as expected.'

test('a live turn keeps its narration`s row ids in its history entry in the store', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store, 'live', true)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'go', turnId: 'e1' })
  await $.session.append(respond([text(SAID), use('c1', 'Bash', { command: 'echo hi' })], 'row-said'))
  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'c1' } as never)
  await $.session.append(respond([text(ANSWER)], 'row-answer'))
  await $.turn.complete({ answer: ANSWER, durationMs: 2_000, isAborted: false, turnId: 'e1', reason: 'answer' })

  const kept = store.get('history:live') as { turns: { narration?: string[] }[] }
  expect(kept.turns.map(t => t.narration)).toEqual([['row-said']])
})

for (const mode of ['docked', 'fallback'] as const) {
  const isDocked = mode === 'docked'
  const columns = isDocked ? 127 : 100

  test(`${mode}: a resumed transcript draws none of its narration, before and after the session starts; the answer and receipt draw`, ON, async ($, on) => {
    const clock = { now: T0 + 999_000 }
    const receipt = {
      turn: 'e1',
      turnNo: 1,
      answer: 'row-answer',
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
    const turns = [{ ...aTurn(1, T0), receipts: [receipt], narration: ['row-said'] }]
    engine(on, clock, new Map([['history:resumed', { savedAt: T0, turns }]]), 'resumed', isDocked)
    const said = site('AssistantMessage', 'row-said', columns, { text: SAID, isFirstOfReply: true })
    const answer = site('AssistantMessage', 'row-answer', columns, { text: ANSWER, isFirstOfReply: true })

    // The engine draws the resumed transcript before `session.start` (amendment 8).
    expect(await rowsOf($, said)).toEqual([])
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    if (isDocked) await (await $.ui.mount(PANE)).unmount()

    expect(await rowsOf($, said)).toEqual([])
    const drawn = await rowsOf($, answer)
    expect(drawn.some(r => r.includes(ANSWER))).toBe(true)
    expect(drawn.at(-1)).toMatch(/^─ done ─+ 20 steps · 3 files · 1m 01s$/)
  })
}

test('Cockpit on by GHOSTFRAME_COCKPIT alone: a resumed row drawn before the session starts draws Cockpit`s docked look at once', async ($, on) => {
  const clock = { now: T0 + 999_000 }
  const receipt = {
    turn: 'e1',
    turnNo: 1,
    answer: 'row-answer',
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
  const turns = [{ ...aTurn(1, T0), receipts: [receipt], narration: ['row-said'] }]
  engine(on, clock, new Map([['history:resumed', { savedAt: T0, turns }]]), 'resumed', true)
  on('env.get', (_, e) => ({ value: e.name === 'GHOSTFRAME_COCKPIT' ? '1' : undefined }))
  const wide = (requestId: string, t: string) =>
    ({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      viewport: { columns: 200, rows: 50, isFullscreen: true },
      props: { text: t, isFirstOfReply: true }
    }) as never

  // No `session.start` yet, no pane: the env is read by the first draw, and the row takes the mode the seat will give
  // at 200 columns (docked): its narration hidden, no capsule, the receipt with its steps.
  expect(await rowsOf($, wide('row-said', SAID))).toEqual([])
  const answer = await rowsOf($, wide('row-answer', ANSWER))
  expect(answer.some(r => r.startsWith('│ worked'))).toBe(false)
  expect(answer.at(-1)).toMatch(/^─ done ─+ 20 steps · 3 files · 1m 01s$/)
})

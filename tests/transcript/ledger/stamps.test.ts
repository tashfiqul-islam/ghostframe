import { expect, test } from 'claude-code/testing'

import { ON, T0 } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { aTurn } from '../../support/history'

// Each typed prompt's stamp carries what its turn rule needs after a resume (amendment 12): the row the engine draws
// it under, its turn number (the step log's) and what came right before it. Kept in the state and in the store.
type Store = Map<string, unknown>
type Stamp = { text: string; at: number; row?: string; turnNo?: number; after?: string }

function engine(on: On, clock: { now: number }, store: Store, denied: Set<string> = new Set()) {
  on('clock.now', () => ({ value: clock.now }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('clock.every', () => ({ value: { cancel: () => undefined } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('session.id', () => ({ value: 's1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', (_, e) => {
    const after = (e as { after?: string }).after

    return { value: (after !== undefined && denied.has(after) ? { deny: `row ${after} was rewound` } : []) as never }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('session.compact', (_, e) => ((e as { instructions?: string }).instructions === 'skip' ? { skip: 'kept as it is' } : { messages: SUMMARY }) as never)
  on('ui.log', () => ({ value: undefined }))
}

const SUMMARY = [{ role: 'user', text: 'Summary of the conversation so far.', toolUses: [] }]

/** A typed turn as the engine runs it: the submit, the prompt's stored row, the turn. */
async function typed($: Engine, clock: { now: number }, text: string, turnId: string, row: string) {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: row
  } as never)
  await $.turn.start({ text, turnId })
  clock.now += 5_000
  await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, turnId, reason: 'answer' })
  clock.now += 60_000
}

/** A turn no prompt was typed for: an agent's report. */
async function reported($: Engine, clock: { now: number }, turnId: string) {
  await $.prompt.submit({ text: 'Agent report: 3 files', wait: false, origin: { kind: 'peer' }, isMeta: true } as never)
  await $.turn.start({ text: 'Agent report: 3 files', turnId })
  clock.now += 2_000
  await $.turn.complete({ answer: 'noted', durationMs: 2_000, isAborted: false, turnId, reason: 'answer' })
}

const kept = (store: Store) => (store.get('prompts:s1') ?? []) as Stamp[]

test('live: each typed stamp keeps its row and its turn number, in the store; an agent report`s turn takes none', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await typed($, clock, 'first', 'e1', 'u1')
  await reported($, clock, 'e2')
  await typed($, clock, 'second', 'e3', 'u3')

  expect(kept(store).map(s => [s.text, s.row, s.turnNo, s.after])).toEqual([
    ['first', 'u1', 1, undefined],
    ['second', 'u3', 2, undefined]
  ])
})

test('a stamp gets its predicted number at the submit, before its turn starts', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await typed($, clock, 'first', 'e1', 'u1')

  await $.prompt.submit({ text: 'queued', wait: false, origin: { kind: 'composer' } })
  expect(kept(store).at(-1)?.turnNo).toBe(2)
})

test('a resume: the first typed turn after it is RESUMED and takes the next number; the one after is plain', ON, async ($, on) => {
  const clock = { now: T0 + 86_400_000 }
  const store: Store = new Map<string, unknown>([
    ['prompts:s1', [{ text: 'old', at: T0, row: 'u0', turnNo: 4 }]],
    ['history:s1', { savedAt: T0, turns: [aTurn(4, T0)] }]
  ])
  engine(on, clock, store)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await typed($, clock, 'back again', 'e5', 'u5')
  await typed($, clock, 'and on', 'e6', 'u6')

  expect(kept(store).map(s => [s.turnNo, s.after])).toEqual([
    [4, undefined],
    [5, 'resume'],
    [6, undefined]
  ])
})

test('a compaction: the next typed turn is AFTER COMPACT; a precompute or a skipped one leaves it plain', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await typed($, clock, 'one', 'e1', 'u1')

  await $.session.compact({ trigger: 'precompute', messages: SUMMARY } as never)
  await $.session.compact({ trigger: 'manual', messages: SUMMARY, instructions: 'skip' } as never)
  await typed($, clock, 'two', 'e2', 'u2')
  await $.session.compact({ trigger: 'manual', messages: SUMMARY } as never)
  await typed($, clock, 'three', 'e3', 'u3')

  expect(kept(store).map(s => s.after)).toEqual([undefined, undefined, 'compact'])
})

test('a rewind: when the previous prompt`s row is gone from the conversation, the next typed turn is AFTER REWIND', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  const denied = new Set<string>()
  engine(on, clock, store, denied)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await typed($, clock, 'one', 'e1', 'u1')
  await typed($, clock, 'two', 'e2', 'u2')

  denied.add('u2')
  await typed($, clock, 'two, again', 'e3', 'u3')

  expect(kept(store).map(s => [s.turnNo, s.after])).toEqual([
    [1, undefined],
    [2, undefined],
    [3, 'rewind']
  ])
})

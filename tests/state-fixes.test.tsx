import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { textAt } from './text'

// Session-state fixes: each row keeps what it claimed, a failing clock still settles a
// step, long turns keep their head, and openers match only within their own turn.

const VIEW = { columns: 120, rows: 40 }

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never

const typed = (text: string, uuid: string, door: 'prompt' | 'command' = 'prompt') =>
  ({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
    door,
    origin: { kind: 'composer' },
    uuid
  }) as never

const engine = (on: On) => on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

const reply = ($: Engine, text: string, requestId?: string) =>
  $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    ...(requestId !== undefined ? { requestId } : {}),
    props: { text, isFirstOfReply: true }
  })

const hasClaude = async (ui: Awaited<ReturnType<typeof reply>>) => (await ui.find({ type: 'Text', text: /^claude$/ })) !== undefined

// ─── CORR-02: each footer row keeps the close it first drew ──────────────────

test('footer: a row keeps its own turn when a later turn of about the same length lands', async ($, on) => {
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const run = async (turnId: string, durationMs: number, tokens: number) => {
    await $.turn.start({ text: 'again', turnId })
    await $.session.append(respond([{ type: 'text', text: `Turn ${turnId}.` }], `a-${turnId}`))
    await $.turn.complete({ answer: '', durationMs, isAborted: false, turnId, reason: 'answer', usage: { output_tokens: tokens } } as never)
  }
  const footer = (requestId: string, durationMs: number) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'TurnDuration',
      requestId,
      viewport: { columns: 140, rows: 40 },
      props: { word: 'Baked', durationMs }
    } as never)
  const shown = async (ui: Awaited<ReturnType<typeof footer>>) => textAt(await ui.drawn(), 140).join('\n')

  // A's row draws while A is the only close: the one fit.
  await run('A', 5000, 100)
  const a = await footer('fA', 5000)
  expect(await shown(a)).toContain('5s · 100 tokens')

  // B (within 250ms of A) lands; A's row draws again before B's row exists.
  await run('B', 5200, 200)
  expect(await shown(a)).toContain('5s · 100 tokens')
  const b = await footer('fB', 5200)
  expect(await shown(b)).toContain('5s · 200 tokens')

  await run('C', 9000, 300)
  const c = await footer('fC', 9000)
  expect(await shown(c)).toContain('9s · 300 tokens')
  expect(await shown(a)).toContain('5s · 100 tokens')
  expect(await shown(b)).toContain('5s · 200 tokens')
})

// ─── CORR-01: the same prompt typed twice ────────────────────────────────────

test('a prompt typed twice: each turn rule shows its own submit time, kept when the next lands', async ($, on) => {
  let now = new Date(2026, 10, 17, 2, 10).getTime()
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: now }))
  const rule = (requestId: string) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'UserMessage',
      requestId,
      viewport: VIEW,
      props: { text: 'continue', origin: { kind: 'composer' }, isExpanded: false }
    } as never)
  const shown = async (ui: Awaited<ReturnType<typeof rule>>) => textAt(await ui.drawn(), 120).join('\n')

  await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  const first = await rule('u1')
  expect(await shown(first)).toContain('02:10')

  now = new Date(2026, 10, 17, 2, 15).getTime()
  await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  const second = await rule('u2')
  expect(await shown(second)).toContain('02:15')
  expect(await shown(first)).toContain('02:10')
  expect(await shown(first)).not.toContain('02:15')
})

// ─── CORR-04: a clock that fails mid-call ────────────────────────────────────

test('a clock that fails at a call’s start or end: the step still settles, no time from 0', async ($, on) => {
  engine(on)
  let now = new Date(2026, 10, 17, 2, 10).getTime()
  let down = false
  on('clock.now', () => {
    if (down) throw new Error('clock down')

    return { value: (now += 1000) }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  // r1: the start fails, the end reads. r2: the start reads, the end fails.
  on('tool.call', (_, e) => {
    down = e.tool_use_id === 'r2'

    return { result: { type: 'text', file: { numLines: 3 } } }
  })
  await $.turn.start({ text: 'read two', turnId: 't1' })
  down = true
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'r1' } as never)
  down = false
  await $.tool.call({ tool: 'Read', file_path: 'b.ts', tool_use_id: 'r2' } as never)
  down = false

  const row = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: {
      tool_use_id: 'r1',
      tool: 'Read',
      input: { file_path: 'a.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { type: 'text', file: { numLines: 3 } }
    }
  })
  const rows = textAt(await row.drawn(), 120)
  await row.unmount()
  const head = rows.find(l => l.includes('activity')) ?? ''
  const step = rows.find(l => l.includes('a.ts')) ?? ''

  // Both steps settled: the rule carries a wall time, a sane one.
  expect(head).toMatch(/2 steps · \d+(\.\d)?s$/)
  // The first step's time is not counted from 0 (that read as decades).
  expect(step).toMatch(/0\.0s$/)
})

// ─── CORR-10: a turn that ends with no reply clears the opener wait ──────────

test('a command whose turn ends with no reply: the next unprompted turn’s prose is no opener', async ($, on) => {
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.append(typed('/effort high', 'c1', 'command'))
  await $.turn.start({ text: '/effort high', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 100, isAborted: true, turnId: 't1', reason: 'aborted' } as never)

  // A turn nobody typed (a background task's delivery): its prose opens nothing.
  await $.turn.start({ text: '', turnId: 't2' })
  await $.session.append(respond([{ type: 'text', text: 'The background build finished and it is green.' }], 'r2'))
  const unprompted = await reply($, 'The background build finished and it is green.')
  expect(await hasClaude(unprompted)).toBe(false)
  await unprompted.unmount()
  await $.turn.complete({ answer: '', durationMs: 900, isAborted: false, turnId: 't2', reason: 'answer' } as never)

  // A typed prompt's turn still opens with `claude`.
  await $.session.append(typed('what changed?', 'p3'))
  await $.turn.start({ text: 'what changed?', turnId: 't3' })
  await $.session.append(respond([{ type: 'text', text: 'Only the lockfile changed in that build.' }], 'r3'))
  const opener = await reply($, 'Only the lockfile changed in that build.')
  expect(await hasClaude(opener)).toBe(true)
  await opener.unmount()
})

// ─── CORR-08: a resumed prompt that starts with `<` ──────────────────────────

test('history: a typed prompt that starts with `<` (pasted HTML) still opens its turn; injected tags do not', async ($, on) => {
  engine(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: '<command-name>/model</command-name>', toolUses: [] },
      { role: 'assistant', text: 'Set the model to the default one for now.', toolUses: [] },
      { role: 'user', text: '<div class="card">renders twice</div> why?', toolUses: [] },
      { role: 'assistant', text: 'The card renders twice because its effect runs on mount.', toolUses: [] }
    ]
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const pasted = await reply($, 'The card renders twice because its effect runs on mount.')
  expect(await hasClaude(pasted)).toBe(true)
  await pasted.unmount()

  const injected = await reply($, 'Set the model to the default one for now.')
  expect(await hasClaude(injected)).toBe(false)
  await injected.unmount()
})

// ─── CORR-03: a long turn keeps its first step ───────────────────────────────

test('a turn with 450 steps keeps its activity head on its first step', { timeoutMs: 60_000 }, async ($, on) => {
  engine(on)
  let now = 0
  on('clock.now', () => ({ value: (now += 100) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { type: 'text', file: { numLines: 3 } } }))
  await $.turn.start({ text: 'big job', turnId: 't1' })
  for (let i = 1; i <= 450; i++) await $.tool.call({ tool: 'Read', file_path: `f${i}.ts`, tool_use_id: `r${i}` } as never)

  const first = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: {
      tool_use_id: 'r1',
      tool: 'Read',
      input: { file_path: 'f1.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { type: 'text', file: { numLines: 3 } }
    }
  })
  expect(await first.find({ type: 'Text', text: /^activity $/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^ 450 steps · / })).toBeDefined()
  await first.unmount()
})

// ─── CORR-06: an opener matches only within its own turn ─────────────────────

test('mid-turn prose that starts like an earlier turn’s opener gets no `claude`', async ($, on) => {
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const OPENER = 'Let me check the tests first, then run the whole suite.'

  await $.session.append(typed('check it', 'p1'))
  await $.turn.start({ text: 'check it', turnId: 't1' })
  await $.session.append(respond([{ type: 'text', text: OPENER }], 'a1'))
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)

  await $.session.append(typed('now fix it', 'p2'))
  await $.turn.start({ text: 'now fix it', turnId: 't2' })
  await $.session.append(respond([{ type: 'text', text: 'Something else opens this turn.' }], 'b1'))
  await $.session.append(respond([{ type: 'tool_use', id: 'k1', name: 'Read', input: { file_path: 'a.ts' } }], 'b2'))

  // Streaming, its text so far a prefix of turn 1's opener: still not turn 2's opener.
  const mid = await reply($, 'Let me check the tests first, then')
  expect(await hasClaude(mid)).toBe(false)
  await mid.unmount()

  // Both openers keep their label.
  const own = await reply($, 'Something else opens this turn.')
  expect(await hasClaude(own)).toBe(true)
  await own.unmount()
  const earlier = await reply($, OPENER)
  expect(await hasClaude(earlier)).toBe(true)
  await earlier.unmount()
})

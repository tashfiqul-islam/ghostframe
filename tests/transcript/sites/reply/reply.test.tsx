import { expect, test } from 'claude-code/testing'

import { VIEW } from '../../../support/view'
import { respond } from '../../../support/respond'
import { engine } from '../../../support/engine'
import type { Engine } from '../../../support/engine'
import { REPLY } from '../../../support/turn'
import { OFF } from '../../../support/cockpit'

test('a plain Q&A turn under an every-prompt hook has no capability line at all', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['caveman'] }))

  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'what is a worktree?' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'q1'
  } as never)
  await $.classic.UserPromptSubmit({ prompt: 'what is a worktree?' })
  await $.turn.start({ text: 'what is a worktree?', turnId: 'q' })
  await $.session.append(respond([{ type: 'text', text: 'A worktree is a second checked-out folder.' }], 'qa'))

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'A worktree is a second checked-out folder.', isFirstOfReply: true }
  })
  expect(await ui.findAll({ type: 'Text', text: /^claude$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /hook|UserPromptSubmit|thought/ })).toBeUndefined()
  await ui.unmount()
})

test('the opener carries the capability line: a skill, the thinking before it; a context-only hook stays off', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let now = 0
  on('clock.now', () => ({ value: (now += 3000) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('skill.prompt', () => ({ text: 'skill body' }))
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['caveman'] }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'thinking', index: 0, text: 'hm' }
    yield { kind: 'text', index: 1, text: 'Found it.' }
    return { turnId: e.turnId, index: 0, answer: 'Found it.', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })

  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: '/debug the toast' }] },
    door: 'command',
    origin: { kind: 'composer' },
    uuid: 'p1'
  } as never)
  await $.classic.UserPromptSubmit({ prompt: '/debug the toast' })
  await $.skill.prompt({ skill: 'superpowers:systematic-debugging', text: 'x', frontmatter: {}, source: 'userSettings' })
  await $.turn.start({ text: '/debug the toast', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
    // drain
  }
  await $.session.append(respond([{ type: 'text', text: 'Found it. The toast fires twice in one tick.' }], 'r1'))

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'Found it. The toast fires twice in one tick.', isFirstOfReply: true }
  })
  expect(await ui.findAll({ type: 'Text', text: /^claude$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^skill$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ systematic-debugging$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /UserPromptSubmit/ })).toBeUndefined() // it only added context
  expect(await ui.find({ type: 'Text', text: /thought|^ 3s$/ })).toBeUndefined() // 3s on a turn with no tools: hidden
  expect(await ui.find({ type: 'Text', text: /The toast fires twice/ })).toBeDefined()
  await ui.unmount()

  // A plain later block in the same turn: no line, no label.
  await $.session.append(respond([{ type: 'text', text: 'A later block.' }], 'r2'))
  const later = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'A later block.', isFirstOfReply: true }
  })
  expect(await later.find({ type: 'Text', text: /^skill$/ })).toBeUndefined()
  await later.unmount()
})

test('prose right after a browser run closes its frame above itself', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.session.append(respond([{ type: 'tool_use', id: 'b1', name: 'mcp__playwright__browser_snapshot', input: {} }], 'r1'))
  await $.session.append(respond([{ type: 'text', text: 'The page shows two toasts.' }], 'r2'))

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'The page shows two toasts.', isFirstOfReply: true }
  })
  expect(await ui.find({ type: 'Text', text: /^1 action$/ })).toBeDefined()
  await ui.unmount()
})

// ─── Final evidence, quiet counts, frozen cards, thinking ──────

test('thinking: hidden on a turn with no tools; shown on a work turn; shown past 10s anywhere', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const MS = 4000
  let now = 0
  let calls = 0
  on('clock.now', () => ({ value: (now += calls++ % 2 === 0 ? 1 : MS) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'thinking', index: 0, text: 'hm' }
    yield { kind: 'text', index: 1, text: 'x' }
    return { turnId: e.turnId, index: 0, answer: 'x', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })

  const turn = async (id: string, content: unknown[]) => {
    await $.session.append({
      message: { type: 'user', role: 'user', content: [{ type: 'text', text: id }] },
      door: 'prompt',
      origin: { kind: 'composer' },
      uuid: `p-${id}`
    } as never)
    await $.turn.start({ text: id, turnId: id })
    for await (const _ of $.turn.step({ turnId: id, index: 0, model: 'm', messageCount: 1 })) {
      // drain
    }
    await $.session.append(respond(content, `r-${id}`))
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
  }
  on('turn.complete', (_, e) => ({ text: e.answer }))

  // Plain Q&A, 4s of thinking: no line.
  await turn('qa', [{ type: 'text', text: 'A plain answer about worktrees and branches.' }])
  const qa = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'A plain answer about worktrees and branches.', isFirstOfReply: true }
  })
  expect(await qa.find({ type: 'Text', text: /thought/ })).toBeUndefined()
  await qa.unmount()

  // A turn that opens on a tool: a work turn, the line shows.
  await turn('work', [{ type: 'tool_use', id: 'w1', name: 'Read', input: { file_path: 'a.ts' } }])
  const work = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: {
      tool_use_id: 'w1',
      tool: 'Read',
      input: { file_path: 'a.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { type: 'text', file: { numLines: 2 } }
    }
  })
  expect(await work.find({ type: 'Text', text: /^thought for 4s$/ })).toBeDefined()
  await work.unmount()
})

test('thinking past 10s shows even with no tools', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const MS = 12000
  let now = 0
  let calls = 0
  on('clock.now', () => ({ value: (now += calls++ % 2 === 0 ? 1 : MS) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'thinking', index: 0, text: 'hm' }
    yield { kind: 'text', index: 1, text: 'x' }
    return { turnId: e.turnId, index: 0, answer: 'x', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'q' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'p'
  } as never)
  await $.turn.start({ text: 'q', turnId: 'long' })
  for await (const _ of $.turn.step({ turnId: 'long', index: 0, model: 'm', messageCount: 1 })) {
    // drain
  }
  await $.session.append(respond([{ type: 'text', text: 'A long-considered plain answer here.' }], 'r'))
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: 'A long-considered plain answer here.', isFirstOfReply: true }
  })
  expect(await ui.find({ type: 'Text', text: /^thought for 12s$/ })).toBeDefined()
  await ui.unmount()
})

test('narration: prose a tool call follows is dim; the final answer and plain Q&A are normal', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.session.append(respond([{ type: 'text', text: 'Reading the config first.' }], 'a'))
  await $.session.append(respond([{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'a' } }], 'b'))
  await $.session.append(respond([{ type: 'text', text: 'Fixed. The **config** was wrong.' }], 'c'))

  const color = async (text: string) => {
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: VIEW,
      props: { text, isFirstOfReply: true }
    })
    // The coloured spans, not the line Text that holds them.
    const spans = (await ui.findAll({ type: 'Text' })).filter(t => t.props['color'] !== undefined)
    const found = spans.find(t => /^(Reading|Fixed\.)$/.test(t.text)) // one span per word
    const bold = spans.find(t => t.text === 'config')
    await ui.unmount()
    return [found?.props['color'], bold?.props['color']]
  }

  expect((await color('Reading the config first.'))[0]).toBe('#4e4e5a')
  expect(await color('Fixed. The **config** was wrong.')).toEqual(['#b2b2bc', '#ececf1'])

  await $.turn.start({ text: 'q', turnId: 't2' })
  await $.session.append(respond([{ type: 'text', text: 'Reading a worktree is like a branch.' }], 'd'))
  expect((await color('Reading a worktree is like a branch.'))[0]).toBe('#b2b2bc')
})
const typed = (text: string, uuid: string, door: 'prompt' | 'command' = 'prompt') =>
  ({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
    door,
    origin: { kind: 'composer' },
    uuid
  }) as never

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

test('a command whose turn ends with no reply: the next unprompted turn’s prose is no opener', OFF, async ($, on) => {
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

test('history: a typed prompt that starts with `<` (pasted HTML) still opens its turn; injected tags do not', OFF, async ($, on) => {
  engine(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
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

test('mid-turn prose that starts like an earlier turn’s opener gets no `claude`', OFF, async ($, on) => {
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
test('claude prose: `claude` once per turn, code chip padded, engine never asked', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'What is a worktree?', toolUses: [] },
      { role: 'assistant', text: REPLY.props.text, toolUses: [] },
      { role: 'assistant', text: '', toolUses: [] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: 'ok', isError: false }] },
      { role: 'assistant', text: 'A later block between tool calls.', toolUses: [] }
    ]
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const opener = await $.ui.mount({ ...REPLY, viewport: VIEW })
  expect((await opener.find({ type: 'Text', text: /^claude$/ }))?.text).toBe('claude')
  expect(await opener.find({ type: 'Text', text: /^ git worktree add \.\.\/hotfix main $/ })).toBeDefined()
  expect(await opener.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await opener.unmount()

  // isFirstOfReply is true after a tool call too, but this block doesn't open the turn.
  const later = await $.ui.mount({ ...REPLY, viewport: VIEW, props: { text: 'A later block between tool calls.', isFirstOfReply: true } })
  expect(await later.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  expect(await later.find({ type: 'Text', text: /later block/ })).toBeDefined()
  await later.unmount()
})

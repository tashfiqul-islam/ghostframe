import { expect, test } from 'claude-code/testing'

import { stepOf } from '../hooks/activity'
import { browserTarget, browserTool, browserVerb, openRunBefore, urlBar, browserTop, browserBottom } from '../hooks/browser'
import { NO_CAPS, NO_TALLY, capsLine, hookOutcome, spinnerWord, tallyText } from '../hooks/live'
import { parseShip, parseTests, runnerOf, shippedFrame, testsFrame } from '../hooks/outcome'
import { footnoteLines, parseCited, sourcesFrame, sup } from '../hooks/research'
import { partsWidth } from '../hooks/states'

const VIEW = { columns: 120, rows: 40 }
const W = 96 // the measure at 120 columns (min(96, 120 − 14))

const respond = (content: unknown[], uuid: string) => ({
  message: { type: 'assistant', role: 'assistant', content },
  door: 'response',
  origin: { kind: 'model' },
  uuid
}) as never

// ─── Phase 6: live state, capabilities, tally ───────────────────────────────

test('capability line: words not icons, kind then names, thought last; nothing used → no line', async () => {
  const line = capsLine({ skills: ['systematic-debugging', 'debug'], hooks: ['PreToolUse allowed'], mcp: ['github'], thoughtMs: 6200 }, W) ?? []
  expect(line.map(p => p.t).join('')).toBe('skills systematic-debugging, debug · hook PreToolUse allowed · mcp github · thought 6s')
  expect(line.map(p => p.t).join('')).not.toMatch(/[◈⚑⊕◦]/)
  expect(line.find(p => p.t === 'skills')?.color).toBe('#686874') // kind muted
  expect(line.find(p => p.t === ' github')?.color).toBe('#4e4e5a') // names dim

  expect(capsLine({ ...NO_CAPS, thoughtMs: 6000 }, W)?.map(p => p.t).join('')).toBe('thought for 6s · ctrl+o to read')
  expect(capsLine({ ...NO_CAPS, thoughtMs: 400 }, W)).toBe(undefined)
  expect(capsLine(NO_CAPS, W)).toBe(undefined)
  expect(partsWidth(capsLine({ ...NO_CAPS, skills: ['x'.repeat(300)] }, 40) ?? [])).toBeLessThanOrEqual(40)
})

test('hooks: only a hook that changed something counts (blocked, denied, rewrote)', async () => {
  expect(hookOutcome('PreToolUse', {})).toBe(undefined)
  expect(hookOutcome('PreToolUse', { allow: true })).toBe(undefined)
  expect(hookOutcome('PreToolUse', { ask: 'sure?' })).toBe(undefined)
  expect(hookOutcome('UserPromptSubmit', { additionalContext: ['caveman'] })).toBe(undefined)
  expect(hookOutcome('SessionStart', { additionalContext: ['x'] })).toBe(undefined)
  expect(hookOutcome('PreToolUse', { deny: 'no' })).toBe('PreToolUse denied')
  expect(hookOutcome('PreToolUse', { allow: true, updatedInput: { command: 'ls' } })).toBe('PreToolUse rewrote')
  expect(hookOutcome('UserPromptSubmit', { block: 'stop' })).toBe('UserPromptSubmit blocked')
  expect(hookOutcome('UserPromptSubmit', { suppressOriginalPrompt: true })).toBe('UserPromptSubmit rewrote')
})

test('tally: §5.17 order, plural words, only at level 3', async () => {
  expect(tallyText(NO_TALLY)).toBe('')
  expect(tallyText({ ...NO_TALLY, files: ['a.ts'] })).toBe('') // level 2: files alone
  expect(tallyText({ ...NO_TALLY, skills: ['a', 'b'], hooks: 1, sources: ['u1', 'u2', 'u3'], browser: 5, files: ['a.ts'] })).toBe(
    '2 skills · 1 hook · 3 sources · 5 browser actions · 1 file changed'
  )
})

test('spinner: the verb from the mode, props only; a state message stands', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: `${(e.props as { word: string }).word}|${(e.props as { suffix: string }).suffix}` }))
  expect(spinnerWord('responding')).toBe('writing')
  expect(spinnerWord('tool-use')).toBe('running')

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'Spinner', viewport: VIEW, props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } })
  expect(await ui.find({ type: 'Text', text: /^writing\|$/ })).toBeDefined()
  await ui.unmount()

  const msg = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'Spinner', viewport: VIEW, props: { word: 'Sauteing', message: 'Compacting', suffix: '…', mode: 'requesting' } })
  expect(await msg.find({ type: 'Text', text: /^Sauteing\|…$/ })).toBeDefined()
  await msg.unmount()
})

test('a plain Q&A turn under an every-prompt hook has no capability line at all', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['caveman'] }))

  await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'what is a worktree?' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'q1' } as never)
  await $.classic.UserPromptSubmit({ prompt: 'what is a worktree?' } as never)
  await $.turn.start({ text: 'what is a worktree?', turnId: 'q' })
  await $.session.append(respond([{ type: 'text', text: 'A worktree is a second checked-out folder.' }], 'qa'))

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'A worktree is a second checked-out folder.', isFirstOfReply: true } })
  expect(await ui.findAll({ type: 'Text', text: /^claude$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /hook|UserPromptSubmit|thought/ })).toBeUndefined()
  await ui.unmount()
})

test('the opener carries the capability line: a skill, the thinking before it; a context-only hook stays off', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let now = 0
  on('clock.now', () => ({ value: (now += 3000) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('skill.prompt', () => ({ text: 'skill body' }) as never)
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['caveman'] }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'thinking', index: 0, text: 'hm' }
    yield { kind: 'text', index: 1, text: 'Found it.' }
    return { turnId: e.turnId, index: 0, answer: 'Found it.', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })

  await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: '/debug the toast' }] }, door: 'command', origin: { kind: 'composer' }, uuid: 'p1' } as never)
  await $.classic.UserPromptSubmit({ prompt: '/debug the toast' } as never)
  await $.skill.prompt({ skill: 'superpowers:systematic-debugging', text: 'x', frontmatter: {}, source: 'userSettings' } as never)
  await $.turn.start({ text: '/debug the toast', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
    // drain
  }
  await $.session.append(respond([{ type: 'text', text: 'Found it. The toast fires twice in one tick.' }], 'r1'))

  const ui = await $.ui.mount({
    plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW,
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
  const later = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'A later block.', isFirstOfReply: true } })
  expect(await later.find({ type: 'Text', text: /^skill$/ })).toBeUndefined()
  await later.unmount()
})

// ─── Phase 7: research and browser ───────────────────────────────────────────

test('citations: links become blue superscripts numbered through the message; one footnote line', async () => {
  const numbering = new Map<string, number>()
  const a = parseCited('Retry only hides it; dedupe by key [vitest](https://vitest.dev/guide/cli#retry).', numbering)
  const b = parseCited('Wait on the queue [pw](https://playwright.dev/docs/actionability) and see [vitest](https://vitest.dev/guide/cli#retry).', numbering)
  expect(a?.runs.map(r => r.t).join('')).toBe('Retry only hides it; dedupe by key vitest¹.')
  expect(b?.runs.filter(r => r.s === 'cite').map(r => r.t)).toEqual(['²', '¹'])
  expect(b?.cites.map(c => c.n)).toEqual([2, 1])
  expect(sup(12)).toBe('¹²')

  const line = footnoteLines(b?.cites ?? [], W)[0] ?? []
  expect(line.map(p => p.t).join('')).toBe('┄┄┄┄ ² playwright.dev · actionability   ¹ vitest.dev · cli')
  expect(line.filter(p => p.href !== undefined).map(p => p.href)).toEqual(['https://playwright.dev/docs/actionability', 'https://vitest.dev/guide/cli#retry'])
  for (const width of [96, 50, 30]) for (const l of footnoteLines(b?.cites ?? [], width)) expect(partsWidth(l)).toBeLessThanOrEqual(width)

  expect(parseCited('no links here', new Map())).toBe(undefined)
  expect(parseCited('a [rel](./x.md) link', new Map())).toBe(undefined)
})

test('a web turn’s reply with links: markers in prose; one [ SOURCES ] frame lists them all, no footnote lines', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'research', turnId: 't1' })
  // A fetch first: the turn draws a frame (§0.2); the reply below is still streaming.
  await $.session.append(respond([{ type: 'tool_use', id: 'f1', name: 'WebFetch', input: { url: 'https://vitest.dev/a', prompt: 'x' } }], 'f'))
  const text = [
    'Dedupe by key [v](https://vitest.dev/a) and wait on the queue [p](https://playwright.dev/b).',
    '',
    'Sources:',
    ...['one', 'two', 'three', 'four', 'five'].map(n => `- [${n}](https://example.dev/${n})`)
  ].join('\n')
  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text, isFirstOfReply: false } })
  expect(await ui.find({ type: 'Text', text: /^¹$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^SOURCES$/ })).toBeDefined()
  // Every source in the reply: the paragraph's two numbered, the list's five listed.
  expect(await ui.find({ type: 'Text', text: /^2 cited · 5 listed$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^┄┄┄┄ / })).toBeUndefined()
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /https:\/\// })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.unmount()

  for (const width of [96, 60, 40]) {
    for (const l of sourcesFrame([{ n: 1, url: 'https://a.dev/' + 'x'.repeat(200), title: 'T'.repeat(90) }], width)) expect(partsWidth(l)).toBe(width)
  }
})

test('browser: tools, verbs and targets from the real Playwright shapes', async () => {
  const b = browserTool('mcp__playwright__browser_navigate')
  expect(b).toEqual({ engine: 'playwright', action: 'navigate' })
  expect(browserTool('mcp__github__list_pull_requests')).toBe(undefined)
  expect(browserTool('Read')).toBe(undefined)
  if (b === undefined) throw new Error('no tool')
  expect(browserVerb(b, { url: 'http://localhost:5173/products?page=6' })).toBe('goto')
  expect(browserTarget(b, { url: 'http://localhost:5173/products?page=6' })).toBe('/products?page=6')
  const type = { engine: 'playwright', action: 'type' }
  expect(browserVerb(type, {})).toBe('fill')
  expect(browserTarget(type, { element: 'search', ref: 'e3', text: 'teal mug' })).toBe('search  ›  "teal mug"')
  expect(browserVerb({ engine: 'chrome', action: 'computer' }, { action: 'left_click' })).toBe('click')
  expect(browserVerb({ engine: 'playwright', action: 'take_screenshot' }, {})).toBe('capture')

  for (const width of [96, 50]) {
    expect(partsWidth(browserTop(width, 'playwright'))).toBe(width)
    expect(partsWidth(browserBottom(width, 5))).toBe(width)
    expect(partsWidth(urlBar(width, 'http://localhost:5173/' + 'deep/'.repeat(30), { t: '●', color: '' }, '0.4s'))).toBe(width)
  }

  const flow = [
    { turn: 't', kind: 'text' as const, key: 'a' },
    { turn: 't', kind: 'tool' as const, key: '1', tool: 'mcp__playwright__browser_navigate' },
    { turn: 't', kind: 'tool' as const, key: '2', tool: 'mcp__playwright__browser_click' }
  ]
  expect(openRunBefore(flow, 1, 't')).toBe(0)
  expect(openRunBefore(flow, 2, 't')).toBe(1)
  expect(openRunBefore(flow, 3, 't')).toBe(2)
  expect(openRunBefore(flow, 3, 'other')).toBe(0)
})

test('a browser run is one frame across its rows; the next block and the close rule end it', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let now = 0
  on('clock.now', () => ({ value: (now += 100) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: [{ type: 'text', text: 'ok' }] }))
  await $.turn.start({ text: 'check the page', turnId: 't1' })

  const calls = [
    { id: 'b1', tool: 'mcp__playwright__browser_navigate', input: { url: 'http://localhost:5173/products?page=6' } },
    { id: 'b2', tool: 'mcp__playwright__browser_click', input: { element: 'Find product', ref: 'e7' } }
  ]
  await $.session.append(respond([{ type: 'text', text: 'Checking the page first.' }], 'r0'))
  for (const c of calls) {
    await $.session.append(respond([{ type: 'tool_use', id: c.id, name: c.tool, input: c.input }], `r-${c.id}`))
    await $.tool.call({ tool: c.tool, tool_use_id: c.id, ...c.input } as never)
  }

  const row = (c: (typeof calls)[number]) =>
    $.ui.mount({
      plugin: 'ghostframe', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
      props: { tool_use_id: c.id, tool: c.tool, input: c.input, isRunning: false, isErrored: false, isInterrupted: false, output: [{ type: 'text', text: 'ok' }] }
    })

  const first = await row(calls[0] as (typeof calls)[number])
  expect(await first.find({ type: 'Text', text: /^BROWSER$/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^localhost:5173$/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^goto {4}$/ })).toBeDefined()
  await first.unmount()

  const second = await row(calls[1] as (typeof calls)[number])
  expect(await second.find({ type: 'Text', text: /^BROWSER$/ })).toBeUndefined()
  expect(await second.find({ type: 'Text', text: /^click {3}$/ })).toBeDefined()
  expect(await second.find({ type: 'Text', text: /actions/ })).toBeUndefined()
  await second.unmount()

  // The turn ends on the browser run: the close rule draws the frame's bottom edge.
  await $.turn.complete({ answer: '', durationMs: 4200, isAborted: false, turnId: 't1', reason: 'answer' })
  const close = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'TurnDuration', viewport: VIEW, props: { word: 'Baked', durationMs: 4200 } })
  expect(await close.find({ type: 'Text', text: /^2 actions$/ })).toBeDefined()
  expect(await close.find({ type: 'Text', text: /2 browser actions/ })).toBeDefined()
  await close.unmount()
})

test('prose right after a browser run closes its frame above itself', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.session.append(respond([{ type: 'tool_use', id: 'b1', name: 'mcp__playwright__browser_snapshot', input: {} }], 'r1'))
  await $.session.append(respond([{ type: 'text', text: 'The page shows two toasts.' }], 'r2'))

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'The page shows two toasts.', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: /^1 action$/ })).toBeDefined()
  await ui.unmount()
})

// ─── Phase 8: tests and shipped ──────────────────────────────────────────────

test('test summaries from each runner', async () => {
  expect(parseTests(' Test Files  1 failed | 8 passed (9)\n      Tests  3 failed | 142 passed | 2 skipped (147)')).toEqual({ passed: 142, failed: 3, skipped: 2 })
  expect(parseTests('Tests:       1 failed, 2 skipped, 9 passed, 12 total')).toEqual({ passed: 9, failed: 1, skipped: 2 })
  expect(parseTests('===== 3 failed, 142 passed, 2 skipped in 3.21s =====')).toEqual({ passed: 142, failed: 3, skipped: 2 })
  expect(parseTests('(pass) a [1ms]\n\n 56 pass\n 0 fail\nRan 56 tests across 11 files. [1.50s]')).toEqual({ passed: 56, failed: 0, skipped: 0 })
  expect(parseTests('  145 passed (38.2s)\n  2 skipped')).toEqual({ passed: 145, failed: 0, skipped: 2 })
  expect(parseTests('test result: ok. 10 passed; 0 failed; 1 ignored;\ntest result: ok. 5 passed; 0 failed; 0 ignored;')).toEqual({ passed: 15, failed: 0, skipped: 1 })
  expect(parseTests('random output')).toBe(undefined)
  expect(runnerOf('bunx vitest run')).toBe('vitest')
  expect(runnerOf('claude plugin test .')).toBe('claude plugin test')
  expect(runnerOf('ls')).toBe(undefined)
})

test('shipped: commit, push and PR read from git and gh output', async () => {
  const commit = parseShip('c', 'git add -A && git commit -m "fix(toast): dedupe by key"', '[feature/toast a1b2c3d4] fix(toast): dedupe by key\n 3 files changed, 48 insertions(+), 12 deletions(-)')
  expect(commit?.commit).toEqual({ sha: 'a1b2c3d', subject: 'fix(toast): dedupe by key', files: 3, adds: 48, dels: 12 })
  const push = parseShip('p', 'git push -u origin feature/toast', 'To github.com:me/app.git\n * [new branch]      feature/toast -> feature/toast')
  expect(push?.push).toEqual({ from: 'feature/toast', to: 'feature/toast' })
  const pr = parseShip('r', 'gh pr create --base main --title x', 'https://github.com/me/app/pull/148\n')
  expect(pr?.pr).toEqual({ n: 148, url: 'https://github.com/me/app/pull/148', base: 'main' })
  expect(parseShip('n', 'git commit -m x', 'nothing to commit, working tree clean')).toBe(undefined)

  for (const width of [96, 46]) {
    for (const l of shippedFrame(width, { id: 'x', ...commit, ...pr })) expect(partsWidth(l)).toBe(width)
    for (const l of testsFrame(width, { id: 'x', runner: 'vitest', passed: 145, failed: 0, skipped: 2 }, { id: 'w', runner: 'vitest', passed: 142, failed: 3, skipped: 2 }, 38000)) {
      expect(partsWidth(l)).toBe(width)
    }
  }
  expect(shippedFrame(96, { id: 'x', ...pr })[0]?.some(p => p.t === 'PR open')).toBe(true)
})

test('a test run draws a [ TESTS ] card with the change since the last run; unreadable output keeps the activity rows', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let out = ' 10 pass\n 2 fail\n'
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 's1' } as never)
  out = ' 12 pass\n 0 fail\n'
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 's2' } as never)
  out = 'hello\nworld\n'
  await $.tool.call({ tool: 'Bash', command: 'echo hello', tool_use_id: 's3' } as never)

  const result = (id: string, isErrored = false) =>
    $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props: { tool_use_id: id, tool: 'Bash', isErrored, output: { stdout: out, stderr: '' } } })

  const failing = await result('s1', true)
  expect(await failing.find({ type: 'Text', text: /^TESTS$/ })).toBeDefined()
  expect(await failing.find({ type: 'Text', text: /^2 failing$/ })).toBeDefined()
  await failing.unmount()

  const fixed = await result('s2')
  expect(await fixed.find({ type: 'Text', text: /^all passing$/ })).toBeDefined()
  expect(await fixed.find({ type: 'Text', text: /^was 10 passed · 2 failing$/ })).toBeDefined()
  await fixed.unmount()

  const plain = await result('s3')
  expect(await plain.find({ type: 'Text', text: /^TESTS$/ })).toBeUndefined()
  expect(await plain.findAll({ type: 'Text' })).toHaveLength(0) // no output lines: the row says ✓
  await plain.unmount()
})

test('a commit draws a [ SHIPPED ] card', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', () => ({ result: { stdout: '[main a1b2c3d] fix(toast): dedupe by key\n 3 files changed, 48 insertions(+), 12 deletions(-)', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix(toast): dedupe by key"', tool_use_id: 'g1' } as never)

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props: { tool_use_id: 'g1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } } })
  expect(await ui.find({ type: 'Text', text: /^SHIPPED$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^committed$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^a1b2c3d$/ })).toBeDefined()
  await ui.unmount()
})

// ─── Refinements: final evidence, quiet counts, frozen cards, thinking ──────

test('thinking: hidden on a turn with no tools; shown on a work turn; shown past 10s anywhere', async ($, on) => {
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
    await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: id }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: `p-${id}` } as never)
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
  const qa = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'A plain answer about worktrees and branches.', isFirstOfReply: true } })
  expect(await qa.find({ type: 'Text', text: /thought/ })).toBeUndefined()
  await qa.unmount()

  // A turn that opens on a tool: a work turn, the line shows.
  await turn('work', [{ type: 'tool_use', id: 'w1', name: 'Read', input: { file_path: 'a.ts' } }])
  const work = await $.ui.mount({
    plugin: 'ghostframe', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
    props: { tool_use_id: 'w1', tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false, output: { type: 'text', file: { numLines: 2 } } }
  })
  expect(await work.find({ type: 'Text', text: /^thought for 4s$/ })).toBeDefined()
  await work.unmount()
})

test('thinking past 10s shows even with no tools', async ($, on) => {
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
  await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'q' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'p' } as never)
  await $.turn.start({ text: 'q', turnId: 'long' })
  for await (const _ of $.turn.step({ turnId: 'long', index: 0, model: 'm', messageCount: 1 })) {
    // drain
  }
  await $.session.append(respond([{ type: 'text', text: 'A long-considered plain answer here.' }], 'r'))
  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'A long-considered plain answer here.', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: /^thought for 12s$/ })).toBeDefined()
  await ui.unmount()
})

test('tests card: zero counts left out; all passing is `75 passed` on a full green rail; `was` only when counts moved', async () => {
  const run = { id: 'x', runner: 'bun test', passed: 75, failed: 0, skipped: 0 }
  const lines = testsFrame(W, run, undefined, 1000)
  const text = lines.map(l => l.map(p => p.t).join(''))
  expect(text[1]).toMatch(/^┆ 75 passed +┆$/)
  expect(text.join('\n')).not.toMatch(/0 failed|0 skipped/)
  expect(lines[2]?.filter(p => p.t.includes('━')).every(p => p.color === '#96d292')).toBe(true)
  expect(lines[2]?.some(p => p.t.includes('─'))).toBe(false)

  const failing = testsFrame(W, { ...run, passed: 69, failed: 6 }, undefined, 1000).map(l => l.map(p => p.t).join(''))
  expect(failing[1]).toMatch(/^┆ 69 passed    6 failed +┆$/)

  expect(testsFrame(W, run, { ...run, id: 'w' }, 1000).map(l => l.map(p => p.t).join('')).join('\n')).not.toMatch(/was /)
  expect(testsFrame(W, run, { ...run, id: 'w', passed: 74, failed: 1 }, 1000).map(l => l.map(p => p.t).join('')).join('\n')).toMatch(/was 74 passed · 1 failing/)
})

test('final evidence: only a turn\'s last test run and last shipping call draw cards', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let out = ' 69 pass\n 6 fail\n'
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'fix it', turnId: 't1' })

  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'a' } as never)
  out = '[main a1b2c3d] fix: one\n 1 file changed, 2 insertions(+)'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m one', tool_use_id: 'c1' } as never)
  out = ' 75 pass\n 0 fail\n'
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'b' } as never)
  out = 'https://github.com/me/app/pull/9\n'
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --base main', tool_use_id: 'pr' } as never)

  const result = (id: string) =>
    $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props: { tool_use_id: id, tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } } })

  for (const id of ['a', 'c1']) {
    const early = await result(id)
    expect(await early.findAll({ type: 'Text' })).toHaveLength(0)
    await early.unmount()
  }

  const last = await result('b')
  expect(await last.find({ type: 'Text', text: /^TESTS$/ })).toBeDefined()
  expect(await last.find({ type: 'Text', text: /^was 69 passed · 6 failing$/ })).toBeDefined()
  await last.unmount()

  // The last shipping call carries the turn's commit and its PR.
  const ship = await result('pr')
  expect(await ship.find({ type: 'Text', text: /^SHIPPED$/ })).toBeDefined()
  expect(await ship.find({ type: 'Text', text: /^a1b2c3d$/ })).toBeDefined()
  expect(await ship.find({ type: 'Text', text: /^#9$/ })).toBeDefined()
  expect(await ship.find({ type: 'Text', text: /^PR open$/ })).toBeDefined()
  await ship.unmount()

  // The earlier steps' rows say what they did.
  const ok = { isRunning: false, isErrored: false, isInterrupted: false }
  expect(stepOf('Bash', { command: 'git commit -m one' }, { stdout: '[main a1b2c3d] fix: one', stderr: '' }, ok)?.result.map(r => r.text)).toEqual(['committed', 'a1b2c3d'])
  expect(stepOf('Bash', { command: 'bun test' }, 'Exit code 1\n 69 pass\n 6 fail', { ...ok, isErrored: true })?.result[0]?.text).toBe('6 fail')
})

/** Each card line as drawn: the one-line Texts the card is built from. */
async function cardLinesOf(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate').map(t => t.text)
}

test('a card streams stable: once drawn, no line changes and none repeats while the turn goes on', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let now = 0
  on('clock.now', () => ({ value: (now += 250) }))
  const FULL = ' (pass) a\n (pass) b\n\n 74 pass\n 1 fail\nRan 75 tests'
  let out = FULL
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'r0' } as never) // an earlier turn's-worth of history
  await $.turn.start({ text: 'again', turnId: 't2' })

  // The run's row streams its output, then its result block draws the card.
  const row = await $.ui.mount({
    plugin: 'ghostframe', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
    props: { tool_use_id: 'r1', tool: 'Bash', input: { command: 'bun test', description: 'Run the tests' }, isRunning: true, isErrored: false, isInterrupted: false }
  })
  for (const cut of [10, 25, FULL.length]) {
    await row.redraw({ tool_use_id: 'r1', tool: 'Bash', input: { command: 'bun test', description: 'Run the tests' }, isRunning: true, isErrored: false, isInterrupted: false, output: { stdout: FULL.slice(0, cut), stderr: '' } })
  }
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'r1' } as never)
  await row.unmount()

  const props = { tool_use_id: 'r1', tool: 'Bash', isErrored: true, output: { stdout: FULL, stderr: '' } }
  const card = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props })
  const first = await cardLinesOf(card)
  expect(first.some(l => /TESTS/.test(l))).toBe(true)

  // The turn goes on: more calls stamp steps and runs; the card re-draws each time.
  out = 'ok'
  for (let i = 0; i < 4; i++) {
    await $.tool.call({ tool: 'Bash', command: `echo ${i}`, tool_use_id: `e${i}` } as never)
    await card.redraw(props)
    const lines = await cardLinesOf(card)
    expect(lines).toEqual(first)
    const seen = new Set<string>()
    for (const l of lines.filter(x => x.trim().length > 0 && !/^\+┄+\+$/.test(x))) {
      expect(seen.has(l)).toBe(false)
      seen.add(l)
    }
  }
  expect(first.filter(l => /was 74 passed · 1 failing/.test(l))).toHaveLength(0) // same counts as before: no `was`
  await card.unmount()
})

test('one blank row after a card: prose right below it takes no margin of its own', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { stdout: ' 5 pass\n 0 fail', stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'test it', turnId: 't1' })
  await $.session.append(respond([{ type: 'tool_use', id: 'k1', name: 'Bash', input: { command: 'bun test' } }], 'a1'))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'k1' } as never)
  // The card draws first, as on screen; the prose under it then knows it's there.
  const card = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props: { tool_use_id: 'k1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } } })
  expect(await card.find({ type: 'Text', text: /^TESTS$/ })).toBeDefined()
  await card.unmount()
  await $.session.append(respond([{ type: 'text', text: 'All five pass now.' }], 'a2'))

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'All five pass now.', isFirstOfReply: true } })
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes[1]?.props.marginTop).toBe(0)
  await ui.unmount()

  // Prose after a plain step keeps its blank row.
  await $.session.append(respond([{ type: 'tool_use', id: 'k2', name: 'Read', input: { file_path: 'a' } }], 'a3'))
  await $.session.append(respond([{ type: 'text', text: 'Then I read the file.' }], 'a4'))
  const plain = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text: 'Then I read the file.', isFirstOfReply: true } })
  expect((await plain.findAll({ type: 'Box' }))[1]?.props.marginTop).toBe(1)
  await plain.unmount()
})

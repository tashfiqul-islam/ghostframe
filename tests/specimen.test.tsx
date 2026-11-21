import { expect, test } from 'claude-code/testing'

import { vw } from '../hooks/shared/text'
import { textAt } from './text'

// One transcript holding every component, rendered at 140, 90 and 60 columns and written
// to docs/specimens/specimen-<columns>.txt for review. Each row of the transcript is
// mounted at its own site in order, the way the engine stacks them; `engine` marks a row
// the mod hands back to Claude Code.

// The test runner's log (bun's console); the mod's own types declare no console.
declare const console: { log: (text: string) => void }

const OUT = 'docs/specimens'
const COLUMNS = [140, 90, 60] as const

type Call = { id: string; tool: string; input: Record<string, unknown>; output: unknown; isError?: boolean; interrupted?: boolean; asks?: boolean }

const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never
const ask = (text: string, uuid: string) =>
  ({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid
  }) as never

const QA = 'A worktree is a second checked-out folder of the same repository, on its own branch, sharing one history.'
const OPENER = 'Checking the toast queue and the test runner first.'
const NARRATION = 'The queue fires twice in one tick; patching the dedupe and rerunning the suite.'
const ANSWER = [
  '**Fixed.** The toast queue now dedupes by key before it flushes, so one event shows one toast.',
  '',
  '| Check | Before | After |',
  '|---|---:|---:|',
  '| toasts per event | 2 | 1 |',
  '| flush time | 42 ms | 18 ms |',
  '| docs | https://vitest.dev/guide/cli | https://github.com/oven-sh/bun/issues/9123 |'
].join('\n')
const FOOTNOTED = [
  'What changed:',
  '',
  '- dedupe by key before the flush, as [vitest](https://vitest.dev/guide/cli) suggests',
  '- a regression test for the double fire, see https://github.com/oven-sh/bun/issues/9123',
  '1. run the suite',
  '2. ship it'
].join('\n')
const SOURCED = [
  'Sources:',
  '',
  '- [Vitest CLI](https://vitest.dev/guide/cli)',
  '- [Bun test runner](https://bun.sh/docs/cli/test)',
  '- [Playwright actionability](https://playwright.dev/docs/actionability)',
  '- [Bun issue 9123](https://github.com/oven-sh/bun/issues/9123)',
  '- [Node timers](https://nodejs.org/api/timers.html)'
].join('\n')
const FIGURES = [
  'How a request moves through the hooks:',
  '',
  '```',
  '+------------------- [ HOOKS ] --------------------+',
  '|                                                  |',
  '| repeat: 3-5 per tool call                        |',
  '| back: 6->3 continue                              |',
  '|                                                  |',
  '| 1  SessionStart                                  |',
  '|    inject context                                |',
  '| │                                                |',
  '| 2  UserPromptSubmit                              |',
  '|    add context or block the prompt               |',
  '| │                                                |',
  '| 3  PreToolUse                                    |',
  '|    allow, deny, or rewrite tool input            |',
  '| │                                                |',
  '| 4  PermissionRequest                             |',
  '| │                                                |',
  '| 5  PostToolUse                                   |',
  '|    read result, feed notes back                  |',
  '| │                                                |',
  '| 6  Stop                                          |',
  '|    end turn, or block and continue               |',
  '| │                                                |',
  '| 7  SessionEnd                                    |',
  '|                                                  |',
  '+--------------------------------------------------+',
  '```',
  '',
  'And the build so far:',
  '',
  '```',
  '+------------------- [ BUILD ] --------------------+',
  '|                                                  |',
  '| ●  p1  tokens, glyphs, clip/pad, grid rule       |',
  '| │                                                |',
  '| ●  p2  turn bounds, prose, density 0             |',
  '| │                                                |',
  '| ●  p3  activity frame, diff card                 |',
  '| │                                                |',
  '| ○  p4  notices, states, plan, tasks              |',
  '|                                                  |',
  '+--------------------------------------------------+',
  '```'
].join('\n')

// Turn 4: no tools, a table whose cells hold links (the reply once seen falling back).
const LINKED_ASK = 'make a 4-column table of the last 3 Bun releases, cite each post'
const LINKED = [
  'Contributor counts come from the GitHub releases page.',
  '',
  '| Version | Released | Contributors | Headline |',
  '|---|---|---:|---|',
  '| v1.4.4 | Oct 22, 2026 | 39 | `bun fmt`, a formatter that works like Prettier, and faster `bun check` ([post](https://bun.com/blog/bun-v1.4.4)) |',
  '| v1.4.3 | Oct 10, 2026 | 8 | `bun check`, a type checker, and less CPU use when idle ([post](https://bun.com/blog/bun-v1.4.3)) |',
  '| v1.4.2 | Sep 5, 2026 | 3 | fixes only: Elysia, AsyncLocalStorage, `@discordjs/ws` ([post](https://bun.com/blog/bun-v1.4.2)) |'
].join('\n')

const CALLS: Call[] = [
  {
    id: 'r1',
    tool: 'Read',
    input: { file_path: 'D:/Projects/app/src/toast/queue.ts' },
    output: { type: 'text', file: { filePath: 'D:/Projects/app/src/toast/queue.ts', numLines: 120 } }
  },
  { id: 'g1', tool: 'Grep', input: { pattern: 'dedupe', path: 'D:/Projects/app/src' }, output: { mode: 'files_with_matches', numFiles: 3 } },
  { id: 'w1', tool: 'WebSearch', input: { query: 'vitest retry flaky toast test' }, output: { results: [1, 2, 3, 4, 5] } },
  { id: 'f1', tool: 'WebFetch', input: { url: 'https://vitest.dev/guide/cli', prompt: 'retry flag' }, output: { code: 200 } },
  {
    id: 'e1',
    tool: 'Edit',
    input: { file_path: 'D:/Projects/app/src/toast/queue.ts' },
    output: {
      filePath: 'D:/Projects/app/src/toast/queue.ts',
      structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' keep', '+dedupe', '+flush', '-fire'] }]
    }
  },
  {
    id: 's1',
    tool: 'Bash',
    input: { command: 'git status --short', description: 'check the working tree' },
    output: { stdout: ' M src/toast/queue.ts', stderr: '' }
  },
  {
    id: 's2',
    tool: 'Bash',
    input: { command: 'make lint', description: 'run the linter' },
    output: 'Error: Exit code 2\nmake: *** No rule to make target `lint`.',
    isError: true
  },
  { id: 'p1', tool: 'Bash', input: { command: 'rm -rf build', description: 'clear the build folder' }, output: undefined, asks: true },
  {
    id: 'd1',
    tool: 'Bash',
    input: { command: 'rm -rf dist', description: 'clear the dist folder' },
    output: 'Permission to use Bash has been denied.',
    isError: true
  },
  {
    id: 't1',
    tool: 'Bash',
    input: { command: 'bun test src/toast', description: 'run the toast tests' },
    output: { stdout: ' 12 pass\n 0 fail\nRan 12 tests across 2 files. [140ms]', stderr: '' }
  },
  {
    id: 't2',
    tool: 'Bash',
    input: { command: 'bun test', description: 'run the whole suite' },
    output: 'Exit code 1\n 46 pass\n 2 fail\nRan 48 tests across 9 files. [1.20s]',
    isError: true
  }
]
const NARRATE_AFTER = 'f1' // the narration block sits between the fetch and the edit

test('specimen: every component at 140, 90 and 60 columns, written for review', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let now = Date.UTC(2026, 10, 17, 8, 30)
  on('clock.now', () => ({ value: (now += 700) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // Only the permission row asks; every other call goes ahead.
  on('tool.check', (_, e, next) => (e.tool_use_id === 'p1' ? ({ decision: 'ask' } as never) : next(e)))
  on('tool.call', (_, e) => {
    const c = CALLS.find(x => x.id === e.tool_use_id)
    return c?.isError ? ({ result: c.output, isError: true } as never) : { result: c?.output ?? 'ok' }
  })

  const submit = async (text: string, uuid: string) => {
    try {
      await $.prompt.submit({ text, isMeta: false, origin: { kind: 'composer' } } as never)
    } catch {
      // No stamp: the open rule draws without its time.
    }
    await $.session.append(ask(text, uuid))
  }

  // ── Turn 1: plain Q&A ──
  await submit('what is a worktree?', 'u1')
  await $.turn.start({ text: 'what is a worktree?', turnId: 't1' })
  await $.session.append(respond([{ type: 'text', text: QA }], 'a1'))
  await $.turn.complete({ answer: QA, durationMs: 2400, isAborted: false, turnId: 't1', reason: 'answer', usage: { output_tokens: 182 } } as never)

  // ── Turn 2: a work turn ──
  await submit('fix the duplicate toast and tell me what changed', 'u2')
  await $.turn.start({ text: 'fix the duplicate toast', turnId: 't2' })
  await $.session.append(respond([{ type: 'text', text: OPENER }], 'a2'))
  for (const c of CALLS) {
    await $.session.append(respond([{ type: 'tool_use', id: c.id, name: c.tool, input: c.input }], `a-${c.id}`))
    if (c.asks) {
      try {
        await $.tool.check({ tool: c.tool, tool_use_id: c.id, approver: 'person', ...c.input } as never)
      } catch {
        // The ask could not be raised here: the row draws as the engine left it.
      }
      continue
    }
    if (c.id !== 'd1') await $.tool.call({ tool: c.tool, tool_use_id: c.id, ...c.input } as never)
    if (c.id === NARRATE_AFTER) await $.session.append(respond([{ type: 'text', text: NARRATION }], 'a-narr'))
  }
  for (const [text, uuid] of [
    [ANSWER, 'a3'],
    [FOOTNOTED, 'a4'],
    [SOURCED, 'a5'],
    [FIGURES, 'a6']
  ] as const) {
    await $.session.append(respond([{ type: 'text', text }], uuid))
  }
  await $.turn.complete({ answer: ANSWER, durationMs: 48200, isAborted: false, turnId: 't2', reason: 'answer', usage: { output_tokens: 3120 } } as never)

  // ── Turn 3: interrupted ──
  await submit('now run the e2e suite', 'u3')
  await $.turn.start({ text: 'now run the e2e suite', turnId: 't3' })
  await $.session.append(
    respond([{ type: 'tool_use', id: 'i1', name: 'Bash', input: { command: 'bunx playwright test', description: 'run the e2e suite' } }], 'a-i1')
  )
  await $.tool.call({ tool: 'Bash', tool_use_id: 'i1', command: 'bunx playwright test', description: 'run the e2e suite' } as never)
  await $.turn.complete({ answer: '', durationMs: 6100, isAborted: true, turnId: 't3', reason: 'aborted', usage: { output_tokens: 40 } } as never)

  // ── Turn 4: no tools, a table with links ──
  await submit(LINKED_ASK, 'u4')
  await $.turn.start({ text: LINKED_ASK, turnId: 't4' })
  await $.session.append(respond([{ type: 'text', text: LINKED }], 'a7'))
  await $.turn.complete({ answer: LINKED, durationMs: 3100, isAborted: false, turnId: 't4', reason: 'answer', usage: { output_tokens: 260 } } as never)

  // The transcript, site by site, in the order the engine stacks it.
  type Site = { component: string; props: Record<string, unknown> }
  const user = (text: string): Site => ({ component: 'UserMessage', props: { text, origin: { kind: 'composer' }, isExpanded: false } })
  const reply = (text: string, first: boolean): Site => ({ component: 'AssistantMessage', props: { text, isFirstOfReply: first } })
  const row = (c: Call): Site => ({
    component: 'ToolUse',
    props: {
      tool_use_id: c.id,
      tool: c.tool,
      input: c.input,
      isRunning: false,
      isErrored: c.isError === true,
      isInterrupted: c.interrupted === true,
      ...(c.output !== undefined ? { output: c.output } : {})
    }
  })
  const result = (c: Call): Site => ({ component: 'ToolResult', props: { tool_use_id: c.id, tool: c.tool, isErrored: c.isError === true, output: c.output } })
  const footer = (ms: number): Site => ({ component: 'TurnDuration', props: { word: 'Baked', durationMs: ms } })

  const sites: Site[] = [
    user('what is a worktree?'),
    reply(QA, true),
    footer(2400),
    user('fix the duplicate toast and tell me what changed'),
    reply(OPENER, true),
    // A call still waiting on permission has no result row yet.
    ...CALLS.flatMap(c => [
      row(c),
      ...(c.asks ? [] : [result(c)]),
      ...(c.id === NARRATE_AFTER ? [{ component: 'AssistantMessage', props: { text: NARRATION, isFirstOfReply: true, isSummary: true } }] : [])
    ]),
    reply(ANSWER, true),
    reply(FOOTNOTED, false),
    reply(SOURCED, false),
    reply(FIGURES, false),
    footer(48200),
    user('now run the e2e suite'),
    row({ id: 'i1', tool: 'Bash', input: { command: 'bunx playwright test', description: 'run the e2e suite' }, output: undefined, interrupted: true }),
    footer(6100),
    user(LINKED_ASK),
    reply(LINKED, true),
    footer(3100)
  ]

  for (const columns of COLUMNS) {
    const lines: string[] = []

    for (const s of sites) {
      const ui = await $.ui.mount({
        plugin: 'ghostframe',
        surface: 'terminal',
        component: s.component,
        viewport: { columns, rows: 400 },
        props: s.props
      } as never)
      lines.push(...textAt(await ui.drawn(), columns))
      await ui.unmount()
    }

    // Nothing the mod draws runs past the window, and every frame row is whole.
    for (const l of lines) expect(vw(l)).toBeLessThanOrEqual(columns)
    const text = `specimen at ${columns} columns (rendered by tests/specimen.test.tsx)\n${'═'.repeat(Math.min(columns, 60))}\n${lines.join('\n')}\n`

    // The test kit gives a test no file system, so the text goes to the log between
    // markers; tools/specimens.ts runs this suite and writes each file.
    console.log(`<<<SPECIMEN ${columns} ${OUT}/specimen-${columns}.txt>>>\n${text}<<<END SPECIMEN ${columns}>>>`)
    expect(lines.length).toBeGreaterThan(40)
  }
})

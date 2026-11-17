import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { textAt } from './text'

// The turn seen printed twice after /reload-plugins: no tools, a prose line with a link,
// a table whose cells link "post", then a Sources list. Streamed through the kit, it once
// changed rows it had already drawn:
// - the Sources list flipped kinds as it streamed (paragraph → plain list with markers and
//   a footnote line → `sources`, drawn as nothing), so its rows vanished at the end;
// - a link half-written in a table row made the row unparseable: the table fell back to its
//   header alone and lost a row it had drawn; a half-written link in the opening line drew
//   it as the engine's Markdown for a moment; a table header drew as Markdown, then `wide`;
// - at turn end a frozen table re-flowed whenever the reply alone fit the window, though the
//   region the terminal redraws also holds the turn rule, the prompt and the footer;
// - footnote lines vs a [ SOURCES ] frame hung on the turn's final source count.
// Every one of those is now decided when the block first draws.

const LEAD = 'Contributor counts come from the [GitHub releases page](https://github.com/oven-sh/bun/releases) I read earlier in this conversation.'
export const TURN = `${LEAD}

| Version | Released | Contributors | Headline |
|---|---|---:|---|
| v1.4.4 | Oct 22, 2026 | 39 | \`bun fmt\`, a formatter that works like Prettier, and faster \`bun check\` ([post](https://bun.com/blog/bun-v1.4.4)) |
| v1.4.3 | Oct 10, 2026 | 8 | \`bun check\`, a type checker, and less CPU use when idle ([post](https://bun.com/blog/bun-v1.4.3)) |
| v1.4.2 | Sep 5, 2026 | 3 | fixes only: Elysia, AsyncLocalStorage, \`@discordjs/ws\` ([post](https://bun.com/blog/bun-v1.4.2)) |

Sources:
- [post](https://bun.com/blog/bun-v1.4.4)
- [post](https://bun.com/blog/bun-v1.4.3)
- [post](https://bun.com/blog/bun-v1.4.2)
- [Releases · oven-sh/bun · GitHub](https://github.com/oven-sh/bun/releases)`

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const respond = (content: unknown[], uuid: string) => ({
  message: { type: 'assistant', role: 'assistant', content },
  door: 'response',
  origin: { kind: 'model' },
  uuid
}) as never

/** Rows split into groups at blank rows: a block (with its footnote line or frame) per group. */
const groups = (rows: string[]) => {
  const out: string[][] = [[]]

  for (const r of rows) {
    if (r.trim().length === 0) {
      if ((out[out.length - 1] ?? []).length > 0) out.push([])
    } else {
      out[out.length - 1]?.push(r)
    }
  }

  return out.filter(g => g.length > 0)
}

/**
 * Stream `text` into one mount, a few characters at a time, then end the turn. Every
 * render keeps every group above the one being written; the final render is the last
 * streamed one, row for row. Returns the final rows.
 */
async function streamTurn($: Engine, on: On, text: string, columns: number, web: boolean) {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.turn.start({ text: 'make a table', turnId: 't1' })
  if (web) await $.session.append(respond([{ type: 'tool_use', id: 'w1', name: 'WebSearch', input: { query: 'bun releases' } }], 'w'))

  const view = { columns, rows: 45 }
  const props = (t: string) => ({ text: t, isFirstOfReply: !web })
  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: view, props: props(text.slice(0, 3)) } as never)
  let prev: string[][] = []

  for (let n = 4; ; n = Math.min(text.length, n + 3)) {
    await ui.redraw(props(text.slice(0, n)))
    // A web turn's frame trails the block being written (it grows at the message's end):
    // the groups compared are those above it.
    const now = groups(textAt(await ui.drawn(), columns)).filter(g => !(g[0] ?? '').includes('[ SOURCES ]'))

    // Every group but the last one drawn before (the one still being written) is unchanged.
    for (let g = 0; g < prev.length - 1; g++) {
      if (JSON.stringify(now[g]) !== JSON.stringify(prev[g])) {
        throw new Error(`at ${n} (${JSON.stringify(text.slice(n - 30, n))}) group ${g} changed:\n${(prev[g] ?? []).join('\n')}\n→\n${(now[g] ?? []).join('\n')}`)
      }
    }
    prev = now
    if (n === text.length) break
  }

  const streamed = textAt(await ui.drawn(), columns)

  // The message lands, the turn completes, the reader redraws.
  await $.session.append(respond([{ type: 'text', text }], 'a1'))
  await $.turn.complete({ answer: text, durationMs: 5000, isAborted: false, turnId: 't1', reason: 'answer', usage: { output_tokens: 428 } } as never)
  await ui.redraw(props(text))
  const final = textAt(await ui.drawn(), columns)
  await ui.unmount()

  expect(final).toEqual(streamed)

  return final
}

for (const columns of [140, 90, 60]) {
  test(`streamed then completed, ${columns} columns, no tools: rows already drawn never change; final = last streamed`, async ($, on) => {
    const rows = await streamTurn($, on, TURN, columns, false)

    // No web tools: footnote lines, never a frame (§0.2).
    expect(rows.some(l => l.includes('[ SOURCES ]'))).toBe(false)
    expect(rows.some(l => /^\s*┄┄┄┄ ¹/.test(l))).toBe(true)
  })

  test(`streamed then completed, ${columns} columns, after a web search: the frame from the first draw on`, async ($, on) => {
    const rows = await streamTurn($, on, TURN, columns, true)

    expect(rows.some(l => l.includes('[ SOURCES ]'))).toBe(true)
    expect(rows.some(l => /^\s*┄┄┄┄ /.test(l))).toBe(false)
  })
}

test('the whole turn as stacked: the open rule, you, claude and the footer each once', async ($, on) => {
  const reply = await streamTurn($, on, TURN, 140, false)
  const mount = async (component: string, props: Record<string, unknown>) => {
    const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component, viewport: { columns: 140, rows: 45 }, props } as never)
    const rows = textAt(await ui.drawn(), 140)
    await ui.unmount()

    return rows
  }
  const user = await mount('UserMessage', { text: 'make a table', origin: { kind: 'composer' }, isExpanded: false })
  const footer = await mount('TurnDuration', { word: 'Baked', durationMs: 5000 })
  const all = [...user, ...reply, ...footer]

  expect(all.filter(l => /▎ make a table/.test(l))).toHaveLength(1)
  expect(all.filter(l => l.includes('Contributor counts come from'))).toHaveLength(1)
  expect(all.filter(l => /5s · 428 tokens · 4 sources/.test(l))).toHaveLength(1)
})

test('the footer: tokens and sources change only its own row, never the rows above it', async ($, on) => {
  const before = await streamTurn($, on, TURN, 140, false)
  const draw = async (ms: number) => {
    const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'TurnDuration', viewport: { columns: 140, rows: 45 }, props: { word: 'Baked', durationMs: ms } } as never)
    const rows = textAt(await ui.drawn(), 140)
    await ui.unmount()

    return rows
  }

  // A footer with its numbers (this turn's 5s) and one with none (no close matches 9s):
  // the same height, one blank row then the rule.
  const full = await draw(5000)
  const bare = await draw(9000)
  expect(full).toHaveLength(bare.length)
  expect(full.filter(l => l.trim().length > 0)).toHaveLength(1)
  expect(full.join('\n')).toContain('5s · 428 tokens · 4 sources')
  expect(bare.join('\n')).toMatch(/9s ┄/)

  // The reply above is drawn the same before and after the footer mounts, even when the
  // engine mounts the message again (a new request for the same message): row for row.
  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: { columns: 140, rows: 45 }, props: { text: TURN, isFirstOfReply: true } } as never)
  const after = textAt(await ui.drawn(), 140)
  await ui.unmount()
  expect(after).toEqual(before)
})

// The session's observe hooks: `session.start` seeds the turn openers from history, `session.append` notes each
// stored assistant block in the flow and the turn's opener. Both observe only; a row is stored as it came.
import type { EngineInterface, On } from 'claude-code'

import type { FlowStamp } from '../../../types'
import { startCockpit } from '../../cockpit/feature'
import { logCited, logSaid } from '../../cockpit/log'
import { mcpName } from '../../shared/calls/describe'
import { isObject } from '../../shared/calls/fields'
import { readFlow, updateFlow } from '../../shared/flow'
import { capTurns } from '../../shared/held'
import { splitBlocks } from '../blocks/split'
import { citationsOf, turnCites } from '../citations'
import { NO_CAPS, hasCaps, withMcp, withSkill } from '../live'
import { firstKey } from './flow'
import {
  readAwaitingFirst,
  restorePrompts,
  readTurn,
  updateAwaitingFirst,
  updateCaps,
  updateFirstTexts,
  updateFirstTools,
  updateOpeners,
  updateTally
} from './state'

const FLOW_MAX = 600
const OPENERS_MAX = 300
const FIRSTS_MAX = 500

// The session's folder, for relative paths; set again by session.start on every (re)load.
let cwd: string | undefined

/**
 * The session's folder, for relative paths.
 * @returns the folder session.start last gave, or undefined before the first
 */
export function sessionCwd(): string | undefined {
  return cwd
}

type Content = ReadonlyArray<{ type: string; text?: unknown; id?: unknown; name?: unknown; input?: unknown }>

// Each stored assistant block, in order, under the current turn; cited links count as sources.
async function noteFlow($: EngineInterface, content: Content) {
  const turn = await readTurn($)
  const items: FlowStamp[] = []
  const links: string[] = []
  const earlier = turnCites(await readFlow($), turn)

  for (const b of content) {
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0) {
      const { own } = citationsOf(splitBlocks(b.text), earlier)

      items.push({ turn, kind: 'text', key: firstKey(b.text), ...(own.length > 0 ? { cites: own } : {}) })
      earlier.push(...own.filter(c => !earlier.some(x => x.url === c.url)))
      links.push(...own.map(c => c.url))
    } else if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
      items.push({ turn, kind: 'tool', key: b.id, tool: b.name })
    }
  }

  if (items.length > 0) await updateFlow($, list => capTurns([...list, ...items], FLOW_MAX, turn))
  if (links.length > 0) {
    await updateTally($, t => ({ ...t, sources: [...new Set([...t.sources, ...links])] }))
    // Cockpit's `[ SOURCES ]` marks its pages as the answer numbers them.
    await logCited($, earlier)
  }
}

// The opener fixes its capability line now: what the turn used so far, plus the skills
// and MCP servers its own message calls. Later use goes to the close rule's tally.
// Thinking under `claude` (§5.11): on a work turn, or past 10s on any turn. Whether the
// turn works is known at its opener only when the opener is a tool call or its message
// holds one; a turn that opens on prose shows its thinking only past 10s, so the line
// above never changes once tools follow.
const THOUGHT_ALWAYS_MS = 10_000

async function snapshotCaps($: EngineInterface, key: string, turn: string | null, content: Content, opensOnTool: boolean) {
  // Taken and reset in one write: a hook or skill noted meanwhile is never lost between them.
  let c = NO_CAPS

  await updateCaps($, held => {
    c = held

    return NO_CAPS
  })

  const isWork = opensOnTool || content.some(b => b.type === 'tool_use')

  if (!isWork && c.thoughtMs < THOUGHT_ALWAYS_MS) c = { ...c, thoughtMs: 0 }

  for (const b of content) {
    if (b.type !== 'tool_use' || typeof b.name !== 'string') continue

    const skill = b.name === 'Skill' && isObject(b.input) ? b.input['skill'] : undefined
    const server = mcpName(b.name)?.[0]

    if (typeof skill === 'string') c = withSkill(c, skill)
    if (server !== undefined) c = withMcp(c, server.replace(/^claude_ai_/, ''))
  }

  const snapped = c

  if (hasCaps(snapped)) await updateOpeners($, list => capTurns([...list, { key, turn, caps: snapped }], OPENERS_MAX, turn))
}

// User rows the engine writes itself (a slash command's echo, its output, a reminder, a
// task notice, a `!` shell): no typed prompt. `$.session.messages()` rows carry no origin,
// so the known tags are the test; a prompt that starts with any other `<` is the person's.
const INJECTED = /^\s*<(command-|local-command|system-reminder|task-notification|bash-|user-prompt-submit-hook)/

const RELOADED = /^\s*([\w.@/-]+): reloaded \((\d+) hooks?\b[^)]*\)\s*$/

/** A plugin's hot-reload note, shortened; anything else → undefined (left as it came). */
function reloadNote<M extends { content: unknown }>(message: M): M | undefined {
  const c = message.content
  const first: unknown = Array.isArray(c) && c.length === 1 ? c[0] : undefined
  const block = isObject(first) ? first : undefined
  const text = typeof c === 'string' ? c : block?.['type'] === 'text' && typeof block['text'] === 'string' ? block['text'] : undefined
  const m = text === undefined ? null : RELOADED.exec(text)

  if (m === null) return undefined

  const n = Number(m[2])
  const short = `${m[1]} reloaded · ${n} ${n === 1 ? 'hook' : 'hooks'}`

  return { ...message, content: typeof c === 'string' ? short : [{ ...block, text: short }] }
}

// The main loop's last row with text, and the turn it came in: the row a turn's receipt is drawn under.
// shortcut: kept in the module, so a reload mid-turn forgets it and that turn's receipt goes back to the flow's
// last block; move it to $.state if that shows.
let lastAnswer: { turn: string | null; row: string } | undefined

/**
 * The id of a turn's last answer row (the id it is drawn under, the same after a resume).
 * @param turn the engine turn
 * @returns the row's id, or '' when the turn wrote no text
 */
export function answerRowOf(turn: string): string {
  return lastAnswer?.turn === turn ? lastAnswer.row : ''
}

/**
 * Adds the session's observe hooks: `session.start` (with Cockpit's part of it) and `session.append`.
 * @param on the `on` that `register` receives
 */
export function registerSession(on: On): void {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd

    // Seed turn openers from history (a resumed session, or the turns before a reload):
    // the first assistant text after each typed prompt.
    try {
      const found = await $.session.messages()

      if (Array.isArray(found)) {
        const keys: string[] = []
        let waiting = false

        const tools: string[] = []

        for (const m of found) {
          if (m.role === 'user' && m.text.trim().length > 0 && !INJECTED.test(m.text) && (m.toolResults ?? []).length === 0) {
            waiting = true
          } else if (m.role === 'assistant' && waiting && m.text.trim().length > 0) {
            keys.push(firstKey(m.text))
            waiting = false
          } else if (m.role === 'assistant' && waiting && m.toolUses.length > 0) {
            // The turn opened on tools: its first call's row carries the label.
            tools.push(m.toolUses[0]?.tool_use_id ?? '')
            waiting = false
          }
        }

        // Seeded openers carry no turn (history has none); one already recorded keeps its own.
        // One entry per turn, so a plain cut drops whole turns.
        await updateFirstTexts($, list => [...[...new Set(keys)].filter(k => !list.some(x => x.key === k)).map(k => ({ key: k })), ...list].slice(-FIRSTS_MAX))
        await updateFirstTools($, list => [...new Set([...tools.filter(t => t.length > 0), ...list])].slice(-FIRSTS_MAX))
      }
    } catch {
      // No history: live turns still mark their openers.
    }

    // The turn rules of a resumed transcript show their submit times again.
    try {
      await restorePrompts($)
    } catch (error: unknown) {
      $.ui.log(`ghostframe: prompt times not restored: ${String(error)}`)
    }

    await startCockpit($, e)

    return next(e)
  })

  // Live: a typed prompt (or slash command) opens a turn; its first main-loop text row is the opener.
  on('session.append', async ($, e, next) => {
    // The engine's hot-reload note, `ghostframe: reloaded (13 hooks: ui.render, …)`, is kept
    // as one short line: `ghostframe reloaded · 13 hooks`. Any other row passes as it came.
    const shortened = reloadNote(e.message)

    if (shortened !== undefined) {
      return next({ ...e, message: shortened })
    }

    try {
      if (e.agentId === undefined && e.door === 'response') {
        if (e.message.content.some(b => b.type === 'text' && typeof b['text'] === 'string' && b['text'].trim().length > 0)) {
          lastAnswer = { turn: await readTurn($), row: e.uuid }
        }

        await noteFlow($, e.message.content)
        await logSaid($, e.message.content)
      }

      if (e.agentId === undefined && (e.door === 'prompt' || e.door === 'command')) {
        await updateAwaitingFirst($, () => true)
      } else if (e.agentId === undefined && e.door === 'response' && (await readAwaitingFirst($))) {
        // Claude's first visible block decides: prose text, or a tool call (the activity header).
        const opener = e.message.content.find(b => (b.type === 'text' && typeof b['text'] === 'string' && b['text'].trim().length > 0) || b.type === 'tool_use')

        const turn = await readTurn($)

        if (opener?.type === 'text' && typeof opener['text'] === 'string') {
          const key = firstKey(opener['text'])
          await snapshotCaps($, key, turn, e.message.content, false)
          await updateFirstTexts($, list => [...list, { key, turn }].slice(-FIRSTS_MAX))
          await updateAwaitingFirst($, () => false)
        } else if (opener?.type === 'tool_use' && typeof opener['id'] === 'string') {
          const id = opener['id']
          await snapshotCaps($, id, turn, e.message.content, true)
          await updateFirstTools($, list => [...list, id].slice(-FIRSTS_MAX))
          await updateAwaitingFirst($, () => false)
        }
      }
    } catch {
      // Observing only: the row is stored as it was either way.
    }

    return next(e)
  }).catch((_$, e, next) => next(e))
}

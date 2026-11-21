import { fitParts, partsWidth } from './shared/parts'
import type { Part } from './shared/parts'
import { fmtDuration } from './shared/time'
import { C } from './shared/tokens'

// ─── Live state and capabilities (DESIGN.md §5.11, §5.12, §5.17 under §0.1 r5, r10) ──
// Pure builders. The capability line is one dim line under `claude`, in words; the
// tally rides on the turn's close rule. Neither draws anything when it has nothing.

/** What a turn used before its first visible block: the capability line's content. */
export type Caps = { skills: string[]; hooks: string[]; mcp: string[]; thoughtMs: number }
export const NO_CAPS: Caps = { skills: [], hooks: [], mcp: [], thoughtMs: 0 }

/** What a whole turn used, for the close rule's tally. */
export type Tally = {
  skills: string[]
  hooks: number
  agents: number
  sources: string[]
  browser: number
  files: string[]
  tests: number
  shipped: number
}
export const NO_TALLY: Tally = { skills: [], hooks: 0, agents: 0, sources: [], browser: 0, files: [], tests: 0, shipped: 0 }

const THOUGHT_MIN_MS = 1000

/** `superpowers:systematic-debugging` → `systematic-debugging`. */
export const skillName = (s: string) => s.split(':').pop() ?? s

const addTo = (list: readonly string[], x: string) => (list.includes(x) ? [...list] : [...list, x])
export const withSkill = (c: Caps, s: string): Caps => ({ ...c, skills: addTo(c.skills, skillName(s)) })
export const withHook = (c: Caps, h: string): Caps => ({ ...c, hooks: addTo(c.hooks, h) })
export const withMcp = (c: Caps, server: string): Caps => ({ ...c, mcp: addTo(c.mcp, server) })

export const hasCaps = (c: Caps) => c.skills.length > 0 || c.hooks.length > 0 || c.mcp.length > 0 || c.thoughtMs >= THOUGHT_MIN_MS

/**
 * A classic hook's answer, in words, only when it changed something: blocked or denied
 * the prompt or call, or rewrote the prompt, the call's input or its output. A hook
 * that only ran (allowed, asked, or added context, as a hook on every prompt does)
 * → undefined: it never reaches the capability line or the tally.
 */
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function hookOutcome(event: string, result: unknown): string | undefined {
  if (!isObject(result)) return undefined

  const r = result

  if (typeof r['block'] === 'string' || r['preventContinuation'] === true) return `${event} blocked`
  if (typeof r['deny'] === 'string' || r['permissionDecision'] === 'deny') return `${event} denied`
  if (
    r['suppressOriginalPrompt'] === true ||
    r['updatedInput'] !== undefined ||
    r['updatedToolOutput'] !== undefined ||
    r['updatedMCPToolOutput'] !== undefined
  ) {
    return `${event} rewrote`
  }

  return undefined
}

const fit = (parts: Part[], width: number) => (partsWidth(parts) <= width ? parts : fitParts(parts, width).filter(p => p.t.trim().length > 0))

/**
 * `skills debugging, debug · hook PreToolUse allowed · mcp github · thought 6s`: kind
 * muted, names dim (r10). Thinking alone reads `thought for 6s · ctrl+o to read`.
 * Nothing used → undefined (no line at all).
 */
export function capsLine(c: Caps, width: number): Part[] | undefined {
  const thought = c.thoughtMs >= THOUGHT_MIN_MS ? fmtDuration(c.thoughtMs) : ''
  const groups: [string, string][] = [
    ...(c.skills.length > 0 ? [[c.skills.length > 1 ? 'skills' : 'skill', c.skills.join(', ')] as [string, string]] : []),
    ...(c.hooks.length > 0 ? [[c.hooks.length > 1 ? 'hooks' : 'hook', c.hooks.join(', ')] as [string, string]] : []),
    ...(c.mcp.length > 0 ? [['mcp', c.mcp.join(', ')] as [string, string]] : [])
  ]

  if (groups.length === 0) {
    return thought.length === 0
      ? undefined
      : fit(
          [
            { t: `thought for ${thought}`, color: C.dim },
            { t: ' · ', color: C.dim },
            { t: 'ctrl+o to read', color: C.muted }
          ],
          width
        )
  }

  const parts: Part[] = []

  for (const [kind, names] of [...groups, ...(thought.length > 0 ? [['thought', thought] as [string, string]] : [])]) {
    if (parts.length > 0) parts.push({ t: ' · ', color: C.dim })
    parts.push({ t: kind, color: C.muted }, { t: ` ${names}`, color: C.dim })
  }

  return fit(parts, width)
}

/** Level 3 (§0): the turn ran agents, a browser, research, tests, shipping or skills. */
export const isRun = (t: Tally) => t.skills.length > 0 || t.agents > 0 || t.sources.length > 0 || t.browser > 0 || t.tests > 0 || t.shipped > 0

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `2 skills · 1 hook · 3 sources · 5 browser actions`, in §5.17's order; '' below level 3. */
export function tallyText(t: Tally): string {
  if (!isRun(t)) return ''

  return [
    t.skills.length > 0 ? count(t.skills.length, 'skill', 'skills') : '',
    t.hooks > 0 ? count(t.hooks, 'hook', 'hooks') : '',
    t.agents > 0 ? count(t.agents, 'agent', 'agents') : '',
    t.sources.length > 0 ? count(t.sources.length, 'source', 'sources') : '',
    t.browser > 0 ? count(t.browser, 'browser action', 'browser actions') : '',
    t.files.length > 0 ? count(t.files.length, 'file changed', 'files changed') : ''
  ]
    .filter(x => x.length > 0)
    .join(' · ')
}

/** The spinner's verb from what the turn is doing (§5.11): props only, the engine draws. */
export function spinnerWord(mode: string): string | undefined {
  switch (mode) {
    case 'thinking':
      return 'thinking'
    case 'responding':
      return 'writing'
    case 'tool-input':
    case 'tool-use':
      return 'running'
    case 'requesting':
      return 'waiting'
    default:
      return undefined
  }
}

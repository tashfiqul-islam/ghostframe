import { mcpName } from '../shared/calls/describe'
import type { Part } from '../shared/parts'
import { clip, vw } from '../shared/text'
import { C } from '../shared/tokens'
import { splitUrl } from '../shared/url'
import { frameBottom, frameRow, frameTop } from './frame'

// ─── Browser session (DESIGN.md §5.14) ───────────────────────────────────────
// A run of browser calls draws as one [ BROWSER ] frame across its rows: the first
// row carries the top edge, every row its own `┆ … ┆` rails, and whatever comes
// next (prose, another step, the close rule) draws the bottom edge above itself, so
// no row ever changes once something follows it. The top edge's meta is the engine
// alone; the action count rides on the bottom edge, known only once the run ends.

export type BrowserTool = { engine: string; action: string }

/** A browser tool (Playwright MCP, Claude in Chrome, any `browser_*` MCP tool), or undefined. */
export function browserTool(tool: string): BrowserTool | undefined {
  const m = mcpName(tool)

  if (m === undefined) return undefined

  const [server, name] = m

  if (/playwright/i.test(server)) return { engine: 'playwright', action: name.replace(/^browser_/, '') }
  if (/chrome/i.test(server)) return { engine: 'chrome', action: name.replace(/^browser_/, '') }
  if (/browser|puppeteer/i.test(server) || name.startsWith('browser_')) {
    return { engine: server.replace(/^plugin_[^_]+_/, ''), action: name.replace(/^browser_/, '') }
  }

  return undefined
}

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {})

const VERBS: [RegExp, string][] = [
  [/^navigate_back$|^go_back$/, 'back'],
  [/^navigate$|^goto$|^open$/, 'goto'],
  [/^click$|^left_click$|^double_click$|^right_click$|^triple_click$/, 'click'],
  [/^type$|^fill(_form)?$|^form_input$/, 'fill'],
  [/^press(_key)?$|^key$/, 'press'],
  [/^hover$/, 'hover'],
  [/^select(_option)?$/, 'select'],
  [/screenshot|^capture/, 'capture'],
  [/^evaluate$|javascript|^run_code$|^eval$/, 'eval'],
  [/^wait(_for)?$/, 'wait'],
  [/^verify_|^expect/, 'expect'],
  [/^snapshot$|^read_page$|^get_page_text$|^find$/, 'read'],
  [/^tabs?(_|$)/, 'tab'],
  [/^resize/, 'resize'],
  [/console/, 'console'],
  [/network/, 'network'],
  [/^scroll/, 'scroll'],
  [/^drag/, 'drag'],
  [/upload/, 'upload'],
  [/dialog/, 'dialog'],
  [/^close$/, 'close']
]

/** Claude in Chrome's `computer` tool names its action in its input. */
function actionOf(b: BrowserTool, input: unknown): string {
  const a = s(obj(input)['action'])

  return b.action === 'computer' && a !== undefined ? a : b.action
}

export function browserVerb(b: BrowserTool, input: unknown): string {
  const a = actionOf(b, input)

  return VERBS.find(([re]) => re.test(a))?.[1] ?? clip(a.replace(/_/g, ' '), 8)
}

/** What the step acts on, from the call's own input; undefined → the verb alone. */
export function browserTarget(b: BrowserTool, input: unknown): string {
  const i = obj(input)
  const verb = browserVerb(b, input)
  const what = s(i['element']) ?? s(i['ref']) ?? s(i['selector']) ?? s(i['query'])

  switch (verb) {
    case 'goto': {
      const url = s(i['url'])

      if (url === undefined) return 'page'

      const [host, path] = splitUrl(url)

      return path.length > 0 ? path : host
    }
    case 'fill': {
      const text = s(i['text']) ?? s(i['value'])
      const fields = Array.isArray(i['fields']) ? i['fields'].length : undefined

      if (fields !== undefined) return `${fields} ${fields === 1 ? 'field' : 'fields'}`

      return [what, text === undefined ? undefined : `"${text}"`].filter(x => x !== undefined).join('  ›  ') || 'field'
    }
    case 'press':
      return s(i['key']) ?? s(i['text']) ?? 'key'
    case 'select': {
      const values = Array.isArray(i['values']) ? i['values'].filter((v): v is string => typeof v === 'string') : []

      return [what, values.length > 0 ? values.join(', ') : undefined].filter(x => x !== undefined).join('  ›  ') || 'option'
    }
    case 'capture':
      return s(i['filename']) ?? 'screenshot'
    case 'wait':
      return s(i['text']) ?? s(i['textGone']) ?? (typeof i['time'] === 'number' ? `${i['time']}s` : 'page')
    case 'expect':
      return (
        [what, s(i['text']) ?? s(i['value'])].filter(x => x !== undefined).join('  ') ||
        actionOf(b, input)
          .replace(/^verify_/, '')
          .replace(/_/g, ' ')
      )
    case 'eval':
      return (s(i['function']) ?? s(i['code']) ?? s(i['text']) ?? 'script').replace(/\s+/g, ' ')
    case 'tab':
      return s(i['action']) ?? actionOf(b, input).replace(/_/g, ' ')
    case 'resize':
      return typeof i['width'] === 'number' && typeof i['height'] === 'number' ? `${i['width']}×${i['height']}` : 'window'
    default:
      return what ?? (Array.isArray(i['coordinate']) ? i['coordinate'].join(', ') : actionOf(b, input).replace(/_/g, ' '))
  }
}

/** The URL a call goes to, for the URL bar: a `goto`'s `url`. */
export const browserUrl = (b: BrowserTool, input: unknown) => (browserVerb(b, input) === 'goto' ? s(obj(input)['url']) : undefined)

// ─── Frame pieces, each exactly `width` cells ────────────────────────────────

export const browserTop = (width: number, engine: string): Part[] => frameTop(width, 'BROWSER', { t: engine, color: C.muted })

export const browserBottom = (width: number, actions: number): Part[] =>
  frameBottom(width, { t: `${actions} ${actions === 1 ? 'action' : 'actions'}`, color: C.muted })

/** `┃ ● host/path ……… 0.4s`: host bright, path muted, the dot the load's state. */
export function urlBar(width: number, url: string, dot: Part, time: string): Part[] {
  const inner = width - 4
  const [host, path] = splitUrl(url)
  const right = time.length > 0 ? `   ${time}` : ''
  const room = Math.max(4, inner - 4 - vw(right))
  const h = clip(host, room)
  const p = clip(path, Math.max(0, room - vw(h)))
  const gap = Math.max(0, inner - 4 - vw(h) - vw(p) - vw(right))

  return frameRow(width, [
    { t: '┃ ', color: C.hairline },
    { ...dot, t: `${dot.t} ` },
    { t: h, color: C.textBright },
    { t: p, color: C.muted },
    { t: ' '.repeat(gap), color: C.text },
    { t: right, color: C.muted }
  ])
}

// ─── Where a block sits: the turn's flow of text and tool blocks ─────────────

/** One assistant block, in the order the session stored them. */
export type FlowItem = { turn: string | null; kind: 'text' | 'tool'; key: string; tool?: string }

const isBrowserItem = (f: FlowItem | undefined) => f?.kind === 'tool' && f.tool !== undefined && browserTool(f.tool) !== undefined

/**
 * How many browser calls run back-to-back right before position `at` in `turn`
 * (0: no open browser frame there). `at` may be `flow.length`: after everything.
 */
export function openRunBefore(flow: readonly FlowItem[], at: number, turn: string | null): number {
  let n = 0

  for (let i = Math.min(at, flow.length) - 1; i >= 0; i--) {
    const f = flow[i]

    if (f === undefined || f.turn !== turn || !isBrowserItem(f)) break
    n++
  }

  return n
}

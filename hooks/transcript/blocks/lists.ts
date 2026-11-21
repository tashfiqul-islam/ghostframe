import { parseInline } from '../prose'
import { isCited } from '../research/cites'
import { HEADING, headingText } from './heading'

/**
 * One list item: its nesting `depth` (0 = top), its marker as drawn (`·`, `3.`) and
 * its inline text. `loose`: the reply's last item, still streaming with markdown not
 * yet closed; drawn as plain text until it parses, so the finished items above it
 * never fall back to the engine.
 */
export type ListItem = { depth: number; marker: string; text: string; loose?: boolean }

// ─── Lists ───────────────────────────────────────────────────────────────────

const ITEM = /^( *)([-*+]|\d{1,3}[.)])\s+(.*)$/
// Inside a list we don't lay out: code fences, tables, html, quotes, tabs.
const NOT_LIST = /^\s*(```|~~~|\||>)|<\/?[a-z][^>]*>|\t/i
const TITLE_MAX = 60
const PLAIN_TITLE_MAX = 40

/** Text a list item can hold: inline markdown we lay out, links included. */
const inlineOk = (t: string) => t.length === 0 || parseInline(t) !== undefined || isCited(t)

/**
 * A short line right above a list in the same block (`**Test runs**`, `Why it's close`,
 * `## Next`) as its title; anything longer, or ending a sentence, is not one.
 */
function titleOf(line: string): string | undefined {
  const t = line.trim()
  const head = HEADING.exec(t)?.[1]
  const headText = head === undefined ? undefined : headingText(head)
  const bold = /^(?:\*\*|__)([^*_]+?)(?:\*\*|__):?$/.exec(t)?.[1]
  const plain = /[.!?]$/.test(t) || t.length > PLAIN_TITLE_MAX ? undefined : t
  const raw = (headText ?? bold ?? plain)?.replace(/:$/, '').trim()

  if (raw === undefined || raw.length === 0 || raw.length > TITLE_MAX) return undefined

  const runs = parseInline(raw)

  return runs === undefined || runs.some(r => r.s === 'code') ? undefined : runs.map(r => r.t).join('')
}

/** A block of list lines, under an optional title; anything we can't lay out → undefined. */
export function parseList(lines: string[], atEnd: boolean): { title?: string; items: ListItem[] } | undefined {
  if (lines.length === 0 || lines.some(l => NOT_LIST.test(l))) return undefined

  const first = lines[0] ?? ''
  const hasTitle = !ITEM.test(first)
  const title = hasTitle ? titleOf(first) : undefined

  if (hasTitle && (title === undefined || lines.length < 2 || !ITEM.test(lines[1] ?? ''))) return undefined

  const items: ListItem[] = []
  const indents: number[] = []

  for (const line of lines.slice(hasTitle ? 1 : 0)) {
    const m = ITEM.exec(line)

    if (m === null) {
      // A wrapped item line (indented or lazy) continues the item above it.
      const last = items[items.length - 1]

      if (last === undefined) return undefined
      last.text = `${last.text} ${line.trim()}`.trim()
      continue
    }

    const indent = (m[1] ?? '').length

    while (indents.length > 1 && indent < (indents[indents.length - 1] ?? 0)) indents.pop()
    if (indents.length === 0 || indent >= (indents[indents.length - 1] ?? 0) + 2) indents.push(indent)

    const mark = m[2] ?? '-'

    items.push({ depth: indents.length - 1, marker: /\d/.test(mark) ? `${mark.slice(0, -1)}.` : '·', text: (m[3] ?? '').trim() })
  }

  if (items.length === 0) return undefined

  for (const [i, it] of items.entries()) {
    if (inlineOk(it.text)) continue
    // Only the reply's very last item may still be streaming.
    if (atEnd && i === items.length - 1) it.loose = true
    else return undefined
  }

  return { ...(title !== undefined ? { title } : {}), items }
}

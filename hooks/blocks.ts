import { parseInline } from './prose'
import type { Run } from './prose'
import { isBareFence, isFigureTop, parseFigure } from './figure'
import type { FigureBlock } from './figure'
import { cutOpenLink, isCited, isSourcesLabel, isSourcesLabelPrefix, pendingSourceItems, sourceItems } from './research'
import { isSeparator, parseTable, splitRow } from './table'
import type { Table } from './table'

// ─── Blocks ──────────────────────────────────────────────────────────────────
// A reply splits at blank lines outside fences. We draw what we can lay out
// exactly (heading, simple paragraph, parseable table); the engine's Markdown
// draws the rest, so links, lists and code keep its look. A table we can't
// parse goes to the engine at full width (`wide`), outside the gutter, so it
// has every column the terminal has and never wraps for want of room.

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'para'; runs: Run[] }
  /**
   * `partial`: the table ends the text on a row still being written (no closing `|`),
   * as a streamed reply does. `settled` is then the table of its complete rows alone.
   */
  | { kind: 'table'; table: Table; partial: boolean; settled?: Table }
  | { kind: 'markdown'; text: string }
  | { kind: 'wide'; text: string }
  /** A paragraph whose inline links become footnote markers (§0.1 r7). */
  | { kind: 'cited'; text: string }
  /** A `Sources:` list of links: a footnote line, or a [ SOURCES ] frame past four. */
  | { kind: 'sources'; items: { title: string; url: string }[] }
  /** A Markdown list we lay out ourselves, under an optional short title line. */
  | { kind: 'list'; title?: string; items: ListItem[] }
  /** An mdxcn figure fence, redrawn in our frame (§5.7). */
  | FigureBlock

/**
 * One list item: its nesting `depth` (0 = top), its marker as drawn (`·`, `3.`) and
 * its inline text. `loose`: the reply's last item, still streaming with markdown not
 * yet closed; drawn as plain text until it parses, so the finished items above it
 * never fall back to the engine.
 */
export type ListItem = { depth: number; marker: string; text: string; loose?: boolean }

const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/
// Linear on purpose: the closing `#` run is cut in code (`headingText`), not by backtracking.
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/

/**
 * A heading's text without its closing `#` run (CommonMark): the run goes only after a
 * space or tab, or when it is the whole text, so `C#` keeps its `#`.
 */
const headingText = (raw: string) => {
  const t = raw.trimEnd()
  let end = t.length

  while (end > 0 && t[end - 1] === '#') end--

  return end === 0 || t[end - 1] === ' ' || t[end - 1] === '\t' ? t.slice(0, end).trimEnd() : t
}

/** An open fence: its character and run length. */
type Fence = { ch: string; n: number }

/**
 * The open fence after `line` (CommonMark): a fence line opens one, unless it is a
 * backtick run with a backtick in its info string (inline code); only a run of the same
 * character, at least as long, with nothing after it, closes it.
 */
function fenceAfter(open: Fence | undefined, line: string): Fence | undefined {
  const m = FENCE.exec(line)
  const run = m?.[1] ?? ''

  if (m === null) return open
  if (open === undefined) return run.startsWith('`') && (m[2] ?? '').includes('`') ? undefined : { ch: run.charAt(0), n: run.length }

  return run.charAt(0) === open.ch && run.length >= open.n && (m[2] ?? '').trim().length === 0 ? undefined : open
}
// Block markdown we don't lay out ourselves: lists, quotes, tables, html, rules, indented code.
const NOT_SIMPLE = /^\s{0,3}([-*+]\s|\d+[.)]\s|>|\||<|(-{3,}|\*{3,}|_{3,})\s*$)|^\s{4,}|\t/

export function splitBlocks(text: string): Block[] {
  // Whether the text's last line is whole (ends in a newline): an open figure fence
  // draws only whole lines, so a row never changes once drawn.
  const whole = /\n[ \t]*$/.test(text.replace(/\r\n?/g, '\n'))
  const raw: string[][] = []
  let cur: string[] = []
  let fence: Fence | undefined

  for (const line of text.replace(/\r\n?/g, '\n').trimEnd().split('\n')) {
    fence = fenceAfter(fence, line)

    if (fence === undefined && line.trim().length === 0) {
      if (cur.length > 0) {
        raw.push(cur)
        cur = []
      }

      continue
    }

    cur.push(line)
  }

  if (cur.length > 0) {
    raw.push(cur)
  }

  const out: Block[] = []

  raw.forEach((lines, i) => classify(lines, out, i === raw.length - 1, whole))

  return out
}

/**
 * `atEnd`: these lines end the whole text, so their last line may still be streaming.
 * `whole`: the text's last line is complete.
 */
function classify(lines: string[], out: Block[], atEnd: boolean, whole = true): void {
  if (lines.length === 0) {
    return
  }

  // An mdxcn figure: a bare fence whose first line is a figure's top edge. It splits out
  // of the lines around it; any other fence is left exactly as before.
  {
    const at = lines.findIndex((l, i) => isBareFence(l) && isFigureTop(lines[i + 1]))

    if (at >= 0) {
      const close = lines.findIndex((l, i) => i > at && isBareFence(l))
      const fence = close < 0 ? lines.slice(at) : lines.slice(at, close + 1)
      const rest = close < 0 ? [] : lines.slice(close + 1)
      const fig = parseFigure(fence.slice(1, close < 0 ? undefined : -1), close >= 0, !(atEnd && close < 0) || whole)

      classify(lines.slice(0, at), out, false)

      if (fig !== undefined) {
        out.push(fig)
      } else {
        // Malformed: the plain code block, as the engine draws it.
        const last = out[out.length - 1]
        const md = fence.join('\n')

        if (last?.kind === 'markdown') last.text += `\n\n${md}`
        else out.push({ kind: 'markdown', text: md })
      }

      classify(rest, out, atEnd, whole)

      return
    }
  }

  // A table's header still streaming, before its separator row is whole (every column):
  // it waits, so it never draws first as the engine's text and then as our table.
  if (atEnd && lines.length <= 2 && /^\s*\|/.test(lines[0] ?? '')) {
    const sep = lines[1]
    const columns = splitRow(lines[0] ?? '').length

    if (sep === undefined || (/^\s*\|?[\s:|-]*$/.test(sep) && (!isSeparator(sep) || splitRow(sep).length < columns || !sep.trimEnd().endsWith('|')))) return
  }

  // A table may sit inside a block (a lead-in line right above it): split around it.
  {
    let fence: Fence | undefined
    const inFence = lines.map(l => {
      const was = fence

      fence = fenceAfter(fence, l)

      return was !== undefined || FENCE.test(l)
    })
    const start = lines.findIndex((l, i) => !inFence[i] && !inFence[i + 1] && l.includes('|') && isSeparator(lines[i + 1] ?? ''))

    if (start >= 0) {
      let end = start + 2

      while (end < lines.length && !inFence[end] && (lines[end] ?? '').includes('|')) {
        end++
      }

      classify(lines.slice(0, start), out, false)
      const tableLines = lines.slice(start, end)
      const lastLine = tableLines[tableLines.length - 1] ?? ''
      // A body row with no closing pipe at the very end of the text is still being written.
      const partial = atEnd && end === lines.length && tableLines.length > 2 && !lastLine.trimEnd().endsWith('|')
      let table = parseTable(tableLines)
      let settled: Table | undefined

      if (partial) {
        const done = tableLines.slice(0, -1)
        settled = parseTable(done)

        // A half-written row may hold an unclosed `**` or backtick: drop the marks for now
        // (or the row itself) rather than hand the whole table to the engine mid-stream.
        // A link still being written in that row is cut off first: the row stays drawn.
        if (table === undefined && settled !== undefined) {
          table = parseTable([...done, cutOpenLink(lastLine)]) ?? parseTable([...done, cutOpenLink(lastLine).replace(/[*_`]/g, '')]) ?? settled
        }
      }

      out.push(table ? { kind: 'table', table, partial, ...(settled !== undefined ? { settled } : {}) } : { kind: 'wide', text: tableLines.join('\n') })
      classify(lines.slice(end), out, atEnd)

      return
    }
  }

  const head = lines.length === 1 ? HEADING.exec(lines[0] ?? '') : null

  if (head) {
    const runs = parseInline(headingText(head[1] ?? ''))

    if (runs !== undefined) {
      out.push({ kind: 'heading', text: runs.map(r => r.t).join('') })

      return
    }
  }

  // The reply's tail while it streams: a line that may become a `Sources:` label waits
  // (it draws nothing either way once it is one), and a paragraph whose last link is still
  // being written draws up to that link, so it never flips to the engine's Markdown and back.
  if (atEnd && lines.length === 1 && isSourcesLabelPrefix(lines[0] ?? '')) {
    return
  }

  // A Sources list still streaming draws as one, from its label on (before `- [` reads as text).
  if (atEnd && lines.length > 1 && isSourcesLabel(lines[0] ?? '')) {
    const pending = sourceItems(lines, false) ?? pendingSourceItems(lines, false)

    if (pending !== undefined) {
      out.push({ kind: 'sources', items: pending })

      return
    }
  }

  const simple = lines.every(l => !NOT_SIMPLE.test(l) && !FENCE.test(l) && !HEADING.test(l))

  if (atEnd && simple) {
    const tail = lines[lines.length - 1] ?? ''
    const cut = cutOpenLink(tail)

    if (cut !== tail) {
      const kept = [...lines.slice(0, -1), ...(cut.length > 0 ? [cut] : [])]

      classify(kept, out, atEnd, whole)

      return
    }
  }

  const runs = simple ? parseInline(lines.map(l => l.trim()).join(' ')) : undefined

  if (runs !== undefined && runs.length > 0) {
    out.push({ kind: 'para', runs })

    return
  }

  const joined = lines.map(l => l.trim()).join(' ')

  if (simple && isCited(joined)) {
    out.push({ kind: 'cited', text: joined })

    return
  }

  // A `Sources` label on its own block (heading or paragraph) right above the list joins it.
  const prev = out[out.length - 1]
  const labelAbove = (prev?.kind === 'heading' && isSourcesLabel(prev.text)) || (prev?.kind === 'para' && isSourcesLabel(prev.runs.map(r => r.t).join('')))
  // At the reply's end a Sources list may still be streaming: its whole items only.
  const items = sourceItems(lines, labelAbove) ?? (atEnd ? pendingSourceItems(lines, labelAbove) : undefined)

  if (items !== undefined) {
    if (labelAbove) out.pop()
    out.push({ kind: 'sources', items })

    return
  }

  const list = parseList(lines, atEnd)

  if (list !== undefined) {
    out.push({ kind: 'list', ...list })

    return
  }

  // Neighbouring engine blocks draw as one Markdown, so its own spacing holds.
  const last = out[out.length - 1]
  const md = lines.join('\n')

  if (last?.kind === 'markdown') {
    last.text += `\n\n${md}`
  } else {
    out.push({ kind: 'markdown', text: md })
  }
}

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
function parseList(lines: string[], atEnd: boolean): { title?: string; items: ListItem[] } | undefined {
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

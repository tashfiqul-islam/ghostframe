// The status line installer's plan, pure: where the `statusLine` entry sits in the text of a settings.json, the new
// text with only that entry changed (every other byte kept), and the diff the person sees before anything is written.

/** A `statusLine` entry as Claude Code reads it (code.claude.com/docs/en/statusline). */
export type StatusLineEntry = { type: 'command'; command: string; padding?: number; refreshInterval?: number; hideVimModeIndicator?: boolean }

/** Where a top-level key sits in a JSON object's text: the key's first quote, its value's span, and the object's end. */
type Span = { keyStart: number; valueStart: number; valueEnd: number }

/** A change to a settings file: the text to write, and the lines that change. */
export type Plan = { text: string; diff: string; isChange: boolean }

const WS = /\s/

function skipWs(s: string, i: number): number {
  let j = i

  while (j < s.length && WS.test(s[j] ?? '')) j++

  return j
}

function skipString(s: string, i: number): number {
  let j = i + 1

  while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1

  return j + 1
}

// Skips one JSON value from `i`; the text is known to parse, so only nesting and strings need care.
function skipValue(s: string, i: number): number {
  if (s[i] === '"') return skipString(s, i)
  if (s[i] !== '{' && s[i] !== '[') {
    let j = i

    while (j < s.length && !/[,}\]\s]/.test(s[j] ?? '')) j++

    return j
  }

  let depth = 0
  let j = i

  while (j < s.length) {
    const c = s[j]

    if (c === '"') {
      j = skipString(s, j)
      continue
    }
    if (c === '{' || c === '[') depth++
    if (c === '}' || c === ']') depth--
    j++
    if (depth === 0) return j
  }

  return j
}

/**
 * Where a top-level key's value sits in a JSON object's text.
 * @param text the settings file's text, a JSON object
 * @param key the top-level key
 * @returns the span, or null when the key is absent
 */
export function spanOf(text: string, key: string): Span | null {
  let i = skipWs(text, 0)

  if (text[i] !== '{') throw new Error('settings.json is not a JSON object')
  i = skipWs(text, i + 1)

  while (i < text.length && text[i] !== '}') {
    const keyStart = i
    const keyEnd = skipString(text, i)
    const name: unknown = JSON.parse(text.slice(keyStart, keyEnd))
    const valueStart = skipWs(text, skipWs(text, keyEnd) + 1)
    const valueEnd = skipValue(text, valueStart)

    if (name === key) return { keyStart, valueStart, valueEnd }
    i = skipWs(text, valueEnd)
    if (text[i] === ',') i = skipWs(text, i + 1)
  }

  return null
}

// The indent of the object's first key, else two spaces; a value is written at that indent.
function indentOf(text: string): string {
  return /\{\s*?\n([ \t]+)"/.exec(text)?.[1] ?? '  '
}

const valueText = (v: unknown, indent: string): string => JSON.stringify(v, null, indent).split('\n').join(`\n${indent}`)

/**
 * The settings text with the top-level `statusLine` set to `entry`, or removed when `entry` is null. Only that entry's
 * bytes change: every other key, its order, the file's indentation and line endings stay as they were.
 * @param text the settings file's text (must parse as a JSON object)
 * @param entry the new entry, or null to remove it
 * @returns the new text
 */
export function withStatusLine(text: string, entry: StatusLineEntry | null): string {
  const parsed: unknown = JSON.parse(text)

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('settings.json is not a JSON object')

  const indent = indentOf(text)
  const span = spanOf(text, 'statusLine')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const value = (e: StatusLineEntry): string => valueText(e, indent).split('\n').join(eol)

  if (span !== null && entry !== null) return text.slice(0, span.valueStart) + value(entry) + text.slice(span.valueEnd)
  if (span !== null) {
    // Remove the key, its value and one comma beside it (after it, else before it).
    const after = skipWs(text, span.valueEnd)

    if (text[after] === ',') return text.slice(0, span.keyStart) + text.slice(skipWs(text, after + 1))

    const before = text.slice(0, span.keyStart).replace(/,\s*$/, '')

    return before + text.slice(span.valueEnd).replace(/^\s*/, eol)
  }
  if (entry === null) return text

  // Add it as the last key.
  const close = text.lastIndexOf('}')
  const head = text.slice(0, close).replace(/\s*$/, '')
  const isEmpty = head.endsWith('{')

  return `${head}${isEmpty ? '' : ','}${eol}${indent}"statusLine": ${value(entry)}${eol}${text.slice(close)}`
}

/**
 * The lines that differ between two texts, with two lines of context, as `-` and `+` lines under their line numbers.
 * @param before the old text
 * @param after the new text
 * @returns the diff, empty when the texts are equal
 */
export function diffOf(before: string, after: string): string {
  if (before === after) return ''

  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  let top = 0

  while (top < a.length && top < b.length && a[top] === b[top]) top++

  let tail = 0

  while (tail < a.length - top && tail < b.length - top && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const ctx = 2
  const from = Math.max(0, top - ctx)
  const out = [`@@ line ${from + 1} @@`]

  for (let i = from; i < top; i++) out.push(`  ${a[i]}`)
  for (let i = top; i < a.length - tail; i++) out.push(`- ${a[i]}`)
  for (let i = top; i < b.length - tail; i++) out.push(`+ ${b[i]}`)
  for (let i = b.length - tail; i < Math.min(b.length, b.length - tail + ctx); i++) out.push(`  ${b[i]}`)

  return out.join('\n')
}

/**
 * The plan for one change to the `statusLine` entry.
 * @param text the settings file's current text
 * @param entry the entry to set, or null to remove it
 * @returns the new text and its diff
 */
export function planOf(text: string, entry: StatusLineEntry | null): Plan {
  const next = withStatusLine(text, entry)

  return { text: next, diff: diffOf(text, next), isChange: next !== text }
}

/**
 * The command the status line runs: Bun on the bundled script, by an absolute path with forward slashes (Git Bash
 * eats backslashes; docs: Windows configuration), quoted when it holds a space.
 * @param script the bundled script's absolute path
 * @returns the command line
 */
export function commandOf(script: string): string {
  const path = script.replaceAll('\\', '/')

  return `bun ${/\s/.test(path) ? `"${path}"` : path}`
}

/**
 * The entry ghostframe installs: refreshed every 10 s so the cache timer stays current while idle, no padding so the
 * mark lines up with Claude Code's footer.
 * @param script the bundled script's absolute path
 * @returns the entry
 */
export const entryOf = (script: string): StatusLineEntry => ({ type: 'command', command: commandOf(script), padding: 0, refreshInterval: 10 })

import { C } from '../tokens'
import { clip } from '../text'
import { clean } from './tests'
import { num, obj, s } from './fields'

// ─── What a finished call returned, as its row's result ──────────────────────

export type Tone = { text: string; color: string }

/** First meaningful line of an error text, without the "Exit code N" restatement or wrapper tags. */
export function firstErrorLine(text: string): string {
  const line = clean(text)
    .replace(/<\/?[a-z_-]+>/gi, '')
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0 && !/^(error:\s*)?exit code\b/i.test(l))

  return line ?? ''
}

const lineCount = (t: string) => (t.length === 0 ? 0 : t.replace(/\n+$/, '').split('\n').length)

/** +a −r from a structuredPatch. */
export function patchCounts(patch: unknown): { adds: number; dels: number } | undefined {
  if (!Array.isArray(patch)) return undefined

  let adds = 0
  let dels = 0

  for (const h of patch) {
    const lines = obj(h)?.['lines']

    if (!Array.isArray(lines)) return undefined

    for (const l of lines) {
      if (typeof l !== 'string') continue
      if (l.startsWith('+')) adds++
      else if (l.startsWith('-')) dels++
    }
  }

  return { adds, dels }
}

const plus = (n: number): Tone => ({ text: `+${n}`, color: C.add })
const minus = (n: number): Tone => ({ text: `−${n}`, color: C.del })

/** The result column for a finished, successful call; undefined → just `ok`. */
export function resultOf(tool: string, output: unknown): Tone[] | undefined {
  const o = obj(output)

  switch (tool) {
    case 'Read': {
      const n = num(obj(o?.['file'])?.['numLines'])
      return n === undefined ? undefined : [{ text: `${n} lines`, color: C.muted }]
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write': {
      const c = patchCounts(o?.['structuredPatch'])

      if (c && (c.adds > 0 || c.dels > 0)) return changeParts(c.adds, c.dels)

      const content = s(o?.['content'])
      const n = content === undefined ? 0 : lineCount(content)
      return tool === 'Write' && n > 0 ? changeParts(n, 0) : undefined
    }
    case 'Grep': {
      const mode = s(o?.['mode'])
      const n = mode === 'content' ? num(o?.['numLines']) : mode === 'count' ? num(o?.['numMatches']) : num(o?.['numFiles'])
      const unit = mode === 'content' ? 'lines' : mode === 'count' ? 'matches' : 'files'

      if (n === undefined) return undefined

      return [{ text: n === 0 ? 'no matches' : `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`, color: C.muted }]
    }
    case 'Glob': {
      const n = num(o?.['numFiles'])
      return n === undefined ? undefined : [{ text: n === 0 ? 'no files' : `${n} ${n === 1 ? 'file' : 'files'}`, color: C.muted }]
    }
    case 'WebSearch': {
      const r = o?.['results']
      return Array.isArray(r) ? [{ text: `${r.length} results`, color: C.muted }] : undefined
    }
    case 'WebFetch': {
      const code = num(o?.['code'])
      return code === undefined ? undefined : [{ text: `${code}`, color: code < 400 ? C.ok : C.err }]
    }
    case 'AskUserQuestion': {
      const answers = Object.values(obj(o?.['answers']) ?? {}).filter((a): a is string => typeof a === 'string')

      if (answers.length === 0) return undefined
      if (answers.length > 1) return [{ text: `${answers.length} answered`, color: C.ok }]

      return [{ text: `❯ ${clip(answers[0] ?? '', ANSWER_W)}`, color: C.link }]
    }
    case 'ExitPlanMode':
      return [{ text: 'approved', color: C.ok }]
    case 'TaskCreate': {
      const id = s(obj(o?.['task'])?.['id'])
      return id === undefined ? undefined : [{ text: `#${id}`, color: C.muted }]
    }
    default:
      return undefined
  }
}

const ANSWER_W = 28

/** `+18 −4`, `+3`, `−2`: zero sides left out; none at all → []. */
export function changeParts(adds: number, dels: number): Tone[] {
  return [...(adds > 0 ? [plus(adds)] : []), ...(dels > 0 ? [minus(dels)] : [])]
}

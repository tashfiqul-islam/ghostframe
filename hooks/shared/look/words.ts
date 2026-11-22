// Kind words (spec 5.6) and short result words (5.7, 13.6): what a step is, in one word of at most 6 cells, and what
// it returned, in a noun phrase of at most 14 cells.
import { TEST_CMD, mcpName } from '../calls/describe'
import { num, obj, s } from '../calls/fields'
import { patchCounts } from '../calls/results'
import { isShipCommand, parseShip, shellText } from '../calls/ships'
import { clean, parseTests } from '../calls/tests'
import { vw } from '../text'
import { stripCd } from './command'
import { changeCount, count } from './format'
import { cutTitle } from './paths'

/** A kind word's width (5.6). */
export const KIND_CELLS = 6
/** A result's width at most (5.7). */
export const RESULT_CELLS = 14

const isShell = (tool: string) => tool === 'Bash' || tool === 'PowerShell'
const commandOf = (input: unknown) => stripCd((s(obj(input)?.['command']) ?? '').split('\n')[0]?.trim() ?? '').command

/**
 * A call's kind word (5.6): `read` `edit` `write` `shell` `test` `fetch` `search` `agent` `todo` `browser` `mcp`. Tools
 * outside that list keep v7's word, cut to 6 cells (`ask`, `plan`, `skill`).
 * @param tool the tool's name
 * @param input its input
 * @returns the word
 */
export function kindWord(tool: string, input: unknown): string {
  if (isShell(tool)) return TEST_CMD.test(commandOf(input)) ? 'test' : 'shell'

  const mcp = mcpName(tool)

  if (mcp !== undefined) return /playwright|browser/i.test(mcp[0]) || mcp[1].startsWith('browser_') ? 'browser' : 'mcp'

  switch (tool) {
    case 'Read':
      return 'read'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'edit'
    case 'Write':
      return 'write'
    case 'Glob':
    case 'Grep':
    case 'LSP':
    case 'WebSearch':
      return 'search'
    case 'WebFetch':
      return 'fetch'
    case 'Agent':
    case 'Task':
      return 'agent'
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'todo'
    case 'AskUserQuestion':
      return 'ask'
    case 'ExitPlanMode':
    case 'EnterPlanMode':
      return 'plan'
    case 'Skill':
      return 'skill'
    default:
      return tool.toLowerCase().slice(0, KIND_CELLS)
  }
}

const words = (name: string) =>
  name
    .replace(/^browser_/, '')
    .replace(/[_-]+/g, ' ')
    .trim()

/**
 * What an mcp or browser step is called (5.6, screen 21): `mcp · linear create issue` from `mcp__linear__create_issue`,
 * `browser · screenshot` from a browser tool. Undefined for other tools.
 * @param tool the tool's name
 * @returns the label
 */
export function toolLabel(tool: string): string | undefined {
  const mcp = mcpName(tool)

  if (mcp === undefined) return undefined

  const isBrowser = /playwright|browser/i.test(mcp[0]) || mcp[1].startsWith('browser_')

  return isBrowser ? `browser · ${words(mcp[1])}` : `mcp · ${words(mcp[0])} ${words(mcp[1])}`
}

/** How a result is coloured (5.7): `machineDim` by default; pass and fail; bright for a hash; accent while running. */
export type ResultTone = 'dim' | 'ok' | 'err' | 'bright' | 'accent' | 'warn'

/** A result word and its tone. */
export type ResultWord = { text: string; tone: ResultTone }

/** How a call ended, as the step log hears it. */
export type Ended = { isError?: boolean | undefined; result?: unknown; text?: string | undefined; exit?: number | undefined }

const word = (text: string, tone: ResultTone = 'dim'): ResultWord => ({ text: cutTitle(text, RESULT_CELLS), tone })

const lines = (t: string) =>
  clean(t)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

/** The exit code an error text names (`Exit code 2`), if any. */
export const exitOf = (text: string): number | undefined => {
  const m = /exit code[:\s]+(\d+)/i.exec(text)

  return m === null ? undefined : Number(m[1])
}

/** A command's short result from its output (13.6), or undefined when its output gives none. */
function shellWord(cmd: string, out: string): ResultWord | undefined {
  if (isShipCommand(cmd)) {
    const ship = parseShip('', cmd, out)

    if (ship?.pr !== undefined) return word(`#${ship.pr.n}`, 'bright')
    if (ship?.commit !== undefined) return word(ship.commit.sha, 'bright')

    // A push names the hash it moved the branch to: `a1f3c2e..b72d0aa  main -> main`.
    const pushed = /^\s*[+*=!-]?\s*[0-9a-f]{7,40}\.\.\.?([0-9a-f]{7,40})\s+\S+\s+->/m.exec(clean(out))?.[1]

    if (pushed !== undefined) return word(pushed.slice(0, 7), 'bright')
    if (ship?.push !== undefined) return word(ship.push.to)
  }

  const text = lines(out)

  if (/\bgit(?:\s+-\S+(?:\s+\S+)?)*\s+status\b/.test(cmd) && text.some(l => /nothing to commit|working tree clean/.test(l))) return word('clean')
  if (/\bgit\s+status\s+(?:-s|--short|--porcelain)\b/.test(cmd) && text.length === 0) return word('clean')

  const audit = /(\d+)\s+(critical|high|moderate|low)\s+severity/i.exec(clean(out))

  if (/\b(?:npm|pnpm|yarn|bun)\s+audit\b/.test(cmd)) {
    if (audit !== null) return word(`${audit[1]} ${(audit[2] ?? '').toLowerCase()}`, 'err')
    if (/found 0 vulnerabilities|no vulnerabilities/i.test(out)) return word('clean')
  }

  // `npm outdated`: a header row, then one row per package.
  if (/\b(?:npm|pnpm|yarn|bun)\s+outdated\b/.test(cmd) && text.length > 1 && /^Package\b/.test(text[0] ?? '')) return word(`${text.length - 1} outdated`)

  const formatted = /\b(?:Formatted|Checked|Fixed)\s+(\d+)\s+files?\b/i.exec(clean(out))

  if (formatted !== null) return word(count(Number(formatted[1]), 'file'))
  if (/^(?:ls|dir|Get-ChildItem)\b/.test(cmd))
    return word(text.length === 0 ? 'empty' : count(text.filter(l => !/^total \d+$/.test(l)).length, ['entry', 'entries']))

  // One short line of output is its own result: `bun --version` prints `1.4.4`.
  if (text.length === 1 && vw(text[0] ?? '') <= RESULT_CELLS) return word(text[0] ?? '')

  return undefined
}

/**
 * A finished step's result (5.7, 13.6): a short noun phrase of at most 14 cells.
 * @param tool the tool's name
 * @param input its input
 * @param ended how it ended
 * @returns the word and its tone
 */
export function resultWord(tool: string, input: unknown, ended: Ended): ResultWord {
  const kind = kindWord(tool, input)
  const out = isShell(tool) ? shellText(ended.result) : ''
  const said = ended.text ?? ''

  if (kind === 'test') {
    const c = parseTests(ended.isError === true ? `${said}\n${out}` : out)

    if (c !== undefined) return c.failed > 0 ? word(`${c.failed} of ${c.passed + c.failed}`, 'err') : word(`${c.passed} pass`, 'ok')
  }

  if (isShell(tool)) {
    if (ended.isError === true) {
      const code = ended.exit ?? exitOf(said)

      return word(code === undefined ? 'failed' : `exit ${code}`, 'err')
    }

    return shellWord(commandOf(input), out) ?? word(ended.exit === undefined || ended.exit === 0 ? 'done' : `exit ${ended.exit}`)
  }

  if (ended.isError === true) return word(kind === 'read' && /not found|does not exist|no such file/i.test(said) ? 'not found' : 'failed', 'err')

  const o = obj(ended.result)

  switch (tool) {
    case 'Read': {
      const file = obj(o?.['file'])
      const content = s(file?.['content'])
      const n = content === undefined ? num(file?.['numLines']) : content.replace(/\r?\n$/, '').split('\n').length

      return word(n === undefined ? 'done' : count(n, 'line'))
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write': {
      const c = patchCounts(o?.['structuredPatch'])
      const content = s(o?.['content'])
      const written = tool === 'Write' && content !== undefined ? content.replace(/\n$/, '').split('\n').length : 0
      const text = c !== undefined && c.adds + c.dels > 0 ? changeCount(c.adds, c.dels) : written > 0 ? `+${written}` : 'no change'

      return word(text)
    }
    case 'Grep': {
      const mode = s(o?.['mode'])
      const n = mode === 'content' ? num(o?.['numLines']) : mode === 'count' ? num(o?.['numMatches']) : num(o?.['numFiles'])

      return word(n === undefined ? 'done' : n === 0 ? 'no match' : count(n, mode === 'files_with_matches' || mode === undefined ? 'file' : 'match'))
    }
    case 'Glob': {
      const n = num(o?.['numFiles'])

      return word(n === undefined ? 'done' : n === 0 ? 'no match' : count(n, 'file'))
    }
    case 'WebSearch': {
      const r = o?.['results']

      return word(Array.isArray(r) ? count(r.length, 'result') : 'done')
    }
    case 'WebFetch': {
      const code = num(o?.['code'])

      return code === undefined ? word('done') : word(String(code), code >= 400 ? 'err' : 'dim')
    }
    default:
      return mcpWord(tool, ended.result) ?? word('done')
  }
}

/** An mcp step's result (5.7): the key it created (`GHO-142`), or how many things it listed (`3 teams`). */
function mcpWord(tool: string, result: unknown): ResultWord | undefined {
  const mcp = mcpName(tool)

  if (mcp === undefined) return undefined
  if (/screenshot/i.test(mcp[1])) return word('1 image')

  const text = typeof result === 'string' ? result : JSON.stringify(result ?? null)
  const key = /"(?:identifier|key)"\s*:\s*"([A-Z][A-Z0-9]*-\d+)"/.exec(text)?.[1]

  if (key !== undefined) return word(key, 'bright')

  const listed = /^list_?(\w+)$/i.exec(mcp[1])?.[1]

  try {
    const parsed: unknown = typeof result === 'string' ? JSON.parse(result) : result
    const items = Array.isArray(parsed) ? parsed : Object.values(obj(parsed) ?? {}).find(v => Array.isArray(v))

    if (listed !== undefined && Array.isArray(items)) return word(`${items.length} ${listed.replace(/_/g, ' ')}`)
  } catch {
    // Not JSON: the step's result is `done`.
  }

  return undefined
}

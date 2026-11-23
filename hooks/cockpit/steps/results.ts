// A finished step's result and mark (spec E.12, E.39): a failure's reason, a shell command's summary, a tool's record.
import type { StepMark } from '../../../types'
import { DENIED, mcpName } from '../../shared/calls/describe'
import { firstErrorLine, resultOf } from '../../shared/calls/results'
import { isShipCommand, parseShip, shellText } from '../../shared/calls/ships'
import { parseTests } from '../../shared/calls/tests'
import { RESULT_CELLS } from '../../shared/look/words'
import { vw } from '../../shared/text'
import { command, firstLine, int, isShell, rec } from './kinds'
import type { Outcome } from './log'

const INTERRUPTED = /\binterrupted\b/i

const lastLine = (t: string) =>
  t
    .split('\n')
    .findLast(l => l.trim().length > 0)
    ?.trim() ?? ''

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// A check that passes by printing nothing (formatters, linters, type checkers): its silence reads `clean`.
const CHECK_CMD =
  /(?:^|[\s/])(?:oxlint|eslint|biome|prettier|oxfmt|ruff|black|gofmt|rustfmt|clippy|tsc|mypy|shellcheck|actionlint|zizmor|lint|fmt|format|typecheck)\b/
// `git` and its global options (`-C dir`, `-c k=v`, `--no-pager`) before the subcommand.
const gitSub = (sub: string) => new RegExp(String.raw`^git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+${sub}\b`)
const GIT_STATUS = gitSub('status')
const GIT_DIFF = gitSub('diff')

/** `git status`, long or short: `clean`, `N changed`, `N untracked`, or both. */
function gitStatus(text: string): string {
  const lines = text.split('\n')
  const short = lines.filter(l => /^[ MADRCU?!]{2} \S/.test(l))
  let changed = short.filter(l => !l.startsWith('??')).length
  let untracked = short.length - changed

  if (short.length === 0) {
    const at = lines.findIndex(l => l.startsWith('Untracked files:'))
    const listed = (from: number, to: number) => lines.slice(from, to).filter(l => l.startsWith('\t')).length

    changed = listed(0, at < 0 ? lines.length : at)
    untracked = at < 0 ? 0 : listed(at, lines.length)
  }

  // Both at once must fit the 16-cell result: untracked files are new files.
  if (changed > 0 && untracked > 0) return `${changed} changed +${untracked} new`
  if (changed > 0) return `${changed} changed`

  return untracked > 0 ? `${untracked} untracked` : 'clean'
}

/** `git diff`: `+a −d` from a `--stat` summary or the patch; `no changes` when empty. */
function gitDiff(text: string): string {
  const added = /(\d+) insertions?\(\+\)/.exec(text)?.[1]
  const removed = /(\d+) deletions?\(-\)/.exec(text)?.[1]
  const isStat = added !== undefined || removed !== undefined
  const lines = text.split('\n')
  const adds = isStat ? Number(added ?? 0) : lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
  const dels = isStat ? Number(removed ?? 0) : lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length

  return adds + dels === 0 ? 'no changes' : [...(adds > 0 ? [`+${adds}`] : []), ...(dels > 0 ? [`−${dels}`] : [])].join(' ')
}

/** `ls`: `N items` (not `total n`, `.` or `..`), or `empty`. */
function listing(text: string): string {
  const items = text.split('\n').filter(l => l.trim().length > 0 && !/^total \d+$/.test(l.trim()) && !/(?:^|\s)\.\.?$/.test(l.trim()))

  return items.length === 0 ? 'empty' : plural(items.length, 'item')
}

/** A passing shell step's result: a short summary for common commands, else its last line of output. */
function shellSummary(cmd: string, text: string): string {
  if (GIT_STATUS.test(cmd)) return gitStatus(text)
  if (GIT_DIFF.test(cmd)) return gitDiff(text)
  if (/^ls\b/.test(cmd)) return listing(text)

  return lastLine(text) || (CHECK_CMD.test(cmd) ? 'clean' : 'no output')
}

const tonesText = (tones: readonly { text: string }[] | undefined) => tones?.map(t => t.text).join(' ') ?? ''

/** An error's result and mark. */
function failure(kind: string, tool: string, outcome: Outcome): { result: string; mark: StepMark } {
  const said = outcome.deny ?? outcome.text ?? ''

  if (INTERRUPTED.test(said)) return { result: 'interrupted', mark: '' }
  if (outcome.deny !== undefined || DENIED.test(said)) return { result: 'denied', mark: '' }

  if (kind === 'test') {
    const c = parseTests(said)

    if (c !== undefined && c.failed > 0) return { result: `${c.failed} of ${c.passed + c.failed} fail`, mark: '✕' }
  }

  if (isShell(tool)) {
    const code = /exit code[:\s]+(\d+)/i.exec(said)?.[1]

    return { result: code === undefined ? 'failed' : `exit ${code}`, mark: '✕' }
  }

  if (kind === 'read' && /does not exist|not found|no such file/i.test(said)) return { result: 'not found', mark: '✕' }
  if (kind === 'edit' && /not found|no match/i.test(said)) return { result: 'no match', mark: '✕' }
  // The edit tools' own guards (13.6): the file was not read first, or it changed since.
  if (/has not been read yet/i.test(said)) return { result: 'not read', mark: '✕' }
  if (/modified since read/i.test(said)) return { result: 'file changed', mark: '✕' }
  if (/timed? ?out/i.test(said)) return { result: 'timed out', mark: '✕' }

  // At most 14 cells (13.6): a longer line is no result, so the step just failed.
  const line = firstErrorLine(said)

  return { result: line.length > 0 && vw(line) <= RESULT_CELLS ? line : 'failed', mark: '✕' }
}

/** A finished call's result and mark; `fixes` says a failed step with the same key is still open. */
export function outcomeOf(kind: string, tool: string, input: unknown, outcome: Outcome, fixes: boolean): { result: string; mark: StepMark } {
  if (outcome.isError === true || outcome.deny !== undefined) return failure(kind, tool, outcome)

  const out = outcome.result

  if (kind === 'test') {
    const c = parseTests(shellText(out))

    if (c !== undefined)
      return c.failed > 0 ? { result: `${c.failed} of ${c.passed + c.failed} fail`, mark: '✕' } : { result: `${c.passed} pass`, mark: fixes ? '✓' : '' }
  }

  if (isShell(tool)) {
    const cmd = command(input)
    const ship = isShipCommand(cmd) ? parseShip('', cmd, shellText(out)) : undefined

    if (ship?.pr !== undefined) return { result: `PR #${ship.pr.n}`, mark: '↗' }
    if (ship?.push !== undefined) return { result: ship.push.to, mark: '↗' }
    if (ship?.commit !== undefined) return { result: ship.commit.sha, mark: '±' }

    return { result: shellSummary(cmd, shellText(out)), mark: fixes ? '✓' : '' }
  }

  switch (tool) {
    case 'WebFetch': {
      const r = rec(out)
      const code = int(r['code'])
      const bytes = int(r['bytes'])
      const size = bytes === undefined ? '' : ` · ${Math.max(1, Math.round(bytes / 1_000))} kB`

      return code === undefined ? { result: '', mark: '' } : { result: `${code}${size}`, mark: code >= 400 ? '✕' : '' }
    }
    case 'Skill':
      return { result: 'loaded', mark: '' }
    case 'TodoWrite': {
      const listed: unknown = rec(input)['todos']
      const todos: readonly unknown[] = Array.isArray(listed) ? listed : []

      return { result: `${todos.filter(t => rec(t)['status'] === 'completed').length} of ${todos.length}`, mark: '' }
    }
    case 'AskUserQuestion':
      return { result: tonesText(resultOf(tool, out)).replace(/^❯ /, ''), mark: '' }
    default: {
      const said = tonesText(resultOf(tool, out))

      return { result: said || (mcpName(tool) === undefined ? '' : firstLine(outcome.text ?? '')), mark: '' }
    }
  }
}

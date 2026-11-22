// What counts as a failure (spec 13.1): the failure key (program · subcommand · target), negative answers, and when a
// later step fixes a failure. Pure: the step log reads these at every settle.
import { stripCd } from '../../shared/look/command'
import { showPath } from '../../shared/look/paths'

/** A failure's key (13.1): the program, its subcommand and its target, each '' when it has none. */
export type FailureKey = { program: string; sub: string; target: string }

// The tools whose first argument that is not a flag is a subcommand (13.1).
const WITH_SUBCOMMANDS = new Set(['bun', 'npm', 'pnpm', 'yarn', 'git', 'gh', 'cargo', 'go', 'docker', 'kubectl'])
// The kinds whose error is a failure (13.1); a fetch or a search never is (amendment 6). v7's `notebook` is an edit.
const FAILURE_KINDS = new Set(['test', 'shell', 'edit', 'write', 'agent', 'notebook'])

/** Whether a step of this kind can fail (13.1). */
export const canFail = (kind: string): boolean => FAILURE_KINDS.has(kind)

/** A command's words, quotes respected and removed. */
const wordsOf = (cmd: string) => (cmd.match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) ?? []).map(w => w.replace(/^["']|["']$/g, ''))

const isFlag = (w: string) => w.startsWith('-')
const isAssignment = (w: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)
// A path: it has a separator or a dot, or names the home folder.
const isPathLike = (w: string) => /[/\\]/.test(w) || /\.[A-Za-z0-9]+$/.test(w) || w.startsWith('~')
// Where a command's words end: the next command after `&&`, `||`, `;` or a pipe is another step's business.
const firstCommand = (cmd: string) => cmd.split(/\s*(?:&&|\|\||;|\|)\s*/)[0] ?? cmd

/**
 * A step's failure key (13.1).
 * @param kind the step's kind word
 * @param command the command a shell or test step ran, or '' for others
 * @param file the file an edit or a write changed, or ''
 * @param project the project root, for a project-relative target (13.2)
 * @returns the key
 */
export function failureKey(kind: string, command: string, file: string, project?: string): FailureKey {
  if (kind === 'edit' || kind === 'write' || kind === 'notebook')
    return { program: kind === 'notebook' ? 'edit' : kind, sub: '', target: showPath(file, { project }) }

  const words = wordsOf(firstCommand(stripCd(command).command)).filter((w, i, all) => !(isAssignment(w) && all.slice(0, i).every(isAssignment)))
  const programWord = words[0] ?? ''
  const program = programWord.replace(/^.*[/\\]/, '').replace(/\.(?:exe|cmd)$/i, '')
  // `git -C dir`, `git -c k=v`, `docker --context x`: a global option's value is not the subcommand.
  const rest = words.slice(1).filter((_, i, all) => !(i > 0 && /^-[Cc]$|^--(?:context|namespace|git-dir|work-tree)$/.test(all[i - 1] ?? '')))
  const subAt = WITH_SUBCOMMANDS.has(program) ? rest.findIndex(w => !isFlag(w)) : -1
  const sub = subAt < 0 ? '' : (rest[subAt] ?? '')
  const args = rest.slice(subAt + 1).filter(w => !isFlag(w))
  // A test's first argument is its filter, path or not; elsewhere only a path is a target.
  const found = args.find(w => kind === 'test' || isPathLike(w))

  return { program, sub, target: found === undefined ? '' : showPath(found, { project }) }
}

/** A key as the spec writes it (13.1): `bun · test · hooks/width`, `npm · audit ·`, `edit · · tests/width.test.tsx`. */
export const keyText = (k: FailureKey): string => `${k.program} ·${k.sub.length > 0 ? ` ${k.sub}` : ''} ·${k.target.length > 0 ? ` ${k.target}` : ''}`

/** A key read back from its text. */
export function keyOf(text: string): FailureKey {
  const m = /^(.*?) ·(?: (.*?))? ·(?: (.*))?$/.exec(text)

  return m === null ? { program: text, sub: '', target: '' } : { program: m[1] ?? '', sub: m[2] ?? '', target: m[3] ?? '' }
}

/**
 * Whether a later success with key `later` fixes a failure with key `failed` (13.1): the same key, or a broader one,
 * the same program and subcommand with a target that is empty or contains the failed target.
 * @param later the passing step's key
 * @param failed the failed step's key
 * @returns whether it fixes it
 */
export function fixes(later: FailureKey, failed: FailureKey): boolean {
  if (later.program !== failed.program || later.sub !== failed.sub) return false
  if (later.target === failed.target || later.target.length === 0) return true

  return failed.target.startsWith(`${later.target.replace(/\/+$/, '')}/`)
}

// The commands whose exit 1 is an answer, not an error (13.1): `no match` from a search, `differs` from a compare.
const NO_MATCH = new Set(['grep', 'egrep', 'fgrep', 'rg', 'test', '['])
const DIFFERS = new Set(['diff', 'cmp'])

/**
 * A negative answer (13.1): a search or a compare that exited 1 with nothing on stderr means "no" or "differs". Its
 * step is `✓`, its result the word this returns. Exit 2 and up are these tools' errors.
 * @param command the command, `cd` prefix and all
 * @param exit its exit code
 * @param stderr what it wrote to stderr, when that is known apart from stdout
 * @returns `no match`, `differs`, or undefined when the exit is an error
 */
export function negativeAnswer(command: string, exit: number | undefined, stderr?: string): 'no match' | 'differs' | undefined {
  if (exit !== 1 || (stderr !== undefined && stderr.trim().length > 0)) return undefined

  const words = wordsOf(firstCommand(stripCd(command).command)).filter(w => !isAssignment(w))
  const program = (words[0] ?? '').replace(/^.*[/\\]/, '')

  if (NO_MATCH.has(program)) return 'no match'
  if (DIFFERS.has(program)) return 'differs'
  if (program === 'git' && words.includes('diff') && (words.includes('--exit-code') || words.includes('--quiet'))) return 'differs'

  return undefined
}

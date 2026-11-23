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
// Where a command's words end: the next command after `&&`, `||`, `;` or a pipe is another step's business; one
// inside quotes or brackets (`grep -E "a|b"`) joins nothing.
const firstCommand = (cmd: string) => statementsOf(cmd)[0] ?? cmd
// A PowerShell assignment's left side (`$t = `, `$env:LANG = `), stripped like `VAR=value` (section 14).
const PS_ASSIGNMENT = /^\s*\$[A-Za-z_][\w:]*\s*[+-]?=\s*/
// A redirection: `>`, `>>`, `2>`, `*>`, `2>&1`; on its own, the word after it is what it writes to.
const REDIRECT = /^[0-9*]?>>?/
const isBareRedirect = (w: string) => /^[0-9*]?>>?$/.test(w)
// A statement with no program to name (section 14): PowerShell's expressions, script blocks and loops; the shell's
// own loops and conditionals.
const PWSH_STATEMENT = /^(?:[[($@{'"0-9]|(?:foreach|for|while|do|if|switch|try|function)\b)/i
const BASH_STATEMENT = /^(?:[({]|(?:for|while|until|if|case|function)\b)/
// Options whose value is a folder, not a target: `git -C dir`, `bun run --cwd tools`, `npm --prefix web`.
const DIR_OPTION = /^-[Cc]$|^--(?:context|namespace|git-dir|work-tree|cwd|prefix)$/

/**
 * A command's statements, split at `;`, `&&`, `||` and `|` outside quotes, brackets, parentheses and braces, so a
 * `;` inside `$t.Replace("a; b", …)` or a script block is not a statement of its own.
 * @param cmd the command
 * @returns its statements, trimmed
 */
function statementsOf(cmd: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let from = 0

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i] ?? ''

    if (quote.length > 0) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && (ch === ';' || ch === '|' || (ch === '&' && cmd[i + 1] === '&'))) {
      out.push(cmd.slice(from, i).trim())
      i += cmd[i + 1] === ch ? 1 : 0
      from = i + 1
    }
  }

  return [...out, cmd.slice(from).trim()].filter(s => s.length > 0)
}

/**
 * PowerShell's first command (section 14): its assignment's left side stripped (`$t = Get-Content …` runs
 * Get-Content) and its call operator (`& "C:\tools\x.exe" …` runs x). A leading assignment that runs no program
 * (`$env:LANG = "C"; bun test`) is PowerShell's `VAR=value`, so the next command keys.
 * @param cmd the command, its `cd` prefix stripped
 * @returns the command that keys, or undefined when no command runs a program
 */
function firstPwshCommand(cmd: string): string | undefined {
  for (const part of statementsOf(cmd)) {
    const assigned = part.replace(PS_ASSIGNMENT, '')
    const called = assigned.replace(/^\s*&\s+/, '')

    // What the call operator runs is a program, quoted path and all.
    if (called !== assigned || !PWSH_STATEMENT.test(called.trimStart())) return called
    if (!PS_ASSIGNMENT.test(part)) return undefined
  }

  return undefined
}

/** A command's words with its redirections and what they write to removed. */
function withoutRedirects(words: readonly string[]): string[] {
  return words.filter((w, i) => !REDIRECT.test(w) && !isBareRedirect(words[i - 1] ?? ''))
}

/**
 * A step's failure key (13.1).
 * @param kind the step's kind word
 * @param command the command a shell or test step ran, or '' for others
 * @param file the file an edit or a write changed, or ''
 * @param project the project root, for a project-relative target (13.2)
 * @param shell the shell that ran it: PowerShell's statements key on `pwsh`, the others' on `bash`
 * @returns the key
 */
export function failureKey(kind: string, command: string, file: string, project?: string, shell: 'pwsh' | 'bash' = 'bash'): FailureKey {
  if (kind === 'edit' || kind === 'write' || kind === 'notebook')
    return { program: kind === 'notebook' ? 'edit' : kind, sub: '', target: showPath(file, { project }) }

  // PowerShell's first command has already left out its statements; the shell's loops are found here.
  const stated = shell === 'pwsh' ? firstPwshCommand(stripCd(command).command) : firstCommand(stripCd(command).command)

  if (stated === undefined || (shell === 'bash' && BASH_STATEMENT.test(stated.trimStart()))) return { program: shell, sub: '', target: '' }

  const words = withoutRedirects(wordsOf(stated)).filter((w, i, all) => !(isAssignment(w) && all.slice(0, i).every(isAssignment)))
  const programWord = words[0] ?? ''
  const program = programWord.replace(/^.*[/\\]/, '').replace(/\.(?:exe|cmd)$/i, '')
  // `git -C dir`, `git -c k=v`, `docker --context x`: a global option's value is not the subcommand.
  const rest = words.slice(1).filter((_, i, all) => !(i > 0 && DIR_OPTION.test(all[i - 1] ?? '')))
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

// A write of a file fixes a failed edit of it, and the other way round (section 14): both leave the file changed.
const family = (program: string) => (program === 'write' ? 'edit' : program)

/**
 * Whether a later success with key `later` fixes a failure with key `failed` (13.1): the same key, or a broader one,
 * the same program and subcommand with a target that is empty or contains the failed target.
 * @param later the passing step's key
 * @param failed the failed step's key
 * @returns whether it fixes it
 */
export function fixes(later: FailureKey, failed: FailureKey): boolean {
  if (family(later.program) !== family(failed.program) || later.sub !== failed.sub) return false
  if (later.target === failed.target || later.target.length === 0) return true

  return failed.target.startsWith(`${later.target.replace(/\/+$/, '')}/`)
}

// How the engine words a hook's refusal: `PreToolUse:PowerShell hook error: [<command it ran>]: <its message>`.
const HOOK_ERROR = /hook error: \[([^\]]*)\]:\s*([^\r\n]*)/

/**
 * A hook's refusal as the engine reports it (13.7): the script the hook ran (its file name) and the message it gave.
 * @param text the refusal's text
 * @returns the script and message, or undefined when the text is not a hook's
 */
export function hookWords(text: string): { script: string; message: string } | undefined {
  const m = HOOK_ERROR.exec(text)

  if (m === null) return undefined

  const words = wordsOf(m[1] ?? '')
  const file = words.findLast(w => /\.[A-Za-z0-9]+$/.test(w)) ?? words.at(-1) ?? ''

  return { script: file.replace(/^.*[/\\]/, ''), message: (m[2] ?? '').trim() }
}

/**
 * The statement of a joined command a permission rule matched (13.7): `rm -rf src` in `ls src && rm -rf src && ls`,
 * for a rule such as `Bash(rm -rf:*)`.
 * @param command the whole command
 * @param rule the rule, as the engine names it
 * @returns the statement, or undefined when the rule names no prefix or no statement starts with it
 */
export function ruledStatement(command: string, rule: string): string | undefined {
  const m = /^\w+\(([^:)]+)(?::\*)?\)$/.exec(rule.trim())
  const prefix = m?.[1]?.trim()

  if (prefix === undefined || prefix.length === 0) return undefined

  return statementsOf(stripCd(command).command).find(s => s === prefix || s.startsWith(`${prefix} `))
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

import { C } from '../tokens'
import { relPath, sourceLabel } from '../url'
import { obj, s } from './fields'

// ─── What a call is: its verb and target, and the commands it runs ────────────

/**
 * A test runner in command position: the command's start or after a new line, `&&` `||`
 * `;` `|` `(`, past any `VAR=x`, a wrapper (`time`, `env`, `sudo`, `exec`, `nohup`,
 * `bash -c "`), a launcher (`npx`, `bunx`, `uvx`, `pnpm exec`, `npm run`, `bun run`,
 * `uv run`, `poetry run`, `pipenv run`, `python -m`…) and a path (`./node_modules/.bin/`).
 * Group 1 is the runner. A name in an argument (`cat vitest.config.ts`, `npm i -D jest`)
 * is not one.
 */
export const TEST_CMD: RegExp =
  /(?:^|&&|\|\||[;|(\n])\s*(?:(?:\w+=\S*|time|env|sudo|exec|nohup)\s+|(?:ba|z|da)?sh\s+-c\s+["']?)*(?:(?:npx|bunx|uvx|pnpm\s+exec|pnpm|yarn|npm\s+run|bun\s+run|bun|uv\s+run|poetry\s+run|pipenv\s+run|python3?\s+-m)\s+)?(?:[\w.~-]*\/)*(vitest|jest|pytest|playwright\s+test|bun\s+test|claude\s+plugin\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|cargo\s+test|go\s+test|dotnet\s+test|mocha)\b(?![./])/
// The engine's own denial messages only; a shell's `Permission denied` is an ordinary error.
export const DENIED: RegExp = /doesn't want to proceed|user (denied|rejected)|^\s*Permission to use .+ has been denied/im

// `git` and its global options (`-C dir`, `-c k=v`, `--no-pager`) before the subcommand.
const GIT = String.raw`\bgit(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+`
export const GIT_COMMIT: RegExp = new RegExp(`${GIT}commit\\b`)
export const GIT_PUSH: RegExp = new RegExp(`${GIT}push\\b`)
/** A commit's header line, `[main a1b2c3d] subject` or `[detached HEAD a1b2c3d] subject`: group 1 the SHA, 2 the subject. */
export const COMMIT_HEAD: RegExp = /^\[(?:detached HEAD|[^\]\s]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m

/** `mcp__github__list_pull_requests` → [`github`, `list_pull_requests`]. */
export function mcpName(tool: string): [string, string] | undefined {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool)

  return m ? [m[1] ?? '', m[2] ?? ''] : undefined
}

/** The verb and target of a call, or undefined when we don't know the tool's shape. */
export function describe(
  tool: string,
  input: unknown,
  cwd?: string
): { verb: string; target: string; isPath: boolean; targetColor?: string; isLabel?: boolean } | undefined {
  const i = obj(input)

  if (i === undefined) return undefined

  const path = (k: string) => {
    const v = s(i[k])

    return v === undefined ? undefined : { target: relPath(v, cwd), isPath: true }
  }

  switch (tool) {
    case 'Read': {
      const p = path('file_path')
      return p && { verb: 'read', ...p }
    }
    case 'Edit':
    case 'MultiEdit': {
      const p = path('file_path')
      return p && { verb: 'edit', ...p }
    }
    case 'NotebookEdit': {
      const p = path('notebook_path')
      return p && { verb: 'edit', ...p }
    }
    case 'Write': {
      const p = path('file_path')
      return p && { verb: 'write', ...p }
    }
    case 'Bash':
    case 'PowerShell': {
      const cmd = s(i['command'])?.split('\n')[0]?.trim()
      const said = s(i['description'])?.replace(/\s+/g, ' ').trim()
      return cmd === undefined ? undefined : { verb: TEST_CMD.test(cmd) ? 'test' : 'shell', target: said ?? cmd, isPath: false }
    }
    case 'Grep': {
      const pat = s(i['pattern'])
      const where = s(i['path']) ?? s(i['glob'])
      return pat === undefined ? undefined : { verb: 'search', target: where ? `"${pat}" in ${relPath(where, cwd)}` : `"${pat}"`, isPath: false }
    }
    case 'Glob': {
      const pat = s(i['pattern'])
      return pat === undefined ? undefined : { verb: 'find', target: pat, isPath: false }
    }
    case 'WebFetch': {
      const url = s(i['url'])
      return url === undefined ? undefined : { verb: 'fetch', target: sourceLabel(url), isPath: false, isLabel: true, targetColor: C.muted } // a URL label, muted (§0.2)
    }
    case 'WebSearch': {
      const q = s(i['query'])
      return q === undefined ? undefined : { verb: 'search', target: q, isPath: false }
    }
    case 'Agent':
    case 'Task': {
      const d = s(i['description']) ?? s(i['subagent_type'])
      return d === undefined ? undefined : { verb: 'agent', target: d, isPath: false }
    }
    case 'TodoWrite':
      return Array.isArray(i['todos']) ? { verb: 'todo', target: `${i['todos'].length} items`, isPath: false } : undefined
    case 'Skill': {
      const name = s(i['skill'])
      return name === undefined ? undefined : { verb: 'skill', target: name, isPath: false }
    }
    case 'AskUserQuestion': {
      const qs = Array.isArray(i['questions']) ? i['questions'] : []
      const first = s(obj(qs[0])?.['question'])

      if (first === undefined) return undefined

      return { verb: 'ask', target: qs.length > 1 ? `${qs.length} questions` : first, isPath: false }
    }
    case 'ExitPlanMode':
      return { verb: 'plan', target: 'plan for review', isPath: false }
    case 'EnterPlanMode':
      return { verb: 'plan', target: 'entered plan mode', isPath: false }
    case 'TaskCreate': {
      const subject = s(i['subject'])
      return subject === undefined ? undefined : { verb: 'task', target: subject, isPath: false }
    }
    case 'TaskUpdate': {
      const id = s(i['taskId'])
      const subject = s(i['subject'])
      return id === undefined ? undefined : { verb: 'task', target: subject ? `#${id} ${subject}` : `#${id}`, isPath: false }
    }
    default: {
      const m = mcpName(tool)
      return m ? { verb: 'mcp', target: `${m[0]} · ${m[1]}`, isPath: false } : undefined
    }
  }
}

/** The runner a command starts, in words (`vitest`, `bun test`, `pytest`). */
export function runnerOf(command: string): string | undefined {
  const m = TEST_CMD.exec(command)

  if (m === null) return undefined

  return (m[1] ?? m[0]).replace(/\s+/g, ' ').replace(/ run /, ' ')
}

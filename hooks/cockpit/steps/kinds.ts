// A step's kind word, subject and fix key (spec E.12), read off the call's tool and input.
import { describe, mcpName, TEST_CMD } from '../../shared/calls/describe'
import { commitSubject, subjectCommand } from './failures'
import { relPath } from '../../shared/url'

export const KIND_W = 9 // the kind word's 8 cells and a space

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const rec = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim().length > 0 ? v : undefined)
export const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)
export const firstLine = (t: string): string =>
  t
    .split('\n')
    .find(l => l.trim().length > 0)
    ?.trim() ?? ''
export const isShell = (tool: string): tool is 'Bash' | 'PowerShell' => tool === 'Bash' || tool === 'PowerShell'
export const command = (input: unknown): string => firstLine(str(rec(input)['command']) ?? '')

/**
 * Calls that draw no `[ STEPS ]` row: the to-do tools (`[ TODO ]` shows what they do) and the engine's own plumbing
 * (loading deferred tools, waiting for MCP servers, reading the task list back), and a subagent's report call
 * (`SubagentHandback`: its report, not its work).
 */
export const UNLISTED: ReadonlySet<string> = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'ToolSearch',
  'WaitForMcpServers',
  'SubagentHandback'
])

/** The E.12 kind word for a call. */
export function kindOf(tool: string, input: unknown): string {
  if (isShell(tool)) return TEST_CMD.test(command(input)) ? 'test' : 'shell'

  const mcp = mcpName(tool)

  if (mcp !== undefined) return /playwright|browser/i.test(mcp[0]) || mcp[1].startsWith('browser_') ? 'browser' : 'mcp'

  switch (tool) {
    case 'Glob':
    case 'Grep':
    case 'LSP':
      return 'search'
    case 'WebSearch':
      return 'web'
    case 'WebFetch':
      return 'fetch'
    case 'NotebookEdit':
      return 'notebook'
    case 'Agent':
    case 'Task':
      return 'agent'
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TodoWrite':
      return 'todo'
    default:
      return describe(tool, input)?.verb ?? tool.toLowerCase().slice(0, KIND_W - 1)
  }
}

/** The E.12 subject for a call. */
export function subjectOf(tool: string, input: unknown, cwd: string | undefined): string {
  const i = rec(input)

  // The command only (13.4): its `cd <dir> &&` prefix is the drawer's `in <dir>`; of a joined command, the statement
  // its failure key comes from, without the redirections and formatting pipes that only shape its output.
  if (isShell(tool)) {
    const whole = typeof i['command'] === 'string' ? i['command'] : command(input)

    return commitSubject(whole) ?? subjectCommand(command(input), tool === 'PowerShell' ? 'pwsh' : 'bash', kindOf(tool, input) === 'test', cwd)
  }

  switch (tool) {
    case 'Read': {
      const path = relPath(str(i['file_path']) ?? '', cwd)
      const from = int(i['offset'])
      const count = int(i['limit'])

      return from === undefined ? path : count === undefined ? `${path}:${from}` : `${path}:${from}-${from + count - 1}`
    }
    case 'WebSearch':
      return `"${str(i['query']) ?? ''}"`
    case 'WebFetch': {
      const url = str(i['url']) ?? ''

      try {
        const u = new URL(url)

        return `${u.host}${u.pathname.replace(/\/$/, '')}`
      } catch {
        return url
      }
    }
    case 'AskUserQuestion':
      return str(rec(Array.isArray(i['questions']) ? i['questions'][0] : undefined)['header']) ?? describe(tool, input)?.target ?? ''
    default: {
      const mcp = mcpName(tool)

      if (mcp !== undefined && kindOf(tool, input) === 'browser') {
        return [mcp[1].replace(/^browser_/, ''), str(i['element']) ?? str(i['url']) ?? ''].filter(x => x.length > 0).join(' ')
      }

      return describe(tool, input, cwd)?.target ?? ''
    }
  }
}

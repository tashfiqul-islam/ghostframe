import type { Part } from '../shared/parts'
import { clip, pad, vw } from '../shared/text'
import { C } from '../shared/tokens'
import { frameLines } from './frame'

// ─── States and notices (DESIGN.md §5.10 under §0.1) ─────────────────────────
// Pure line builders: every framed line is exactly `width` cells, so no row can
// wrap and no edge can drift. Anything we can't read → undefined, and the caller
// hands the site back to the engine.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Record<string, unknown> | undefined => (isRecord(v) ? v : undefined)

// ─── Plan (ExitPlanMode) ─────────────────────────────────────────────────────

/**
 * An approved plan as one dim line: `plan approved · <path>`, at most `width` cells
 * (the step row above already names the plan). The path keeps its file name. No plan
 * file, or a plan still waiting on a team lead → undefined (the engine's block).
 */
export function planLine(width: number, output: unknown, path: (p: string) => string): Part[] | undefined {
  const o = obj(output)

  if (o === undefined || o['awaitingLeaderApproval'] === true) return undefined

  const file = typeof o['filePath'] === 'string' && o['filePath'].trim().length > 0 ? path(o['filePath']) : undefined

  if (file === undefined) return undefined

  const head = 'plan approved · '

  return [{ t: `${head}${clipPathTail(file, Math.max(4, width - vw(head)))}`, color: C.dim }]
}

/** Keep the end of a path (its file name) when it must be cut: `…/plans/fix-toast.md`. */
function clipPathTail(p: string, n: number): string {
  if (vw(p) <= n) return p

  const parts = p.split('/')
  let tail = parts[parts.length - 1] ?? p

  for (let i = parts.length - 2; i >= 0; i--) {
    const next = `${parts[i]}/${tail}`

    if (vw(`…/${next}`) > n) break
    tail = next
  }

  return vw(`…/${tail}`) <= n ? `…/${tail}` : clip(tail, n)
}

// ─── Tasks (TodoWrite) ───────────────────────────────────────────────────────
type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

export function todosOf(output: unknown): Todo[] | undefined {
  const list = obj(output)?.['newTodos']

  if (!Array.isArray(list) || list.length === 0) return undefined

  const out: Todo[] = []

  for (const t of list) {
    const o = obj(t)
    const content = o?.['content']
    const status = o?.['status']

    if (typeof content !== 'string' || (status !== 'pending' && status !== 'in_progress' && status !== 'completed')) return undefined
    out.push({ content: content.replace(/\s+/g, ' ').trim(), status })
  }

  return out
}

const LIVE = 'in progress'

export function tasksFrame(width: number, output: unknown): Part[][] | undefined {
  const todos = todosOf(output)

  if (todos === undefined) return undefined

  const inner = width - 4
  const done = todos.filter(t => t.status === 'completed').length
  const rows: Part[][] = todos.map(t => {
    if (t.status === 'completed') {
      return [
        { t: '[x]  ', color: C.ok },
        { t: t.content, color: C.text }
      ]
    }

    if (t.status === 'in_progress') {
      const room = Math.max(4, inner - 5 - vw(LIVE) - 2)
      const text = clip(t.content, room)

      return [
        { t: '[>]  ', color: C.accent },
        { t: pad(text, room), color: C.textBright },
        { t: `  ${LIVE}`, color: C.muted }
      ]
    }

    return [
      { t: '[ ]  ', color: C.muted },
      { t: t.content, color: C.textBright }
    ]
  })

  const pct = Math.round((done / todos.length) * 100)
  const label = pad(`${pct}%`, 4, 'right')
  const rail = Math.max(4, inner - vw(label) - 3)
  const fill = Math.round((rail * done) / todos.length)

  return frameLines(width, 'TASKS', { t: `${done} / ${todos.length}`, color: C.muted }, [
    ...rows,
    [],
    [
      { t: '━'.repeat(fill), color: C.accent },
      { t: '─'.repeat(rail - fill), color: C.hairline },
      { t: `   ${label}`, color: C.muted }
    ]
  ])
}

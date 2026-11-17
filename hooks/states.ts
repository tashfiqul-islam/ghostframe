import { C, G, clip, pad, vw } from './grid'

// ─── States and notices (DESIGN.md §5.10 under §0.1) ─────────────────────────
// Pure line builders: every framed line is exactly `width` cells, so no row can
// wrap and no edge can drift. Anything we can't read → undefined, and the caller
// hands the site back to the engine.

/** One coloured piece of a framed line. */
export type Part = { t: string; color: string; bold?: boolean; href?: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Record<string, unknown> | undefined => (isRecord(v) ? v : undefined)

/** Clip `parts` to `n` cells (the cut part ends in `…`), then pad with spaces to exactly `n`. */
export function fitParts(parts: readonly Part[], n: number): Part[] {
  const out: Part[] = []
  let used = 0

  for (const p of parts) {
    const room = n - used

    if (room <= 0) break

    const w = vw(p.t)

    if (w <= room) {
      out.push(p)
      used += w
    } else {
      const t = clip(p.t, room)
      out.push({ ...p, t })
      used += vw(t)
      break
    }
  }

  if (used < n) out.push({ t: ' '.repeat(n - used), color: C.text })

  return out
}

export const partsWidth = (parts: readonly Part[]) => parts.reduce((w, p) => w + vw(p.t), 0)

/**
 * A whole frame, `width` cells on every line:
 * `+┄┄ [ TITLE ] ┄┄┄…┄┄ meta +`, then `┆ row ┆` lines, then `+┄┄┄…┄┄┄+`.
 */
export function frameLines(width: number, title: string, meta: Part | undefined, rows: readonly Part[][]): Part[][] {
  return [frameTop(width, title, meta), ...rows.map(r => frameRow(width, r)), frameBottom(width)]
}

/** One body line: `┆ parts… ┆`, the parts clipped and padded to the inner width. */
export function frameRow(width: number, parts: readonly Part[]): Part[] {
  return [{ t: `${G.vEdge} `, color: C.hairline }, ...fitParts(parts, width - 4), { t: ` ${G.vEdge}`, color: C.hairline }]
}

/** `+┄┄┄…┄┄┄+`, or `+┄┄┄…┄┄ meta +` when a meta fits. */
export function frameBottom(width: number, meta?: Part): Part[] {
  const fill = width - 4 - vw(meta?.t ?? '')

  if (meta === undefined || meta.t.length === 0 || fill < 2) {
    return [
      { t: G.cross, color: C.ruleStrong },
      { t: G.hEdge.repeat(width - 2), color: C.hairline },
      { t: G.cross, color: C.ruleStrong }
    ]
  }

  return [
    { t: G.cross, color: C.ruleStrong },
    { t: `${G.hEdge.repeat(fill)} `, color: C.hairline },
    meta,
    { t: ' ', color: C.hairline },
    { t: G.cross, color: C.ruleStrong }
  ]
}

// ─── Frame labels: one style for every `[ TITLE ]` ───────────────────────────
// Accent title, normal weight, dim brackets. Every frame label is drawn from here
// (frameTop below, and the diff card's own top edge in register.tsx).
export const LABEL = { text: C.accent, bracket: C.dim } as const

/** `[ TITLE ]` as parts; `inner` (counts beside a diff card's path) goes before the `]`. */
export function frameLabel(title: string, inner: readonly Part[] = []): Part[] {
  return [{ t: '[ ', color: LABEL.bracket }, { t: title, color: LABEL.text }, ...inner, { t: ' ]', color: LABEL.bracket }]
}

/** `+┄┄ [ TITLE ] ┄┄┄…┄┄ meta +`, exactly `width` cells. */
export function frameTop(width: number, title: string, meta: Part | undefined): Part[] {
  // `+┄┄ [ ` (6) + title + ` ] ` (3) + fill + ` ` + meta + ` +` (3 with meta's space)
  const layout = (m: string) => {
    const fixed = 12 + vw(m)
    const t = clip(title, width - fixed - 2)

    return { m, t, fill: width - fixed - vw(t) }
  }
  // Too narrow for the meta beside a readable title → the title alone.
  const first = layout(meta?.t ?? '')
  const { m, t, fill } = first.fill >= 2 && vw(first.t) >= Math.min(4, vw(title)) ? first : layout('')

  return [
    { t: G.cross, color: C.ruleStrong },
    { t: `${G.hEdge.repeat(2)} `, color: C.hairline },
    ...frameLabel(t),
    { t: ` ${G.hEdge.repeat(fill)} `, color: C.hairline },
    { t: m, color: meta?.color ?? C.muted },
    { t: ' ', color: C.hairline },
    { t: G.cross, color: C.ruleStrong }
  ]
}

const unmark = (s: string) => s.replace(/\*\*|__|`/g, '').trim()

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

// ─── Notices (single lines, never framed) ────────────────────────────────────

/** A slash command's one-line output as a notice: `/  /effort high · applies from next turn`. */
export function commandNotice(command: string, args: string, text: string, width: number): Part[] | undefined {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length !== 1 || command.length === 0) return undefined

  const body = unmark(lines[0] ?? '')
  const parts: Part[] =
    command === 'compact'
      ? [
          { t: '↻  ', color: C.dim },
          { t: 'context compacted', color: C.muted },
          { t: ` · ${body}`, color: C.dim }
        ]
      : [
          { t: '/  ', color: C.dim },
          // Engine lines use muted and dim only (§0.2): a notice never competes with prose.
          { t: `/${command}${args.trim().length > 0 ? ` ${args.trim()}` : ''}`, color: C.muted },
          { t: ` · ${body}`, color: C.dim }
        ]

  // A notice is one line: as long as it needs, clipped at the measure.
  return partsWidth(parts) <= width ? parts : fitParts(parts, width)
}

// The pane's other views (spec 8.5 to 8.11, 8.13, 9.4): Files and the full diff, Sources, Todo, Agents and an agent in
// view, every step, the pinned head, the interrupted line and the inline inspector. Pure: cockpit/pane.tsx draws them.
import { dim, kindCell, sp, TONE } from '../../shared/look/bits'
import type { Tone } from '../../shared/look/bits'
import type { Part } from '../../shared/parts'
import { count, duration } from '../../shared/look/format'
import { GLYPH, superscript } from '../../shared/look/glyphs'
import { TOKEN } from '../../shared/look/palette'
import { cutPath, cutTitle, splitPath } from '../../shared/look/paths'
import { widthOf } from '../../shared/look/width'
import { drawerRows, fit, keyParts, paneCard, pill, selected, spread } from './pane'

/** A kind word in its 6 cells, a space after one that fills them (`search`, `failed`). */

/** A summary card at the top of a view (8.5 to 8.9): its first row with a fact at the right, then a dim line. */
function summary(left: readonly Part[], right: readonly Part[], line: readonly Part[], width: number): Part[][] {
  return paneCard([spread(left, right, width - 3), [...line]], width)
}

/** A path drawn folder dim, file bright (5.4), cut from the middle to `cells`. */
function pathParts(path: string, cells: number): Part[] {
  const { folder, file } = splitPath(cutPath(path, cells))

  return [...(folder.length > 0 ? [dim(folder)] : []), { t: file, color: TOKEN.textBright }]
}

// ─── 8.5 Files, 8.6 the full diff ────────────────────────────────────────────

/** One file the turn changed (8.5). */
export type FileRow = { path: string; adds: number; dels: number; isAgent: boolean; hunk?: readonly string[] | undefined; isSelected?: boolean }

/** A file's 5-cell change bar (8.5): `■` in ok and err in proportion, against the turn's largest change; the rest dim. */
export function changeBar(adds: number, dels: number, largest: number): Part[] {
  const total = adds + dels
  const lit = total === 0 ? 0 : Math.max(1, Math.round((5 * total) / Math.max(1, largest)))
  const ok = total === 0 ? 0 : Math.round((lit * adds) / total)

  return [
    { t: GLYPH.change.repeat(ok), color: TOKEN.ok },
    { t: GLYPH.change.repeat(lit - ok), color: TOKEN.err },
    { t: GLYPH.change.repeat(5 - lit), color: TOKEN.dim }
  ].filter(p => p.t.length > 0)
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/** A hunk's rows in place under its file (8.5): `@@ 14,3 @@` and `c copy`, then one gutter, the sign, the line. */
function hunkRows(lines: readonly string[], width: number): Part[][] {
  const head = HUNK.exec(lines[0] ?? '')
  let oldNo = Number(head?.[1] ?? 1)
  let newNo = Number(head?.[3] ?? 1)
  const body = lines.slice(head === null ? 0 : 1).map(l => {
    const sign = l[0] ?? ' '
    const n = sign === '-' ? oldNo : newNo

    if (sign !== '+') oldNo++
    if (sign !== '-') newNo++

    return [
      { t: String(n).padStart(3), color: TOKEN.dim },
      sp(2),
      { t: sign === ' ' ? ' ' : sign, color: sign === '+' ? TOKEN.ok : sign === '-' ? TOKEN.err : TOKEN.dim },
      sp(1),
      { t: l.slice(1), color: TOKEN.text }
    ]
  })
  const title = head === null ? [] : [{ t: `@@ ${head[3] ?? ''},${head[4] ?? '1'} @@`, color: TOKEN.machine }]

  return drawerRows({}, width)
    .slice(0, 1)
    .concat([spreadIn(title, keyParts([['c', 'copy']]), width), ...body.map(r => inDrawer(r, width))], drawerRows({}, width).slice(-1))
}

/** A row inside an in-place card (8.4, 8.5): from the fifth cell, content from the seventh, on `paneCard`. */
function inDrawer(parts: readonly Part[], width: number): Part[] {
  return [sp(4), ...fit([sp(2), ...parts], width - 6).map(p => ({ ...p, bg: p.bg ?? TOKEN.paneCard }))]
}

/** An in-place card's row with a fact held 4 cells before its edge. */
function spreadIn(left: readonly Part[], right: readonly Part[], width: number): Part[] {
  return [sp(4), ...[sp(2), ...spread(left, [...right, sp(4)], width - 8)].map(p => ({ ...p, bg: p.bg ?? TOKEN.paneCard }))]
}

/**
 * The Files tab (8.5): a summary card (the count, the total, the baseline), one row per file in first-touched order
 * (`◇` at the left for a file an agent changed), the selected file's first hunk open in place, and the `◇` legend.
 * @param files the files
 * @param turnNo the turn
 * @param width the pane's columns
 * @returns the rows
 */
export function filesView(files: readonly FileRow[], turnNo: number, width: number): Part[][] {
  const adds = files.reduce((n, f) => n + f.adds, 0)
  const dels = files.reduce((n, f) => n + f.dels, 0)
  const largest = Math.max(1, ...files.map(f => f.adds + f.dels))
  const rows: Part[][] = [
    ...summary(
      [{ t: count(files.length, ['file changed', 'files changed']), color: TOKEN.text }],
      [{ t: `+${adds}`, color: TOKEN.ok }, sp(2), { t: `${GLYPH.minus}${dels}`, color: TOKEN.err }],
      [dim(`turn ${turnNo} · against the start of the turn`)],
      width
    ),
    []
  ]

  for (const f of files) {
    const counts: Part[] = [
      { t: f.adds > 0 ? `+${f.adds}`.padStart(4) : '    ', color: TOKEN.ok },
      { t: f.dels > 0 ? `${GLYPH.minus}${f.dels}`.padStart(5) : '     ', color: TOKEN.err },
      sp(2),
      ...changeBar(f.adds, f.dels, largest)
    ]
    const row = spread(
      [sp(2), f.isAgent ? { t: GLYPH.agent, color: TOKEN.agent } : sp(1), sp(1), ...pathParts(f.path, width - 22)],
      [...counts, sp(width - 71)],
      width
    )

    rows.push(f.isSelected === true ? selected(row) : row)
    if (f.isSelected === true && f.hunk !== undefined) rows.push(...hunkRows(f.hunk, width))
  }

  if (files.some(f => f.isAgent)) rows.push([], [sp(2), { t: GLYPH.agent, color: TOKEN.agent }, dim(' changed by an agent')])

  return rows
}

/**
 * The full diff (8.6): the path, `+12 · 2 hunks`, the baseline, then every hunk with its `@@` header in `machine`, two
 * gutters (old, new) and the sign; a line longer than the pane wraps under itself, marked `↩` in the gutter. Nothing
 * is cut.
 * @param path the file
 * @param patch its unified rows
 * @param change the file's own counts over the turn, as the Files tab shows them
 * @param turnNo the turn
 * @param width the pane's columns
 * @returns the rows
 */
export function diffView(path: string, patch: readonly string[], change: { adds: number; dels: number }, turnNo: number, width: number): Part[][] {
  const { adds, dels } = change
  const hunks = patch.filter(l => l.startsWith('@@')).length
  const room = width - 2 - 10
  const counts: Part[] = [
    ...(adds > 0 ? [{ t: `+${adds}`, color: TOKEN.ok }] : []),
    ...(dels > 0 ? [{ t: `${adds > 0 ? ' ' : ''}${GLYPH.minus}${dels}`, color: TOKEN.err }] : []),
    dim(`  ·  ${count(hunks, 'hunk')}`)
  ]
  const rows: Part[][] = [
    spread([sp(2), ...pathParts(path, width - 24)], [...counts, sp(width - 71)], width),
    [sp(2), dim(`turn ${turnNo} · against the start of the turn`)]
  ]
  let oldNo = 0
  let newNo = 0

  for (const l of patch) {
    const m = HUNK.exec(l)

    if (m !== null) {
      oldNo = Number(m[1])
      newNo = Number(m[3])
      rows.push([], [sp(2), { t: `@@ ${m[1] ?? ''},${m[2] ?? '1'} @@`, color: TOKEN.machine }])
      continue
    }

    const sign = l[0] ?? ' '
    const gutter = (sign === '+' ? '' : String(oldNo)).padStart(2) + (sign === '-' ? '' : String(newNo)).padStart(4)
    const color = sign === '+' ? TOKEN.ok : sign === '-' ? TOKEN.err : TOKEN.text
    const chunks = wrapHard(l.slice(1), room)

    chunks.forEach((c, i) => {
      rows.push([
        sp(2),
        { t: i === 0 ? gutter : `${' '.repeat(7)}${GLYPH.wrapped}`.slice(0, 8), color: TOKEN.dim },
        { t: i === 0 ? ` ${sign === ' ' ? ' ' : sign === '-' ? GLYPH.minus : '+'} ` : '  ', color },
        { t: c, color }
      ])
    })

    if (sign !== '+') oldNo++
    if (sign !== '-') newNo++
  }

  return rows
}

/** A line broken into `room`-cell pieces, nothing cut. */
function wrapHard(text: string, room: number): string[] {
  const out: string[] = []
  let rest = text

  while (widthOf(rest) > room) {
    const at = rest.lastIndexOf(' ', room)
    const cut = at > room / 2 ? at + 1 : room

    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut)
  }

  return [...out, rest]
}

// ─── 8.7 Sources ─────────────────────────────────────────────────────────────

/** A page the turn read (8.7): its footnote number when cited, its host, title, status and URL. */
export type SourceRow = { n: number | undefined; host: string; title: string; status: string; url: string; isSelected?: boolean }

/**
 * The Sources tab (8.7): pages read, cited, failed; cited pages first with the answer's numbers, uncited with `·`;
 * the host in `machine`, the title, the status at the right (a failure in `err`, bold); the URL dim under each row
 * unless `u` hid them.
 * @param pages the pages, cited first in answer order
 * @param showUrls whether the URLs show
 * @param width the pane's columns
 * @returns the rows
 */
export function sourcesView(pages: readonly SourceRow[], showUrls: boolean, width: number): Part[][] {
  const failed = pages.filter(p => /^[45]\d\d$/.test(p.status)).length
  const cited = pages.filter(p => p.n !== undefined).length
  const rows: Part[][] = [
    ...summary(
      [{ t: count(pages.length, ['page read', 'pages read']), color: TOKEN.text }, sp(3), { t: `${cited} cited`, color: TOKEN.text }],
      failed > 0 ? [{ t: `${failed} failed`, color: TOKEN.err }] : [],
      [dim('cited pages first, in answer order')],
      width
    ),
    []
  ]

  for (const p of pages) {
    const isFailed = /^[45]\d\d$/.test(p.status)
    const mark: Part = p.n === undefined ? dim(GLYPH.uncited) : { t: superscript(p.n), color: TOKEN.machine }
    const row = spread(
      [sp(2), mark, sp(1), { t: p.host, color: TOKEN.machine }, sp(3), { t: p.title, color: TOKEN.text }],
      [isFailed ? { t: p.status, color: TOKEN.err, bold: true } : dim(p.status), sp(width - 71)],
      width
    )

    rows.push(p.isSelected === true ? selected(row) : row)
    if (showUrls) rows.push([sp(6), dim(cutTitle(p.url, width - 7))])
  }

  return rows
}

// ─── 8.8 Todo ────────────────────────────────────────────────────────────────

/** One to-do item (8.8). */
export type TodoRow = { text: string; state: 'done' | 'current' | 'open' }

/**
 * The Todo tab (8.8): `n of m done` with the turn, a progress bar (ok for done, hairline for the rest), then the items
 * in the order Claude wrote them: `✓` done (dim text), `▸` current (accent, `textBright`), `○` open.
 * @param items the items
 * @param turnNo the turn
 * @param width the pane's columns
 * @returns the rows
 */
export function todoView(items: readonly TodoRow[], turnNo: number, width: number): Part[][] {
  const done = items.filter(i => i.state === 'done').length
  const cells = width - 7
  const lit = items.length === 0 ? 0 : Math.round((cells * done) / items.length)
  const glyph: Record<TodoRow['state'], Part> = {
    done: { t: GLYPH.ok, color: TOKEN.ok },
    current: { t: GLYPH.current, color: TOKEN.accent },
    open: { t: GLYPH.open, color: TOKEN.dim }
  }
  const textColor: Record<TodoRow['state'], string> = { done: TOKEN.dim, current: TOKEN.textBright, open: TOKEN.text }

  return [
    ...paneCard(
      [
        spread([{ t: `${done} of ${items.length} done`, color: TOKEN.text }], [dim(`turn ${turnNo}`)], width - 3),
        [
          { t: GLYPH.bar.repeat(lit), color: TOKEN.ok },
          { t: GLYPH.bar.repeat(cells - lit), color: TOKEN.hairline }
        ]
      ],
      width
    ),
    [],
    ...items.map(i => [sp(2), glyph[i.state], sp(2), { t: cutTitle(i.text, width - 6), color: textColor[i.state] }])
  ]
}

// ─── 8.9 Agents, 8.10 an agent in view ───────────────────────────────────────

/** One agent (8.9): its name, open failures, steps, time, and its current or last step with its state. */
export type AgentRow = {
  name: string
  isFailed: boolean
  /** Still running: counted in the head even before its first step, when no step row shows it. */
  isRunning?: boolean
  open: number
  steps: number
  ms: number
  step?: { glyph: 'current' | 'failed' | 'ok'; kind: string; subject: string; state: string; tone: Tone } | undefined
  isSelected?: boolean
}

/**
 * The Agents tab (8.9): how many, running, failed; when they launched; one row per agent (`◇`, or `×` when it ended
 * failing; its open failures `×n` in err, its steps and time), its current or last step under it, a blank row apart.
 * @param agents the agents, in launch order
 * @param launchedAt the launch's clock, '' when they did not launch together
 * @param width the pane's columns
 * @returns the rows
 */
export function agentsView(agents: readonly AgentRow[], launchedAt: string, width: number): Part[][] {
  const running = agents.filter(a => a.isRunning === true || a.step?.glyph === 'current').length
  const failed = agents.filter(a => a.isFailed).length
  const rows: Part[][] = [
    ...summary(
      [{ t: count(agents.length, 'agent'), color: TOKEN.text }, ...(running > 0 ? [sp(3), { t: `${running} running`, color: TOKEN.text }] : [])],
      failed > 0 ? [{ t: `${failed} failed`, color: TOKEN.err }] : [],
      [dim(launchedAt.length > 0 ? `launched together at ${launchedAt}` : 'launched one by one')],
      width
    )
  ]

  for (const a of agents) {
    const right: Part[] = [
      ...(a.open > 0 ? [{ t: `${GLYPH.fail}${a.open}`, color: TOKEN.err }, sp(2)] : []),
      dim(count(a.steps, 'step').padStart(7)),
      { t: duration(a.ms).padStart(9), color: TOKEN.machineDim },
      sp(width - 71)
    ]
    const head = spread(
      [sp(2), a.isFailed ? { t: GLYPH.fail, color: TOKEN.err } : { t: GLYPH.agent, color: TOKEN.agent }, sp(1), { t: a.name, color: TOKEN.text }],
      right,
      width
    )
    const s = a.step
    const sub =
      s === undefined
        ? []
        : [
            spread(
              [
                sp(6),
                s.glyph === 'current'
                  ? { t: GLYPH.current, color: TOKEN.accent }
                  : s.glyph === 'failed'
                    ? { t: GLYPH.fail, color: TOKEN.err }
                    : { t: GLYPH.ok, color: TOKEN.ok },
                sp(1),
                { t: kindCell(s.kind), color: TOKEN.muted },
                { t: s.subject, color: TOKEN.text }
              ],
              [{ t: s.state, color: TONE[s.tone] }, sp(width - 71)],
              width
            )
          ]

    rows.push([], a.isSelected === true ? selected(head) : head, ...sub)
  }

  return rows
}

/**
 * The head card while an agent is in view (8.10): the `◇ AGENT` pill and its name with its state and time; that the
 * conversation on the left is its; its steps and files, and the turn it came from.
 * @param name the agent's name
 * @param state `running · 1m 10s`, `done · 2m 02s`
 * @param steps its steps
 * @param files the files it changed
 * @param turnNo the turn that launched it
 * @param width the pane's columns
 * @returns the rows, edges included
 */
export function agentHead(name: string, state: string, steps: number, files: number, turnNo: number, width: number): Part[][] {
  return paneCard(
    [
      spread([...pill('agent'), sp(2), { t: name, color: TOKEN.textBright }], [{ t: state, color: TOKEN.accent }], width - 3),
      [{ t: 'The conversation on the left is this agent’s.', color: TOKEN.textBright }],
      spread(
        [
          { t: String(steps), color: TOKEN.text },
          dim(steps === 1 ? ' step' : ' steps'),
          sp(4),
          { t: String(files), color: TOKEN.text },
          dim(files === 1 ? ' file' : ' files')
        ],
        [dim(`from turn ${turnNo}`)],
        width - 3
      )
    ],
    width
  )
}

// ─── 8.11 Every step ─────────────────────────────────────────────────────────

/** One step on its own row (8.11). */
export type StepRow = {
  glyph: 'ok' | 'failed' | 'agent' | 'shipped' | 'blocked' | 'current' | 'waiting'
  kind: string
  subject: string
  result: string
  tone: Tone
  ms: number | undefined
  output?: { head: string; lines: readonly string[]; trimmed: boolean } | undefined
  isSelected?: boolean
}

const STEP_GLYPH: Record<StepRow['glyph'], Part> = {
  ok: { t: GLYPH.ok, color: TOKEN.ok },
  failed: { t: GLYPH.fail, color: TOKEN.err },
  agent: { t: GLYPH.agent, color: TOKEN.agent },
  shipped: { t: GLYPH.shipped, color: TOKEN.accent },
  blocked: { t: GLYPH.blocked, color: TOKEN.warn },
  current: { t: GLYPH.current, color: TOKEN.accent },
  waiting: { t: GLYPH.needs, color: TOKEN.warn }
}

/** A step row (8.11): glyph, kind (7 cells), subject, the result ending at the 63rd cell, the step's own time. */
export function stepRow(s: StepRow, width: number): Part[] {
  const time = s.ms === undefined ? '' : duration(s.ms)
  const subjectRoom = width - 11 - 8 - 2 - widthOf(s.result)
  const subject =
    s.kind === 'read' || s.kind === 'edit' || s.kind === 'write'
      ? pathParts(s.subject, subjectRoom)
      : [{ t: cutTitle(s.subject, subjectRoom), color: TOKEN.text }]

  return spread(
    [sp(2), STEP_GLYPH[s.glyph], sp(1), { t: s.kind.padEnd(7), color: TOKEN.muted }, ...subject],
    [{ t: s.result, color: TONE[s.tone] }, { t: time.padStart(8), color: TOKEN.machineDim }, sp(width - 71)],
    width
  )
}

/**
 * Every step (8.11): `ALL STEPS · TURN n` with its counts, one row per step, no folding; the selected step's output in
 * place (its exit and time, the decisive lines, the totals; a trimmed one says so).
 * @param turnNo the turn
 * @param total how many steps it had
 * @param failed how many failed
 * @param steps the rows shown
 * @param above how many more there are above (the view scrolls)
 * @param width the pane's columns
 * @returns the rows
 */
export function allStepsView(turnNo: number, total: number, failed: number, steps: readonly StepRow[], above: number, width: number): Part[][] {
  const rows: Part[][] = [
    spread(
      [sp(2), { t: `ALL STEPS · TURN ${turnNo}`, color: TOKEN.muted, bold: true }],
      [dim(count(total, 'step')), ...(failed > 0 ? [dim(` · ${failed} failed`)] : []), sp(width - 71)],
      width
    ),
    []
  ]

  for (const s of steps) {
    const row = stepRow(s, width)

    rows.push(s.isSelected === true ? selected(row) : row)

    if (s.isSelected === true && s.output !== undefined) {
      const o = s.output

      rows.push(drawerRows({}, width)[0] ?? [], spreadIn([dim(o.head)], keyParts([['c', 'copy']]), width), inDrawer([], width))
      for (const l of o.lines) rows.push(inDrawer([{ t: l, color: TOKEN.text }], width))
      if (o.trimmed) rows.push(inDrawer([dim('trimmed to fit the history budget')], width))
      rows.push(drawerRows({}, width).at(-1) ?? [])
    }
  }

  if (above > 0) rows.push([sp(2), dim(`${GLYPH.ellipsis} ${above} more above · ↑ scroll`)])

  return rows
}

// ─── 9.4 Pins, and an interrupted turn ───────────────────────────────────────

/**
 * The head while a past turn is pinned (8.2, 9.4, screen 09): the live turn on one line on top (its state's pill: LIVE while it
 * runs, else how it ended), then `PINNED  TURN n`
 * with its range and summary.
 * @param live the live turn's number, what it does and its time
 * @param pinned the pinned turn's number, range and summary
 * @param width the pane's columns
 * @returns the rows, edges included
 */
export function pinnedHead(
  live: { turnNo: number; said: string; time: string; state?: 'live' | 'done' | 'failed' },
  pinned: { turnNo: number; range: string; summary: string },
  width: number
): Part[][] {
  const state = live.state ?? 'live'

  return paneCard(
    [
      spread(
        [...pill(state), sp(2), { t: 'TURN', color: TOKEN.muted }, { t: ` ${live.turnNo}`, color: TOKEN.textBright, bold: true }, sp(3), dim(live.said)],
        [{ t: live.time, color: state === 'live' ? TOKEN.accent : TOKEN.machineDim }],
        width - 3
      ),
      [],
      spread(
        [
          { t: 'PINNED', color: TOKEN.muted, bold: true },
          sp(2),
          { t: 'TURN', color: TOKEN.muted },
          { t: ` ${pinned.turnNo}`, color: TOKEN.textBright, bold: true }
        ],
        [{ t: pinned.range, color: TOKEN.machine }],
        width - 3
      ),
      [{ t: pinned.summary, color: TOKEN.textBright }]
    ],
    width
  )
}

/**
 * An interrupted turn before the one shown (8.2, screen 06): `TURN 11   ◼ INTERRUPTED after 3 steps · …   11:02:05`.
 * @param turnNo the interrupted turn
 * @param said what it got done
 * @param clock when it started
 * @param width the pane's columns
 * @returns the row
 */
export function interruptedRow(turnNo: number, said: string, clock: string, width: number): Part[] {
  return spread(
    [
      sp(2),
      { t: 'TURN', color: TOKEN.muted },
      { t: ` ${turnNo}`, color: TOKEN.textBright },
      sp(3),
      { t: `${GLYPH.interrupted} INTERRUPTED`, color: TOKEN.muted, bold: true },
      dim(` ${said}`)
    ],
    [{ t: clock, color: TOKEN.machine }, sp(width - 71)],
    width
  )
}

// ─── 8.13 The inline inspector ───────────────────────────────────────────────

/** The inline inspector's keys (8.13). */
export const INSPECTOR_KEYS: readonly (readonly [string, string])[] = [
  ['s', 'all'],
  ['c', 'copy'],
  ['p', 'previous'],
  ['n', 'next'],
  ['esc', 'close']
]

/**
 * The inline inspector (8.13): one card above the prompt, `STEPS · TURN n` with its counts, the step rows, the keys.
 * Never taller than the left can spare: the last rows are kept, with the head and the keys.
 * @param turnNo the turn
 * @param total its steps
 * @param failed how many failed
 * @param steps the rows
 * @param rows the rows the card may take
 * @param width the terminal's columns
 * @param keys the keys the card offers, as (key, action)
 * @returns the rows
 */
export function inspectorRows(
  turnNo: number,
  total: number,
  failed: number,
  steps: readonly StepRow[],
  rows: number,
  width: number,
  keys: readonly (readonly [string, string])[] = INSPECTOR_KEYS
): Part[][] {
  const inner = width - 4
  const room = Math.max(0, rows - 6)
  const shown = steps.slice(Math.max(0, steps.length - room))
  const on = (parts: readonly Part[]) => [sp(2), ...fit([sp(1), ...parts], inner).map(p => ({ ...p, bg: p.bg ?? TOKEN.paneCard }))]
  const stepLine = (s: StepRow) => {
    const time = s.ms === undefined ? '' : duration(s.ms)

    return on(
      spread(
        [STEP_GLYPH[s.glyph], sp(1), { t: s.kind.padEnd(8), color: TOKEN.muted }, { t: cutTitle(s.subject, inner - 32), color: TOKEN.text }],
        [{ t: s.result, color: TONE[s.tone] }, { t: time.padStart(7), color: TOKEN.machineDim }, sp(2)],
        inner - 1
      )
    )
  }

  return [
    [sp(2), { t: GLYPH.edgeTop.repeat(inner), color: TOKEN.paneCard }],
    on(
      spread(
        [{ t: `STEPS · TURN ${turnNo}`, color: TOKEN.muted, bold: true }],
        [dim(`${count(total, 'step')}${failed > 0 ? ` · ${failed} failed` : ''}`), sp(1)],
        inner - 1
      )
    ),
    on([]),
    ...shown.map(stepLine),
    on([]),
    on(keyParts(keys, 3)),
    [sp(2), { t: GLYPH.edgeBottom.repeat(inner), color: TOKEN.paneCard }]
  ]
}

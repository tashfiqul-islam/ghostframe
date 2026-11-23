// The left's rows Cockpit owns (spec 7.8, 7.11 to 7.13, 7.15): the failure card, the live line, the receipt, the
// worked node, slash command rows and the step rows of `/steps n all` and ctrl+o. Pure: cockpit/left.tsx draws them.
import { dim, TONE } from '../../shared/look/bits'
import type { Part } from '../../shared/parts'
import { PAD, bottomEdge, cardRow, topEdge } from '../../shared/look/card'
import { count, duration } from '../../shared/look/format'
import type { StateWord } from '../../shared/look/format'
import { GLYPH, SPINNER } from '../../shared/look/glyphs'
import { TINT, TOKEN } from '../../shared/look/palette'
import { cutCommand, cutPath, cutTitle, cutUrl, splitPath } from '../../shared/look/paths'
import { NO_LABEL, NO_SPINE, SPINE, spineRow } from '../../shared/look/spine'
import { trace } from '../../shared/look/trace'
import { widthOf } from '../../shared/look/width'
import { moreParts } from './events'

/** A receipt's or worked node's facts (7.12, 7.13), on the step log's one clock (13.9). */
export type TurnCounts = {
  state: 'done' | 'failed' | 'waiting'
  durationMs: number
  steps: number
  fixed: number
  open: number
  blocked: number
  files: number
  sources: number
  cited: number
  agents: number
  /** Steps by kind word, for the kinds a receipt names (`browser`, `mcp`) and the worked node's breakdown. */
  kinds: Readonly<Record<string, number>>
  /** What left the machine, as the receipt ends: `a1f3c2e`, `PR #23 merged`, `GHO-142`; '' for nothing. */
  shipped: string
  /** The trace's levels, 0 to 6, one per bucket. */
  levels: readonly number[]
  /** Background agents still running when the turn ended. */
  waiting?: number
}

/** A receipt's counts, each with the rank it drops at when the row is too narrow (v7 E.32: higher goes first). */
function receiptFields(c: TurnCounts): [string, number][] {
  const named = ['browser', 'mcp'].flatMap(k => ((c.kinds[k] ?? 0) > 0 ? [[`${c.kinds[k] ?? 0} ${k}`, 3] as [string, number]] : []))

  return [
    [c.steps > 0 ? count(c.steps, 'step') : 'no steps', 1],
    ...(c.fixed > 0 ? [[`${c.fixed} fixed`, 0] as [string, number]] : []),
    ...(c.open > 0 ? [[`${c.open} still failing`, 0] as [string, number]] : []),
    ...(c.files > 0 ? [[count(c.files, 'file'), 3] as [string, number]] : []),
    ...(c.blocked > 0 ? [[`${c.blocked} blocked`, 0] as [string, number]] : []),
    ...(c.sources > 0
      ? [[c.cited > 0 && c.cited < c.sources ? `${count(c.sources, 'source')}, ${c.cited} cited` : count(c.sources, 'source'), 4] as [string, number]]
      : []),
    ...(c.agents > 0 ? [[count(c.agents, 'agent'), 2] as [string, number]] : []),
    ...named,
    ...(c.shipped.length > 0 ? [[`${GLYPH.shipped} ${c.shipped}`, 5] as [string, number]] : [])
  ]
}

/** A node row: label, glyph, word, trace, counts; the counts drop by rank until the row fits. */
function nodeRow(label: string, glyph: Part, word: Part, levels: readonly number[], fields: [string, number][], width: number): Part[] {
  const lead = widthOf(word.t) + 3 + levels.length + 3
  let kept = fields

  while (lead + widthOf(kept.map(([t]) => t).join(' · ')) > width && kept.some(([, r]) => r > 0)) {
    const top = Math.max(...kept.map(([, r]) => r))

    kept = kept.filter(([, r]) => r !== top)
  }

  return spineRow({ t: label, color: TOKEN.machineDim }, glyph, [word, dim('   '), ...trace(levels), dim('   '), dim(kept.map(([t]) => t).join(' · '))])
}

/**
 * The receipt (7.12): `2m 44s ✓  DONE   ⣀⣤⣴…   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e`. Narrow, the
 * counts drop in v7 E.32's order; the state word never drops. An interrupted turn has none (correction G).
 * @param c the turn's counts
 * @param width the text column's cells
 * @returns the row
 */
export function receiptRow(c: TurnCounts, width: number): Part[] {
  const state: Record<TurnCounts['state'], [StateWord, Part]> = {
    done: ['DONE', { t: GLYPH.ok, color: TOKEN.ok }],
    failed: ['FAILED', { t: GLYPH.fail, color: TOKEN.err }],
    waiting: ['WAITING', { t: GLYPH.needs, color: TOKEN.warn }]
  }
  const [word, glyph] = state[c.state]
  const color = c.state === 'done' ? TOKEN.ok : c.state === 'failed' ? TOKEN.err : TOKEN.warn
  const fields = receiptFields(c)
  const waiting = c.waiting ?? 0

  return nodeRow(
    duration(c.durationMs),
    glyph,
    { t: word, color, bold: true },
    c.levels,
    waiting > 0 ? [...fields, [`${count(waiting, 'agent')} running`, 0]] : fields,
    width
  )
}

/**
 * The worked node (7.13): `◇  worked   ⣀⣤⣴…   23 steps · 3 agents · 1 fixed`, dim. Its counts: the steps, the agents
 * and the fixes; a turn with neither names its steps by kind instead (screens 16, 31).
 * @param c the turn's (or the stretch's) counts
 * @param width the text column's cells
 * @returns the row
 */
export function workedRow(c: TurnCounts, width: number): Part[] {
  const byKind = Object.entries(c.kinds)
    .filter(([, n]) => n > 0)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, n]): [string, number] => [`${n} ${k}`, 3])
  const fields: [string, number][] = [
    [c.steps > 0 ? count(c.steps, 'step') : 'no steps', 1],
    ...(c.agents > 0 ? [[count(c.agents, 'agent'), 2] as [string, number]] : []),
    ...(c.fixed > 0 ? [[`${c.fixed} fixed`, 0] as [string, number]] : []),
    ...(c.agents === 0 && c.fixed === 0 ? byKind : [])
  ]

  return nodeRow(duration(c.durationMs), { t: GLYPH.agent, color: TOKEN.dim }, { t: 'worked', color: TOKEN.dim }, c.levels, fields, width)
}

/** The live line's facts (7.11). */
export type Live = { elapsedMs: number; frame: number; sentence: string; agents: number; steps: number }

/**
 * The live line (7.11), the last row of a live turn: `┊` above it, then the elapsed time in accent, the spinner,
 * Claude's current working sentence, a `◇` per running agent, the step count.
 * @param live what runs now
 * @param width the text column's cells
 * @returns the two rows
 */
export function liveRows(live: Live, width: number): Part[][] {
  const spin = SPINNER[live.frame % SPINNER.length] ?? SPINNER[0] ?? ''
  const tail: Part[] = [
    ...(live.agents > 0 ? [dim('   '), { t: GLYPH.agent.repeat(live.agents), color: TOKEN.agent }] : []),
    ...(live.steps > 0 ? [dim('   '), dim(count(live.steps, 'step'))] : [])
  ]
  const room = width - tail.reduce((n, p) => n + widthOf(p.t), 0)

  return [
    spineRow(NO_LABEL, { t: GLYPH.folded, color: TOKEN.spine }, []),
    spineRow({ t: duration(live.elapsedMs), color: TOKEN.accent }, { t: spin, color: TOKEN.accent }, [
      { t: cutTitle(live.sentence, Math.max(8, room)), color: TOKEN.text },
      ...tail
    ])
  ]
}

/**
 * A running sub-step under the live line in fallback (screen 31): `├  ▸ shell  bun test hooks/width   running`.
 * @param kind its kind word
 * @param subject what it runs
 * @param state its state word (`running`, `3 of 4`)
 * @param isLast whether it is the last branch
 * @param width the text column's cells
 * @returns the row
 */
export function branchRow(kind: string, subject: string, state: string, isLast: boolean, width: number): Part[] {
  const room = width - 2 - 7 - 3 - widthOf(state)

  return spineRow(NO_LABEL, { t: isLast ? GLYPH.last : GLYPH.branch, color: TOKEN.spine }, [
    { t: `${GLYPH.current} `, color: TOKEN.accent },
    { t: `${kind.padEnd(6)} `, color: TOKEN.muted },
    { t: cutCommand(subject, Math.max(8, room)), color: TOKEN.text },
    dim('   '),
    { t: state, color: TOKEN.accent }
  ])
}

/**
 * A slash command you ran (7.15): its clock, the `/` node in `machine`, the command.
 * @param clock when it ran, as a clock time
 * @param command the command as typed, `/copy code 1`
 * @returns the row
 */
export function slashRow(clock: string, command: string): Part[] {
  return spineRow({ t: clock, color: TOKEN.machine }, { t: GLYPH.slash, color: TOKEN.machine }, [{ t: command, color: TOKEN.machine }])
}

/**
 * A command's one quiet output row (7.15): `✓  Copied code block 1 · 3 lines · yaml`, or `×` for a wrong ask.
 * @param ok whether it did what was asked
 * @param text what it says
 * @returns the row
 */
export function slashOutputRow(ok: boolean, text: string): Part[] {
  return spineRow(NO_LABEL, ok ? { t: GLYPH.ok, color: TOKEN.ok } : { t: GLYPH.fail, color: TOKEN.err }, [{ t: text, color: TOKEN.muted }])
}

/** One step as the left prints it (ctrl+o, `/steps n all`; screens 22, 30). */
export type StepLine = { kind: string; subject: string; result: string; tone: 'dim' | 'ok' | 'err' | 'bright' | 'accent'; ms: number | undefined }

const KIND_CELLS = 8
const TIME_CELLS = 8

/** A step's subject drawn as its kind shows it: a path folder dim and file bright, a URL or a command cut from the middle. */
export function subjectParts(kind: string, subject: string, cells: number): Part[] {
  if (kind === 'read' || kind === 'edit' || kind === 'write') {
    const { folder, file } = splitPath(cutPath(subject, cells))

    return [...(folder.length > 0 ? [dim(folder)] : []), { t: file, color: TOKEN.textBright }]
  }

  return [{ t: kind === 'fetch' ? cutUrl(subject, cells) : cutCommand(subject, cells), color: TOKEN.text }]
}

/**
 * A step row with no spine (screens 22, 30): the kind (8 cells, muted), the subject, the result right-aligned 8 cells
 * before the text column's end (its 78th cell at 86), then the step's own time in those 8 cells.
 * @param s the step
 * @param width the text column's cells
 * @returns the row
 */
export function stepLineRow(s: StepLine, width = 86): Part[] {
  const RESULT_END = width - TIME_CELLS
  const room = RESULT_END - KIND_CELLS - widthOf(s.result) - 2
  const subject = subjectParts(s.kind, s.subject, room)
  const used = KIND_CELLS + subject.reduce((n, p) => n + widthOf(p.t), 0)
  const time = s.ms === undefined ? '' : duration(s.ms)

  return spineRow(NO_LABEL, NO_SPINE, [
    { t: s.kind.padEnd(KIND_CELLS), color: TOKEN.muted },
    ...subject,
    dim(' '.repeat(Math.max(1, RESULT_END - used - widthOf(s.result)))),
    { t: s.result, color: TONE[s.tone] },
    { t: time.padStart(TIME_CELLS), color: TOKEN.machineDim }
  ])
}

/**
 * `/steps n all` (7.15, screen 22): its node, the head `STEPS · TURN n · m steps`, the step rows, and how many more
 * there are, since the rest is in the scrollback.
 * @param clock when it ran
 * @param turnNo the turn
 * @param total its steps
 * @param shown the step rows printed
 * @returns the rows
 */
export function stepsAllRows(clock: string, turnNo: number, total: number, shown: readonly StepLine[]): Part[][] {
  const more = total - shown.length

  return [
    slashRow(clock, `/steps ${turnNo} all`),
    spineRow(NO_LABEL, SPINE, []),
    spineRow(NO_LABEL, SPINE, [{ t: `STEPS · TURN ${turnNo} · ${count(total, 'step')}`, color: TOKEN.muted, bold: true }]),
    ...shown.map(s => stepLineRow(s)),
    ...(more > 0 ? [spineRow(NO_LABEL, SPINE, [dim(`… ${more} more · /steps ${turnNo} all is in your scrollback`)])] : [])
  ]
}

/** One failing test or step the failure card lists (7.8): where it failed and what it says. */
export type CardFailure = { where: string; said: string }

/**
 * The failure card (7.8): an `errCard` card, `× n still failing` with the target at the right, at most 3 failure rows
 * (the third `+ n more · /steps n` when there are more), then one `→ Next:` line when the answer gave one.
 * @param open how many keys still fail
 * @param target what they fail on, '' for nothing
 * @param failures the failing tests or steps
 * @param next the next action, '' for none
 * @param turnNo the turn, for `/steps n`
 * @param width the text column's cells
 * @returns the rows
 */
export function failureCard(open: number, target: string, failures: readonly CardFailure[], next: string, turnNo: number, width: number): Part[][] {
  const bg = TINT.errCard
  const blank = cardRow([], bg, width)
  const shown = failures.length <= 3 ? failures : failures.slice(0, 2)
  const rows = shown.map(f => {
    const line = /(:\d+(?::\d+)?)$/.exec(f.where)?.[1] ?? ''
    const where = f.where.slice(0, f.where.length - line.length)
    // The room left of the result (13.5): a test's path is cut from its middle folders, a step's command from its middle.
    const room = width - 2 * PAD - widthOf(`${GLYPH.fail} `) - widthOf(line) - (f.said.length > 0 ? widthOf(f.said) + 1 : 0)
    const isPath = !/\s/.test(where)
    const { folder, file } = isPath ? splitPath(cutPath(where, room)) : { folder: '', file: cutCommand(where, room) }

    return cardRow(
      [{ t: `${GLYPH.fail} `, color: TOKEN.err }, ...(folder.length > 0 ? [dim(folder)] : []), { t: file, color: TOKEN.textBright }, dim(line)],
      bg,
      width,
      undefined,
      [{ t: f.said, color: TOKEN.text }]
    )
  })
  const more = failures.length > 3 ? [cardRow(moreParts(failures.length - 2, turnNo), bg, width)] : []

  return [
    topEdge(bg, width),
    cardRow([{ t: `${GLYPH.fail} ${open} still failing`, color: TOKEN.err, bold: true }], bg, width, undefined, target.length > 0 ? [dim(target)] : []),
    blank,
    ...rows,
    ...more,
    ...(next.length > 0
      ? [
          blank,
          cardRow(
            [
              { t: `${GLYPH.next} `, color: TOKEN.text },
              { t: `Next: ${next}`, color: TOKEN.text }
            ],
            bg,
            width
          )
        ]
      : []),
    bottomEdge(bg, width)
  ]
}

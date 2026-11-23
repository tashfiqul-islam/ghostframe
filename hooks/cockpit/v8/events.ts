// The left's event rows (spec 7.10, 13.1, 13.7, 13.8): one row each on the spine, its label the time into the turn at
// which it happened, and a `└` detail line where one thing explains it. Pure: the left draws what these return.
import type { Part } from '../../shared/parts'
import { duration } from '../../shared/look/format'
import { GLYPH } from '../../shared/look/glyphs'
import { TOKEN } from '../../shared/look/palette'
import { cutTitle } from '../../shared/look/paths'
import { NO_LABEL, SPINE, spineRow } from '../../shared/look/spine'
import type { Label } from '../../shared/look/spine'
import { wrapWords } from '../../shared/look/wrap'
import { vw } from '../../shared/text'

/** The gap between an event row's pieces (7.10). */
const GAP = '   '

/** A time into the turn as a label (7.10), in `machineDim`; none when it is not known. */
export const atLabel = (ms: number | undefined, color: string = TOKEN.machineDim): Label => (ms === undefined ? NO_LABEL : { t: duration(ms), color })

const glyph = (t: string, color: string): Part => ({ t, color })
const word = (t: string, color: string): Part => ({ t, color, bold: true })
const dim = (t: string): Part => ({ t, color: TOKEN.dim })

/** Fits the detail into what the text column leaves after the lead, cut at its end. */
function fitted(lead: readonly Part[], detail: readonly Part[], width: number): Part[] {
  const room = width - lead.reduce((n, p) => n + vw(p.t), 0)
  const out: Part[] = []
  let used = 0

  for (const p of detail) {
    if (used >= room) break

    const t = vw(p.t) <= room - used ? p.t : cutTitle(p.t, room - used)

    out.push({ ...p, t })
    used += vw(t)
  }

  return [...lead, ...out]
}

/**
 * A `└` detail line under an event row (7.10): the one thing that explains it.
 * @param text what it says
 * @param width the text column's cells
 * @returns the row
 */
export function detailRow(text: string, width: number): Part[] {
  return spineRow(NO_LABEL, SPINE, [glyph(`${GLYPH.last} `, TOKEN.spine), dim(cutTitle(text, width - 2))])
}

/**
 * A step a system refused (13.7): `⊘  BLOCKED   by a hook · PreToolUse · …`, in warn, never red.
 * @param at its time into the turn
 * @param why who refused it and why
 * @param width the text column's cells
 * @returns the row
 */
export function blockedRow(at: number | undefined, why: string, width: number): Part[] {
  return spineRow(atLabel(at), glyph(GLYPH.blocked, TOKEN.warn), fitted([word('BLOCKED', TOKEN.warn), dim(GAP)], [dim(why)], width))
}

/**
 * A permission the person refused (13.8): `▍  DENIED   shell rm -rf dist · "keep the build output"`. Their reason, in
 * quotes, when they typed one. Neither a failure nor a block.
 * @param at its time into the turn
 * @param kind the step's kind word
 * @param subject what it would have run
 * @param reason what the person typed, '' for nothing
 * @param width the text column's cells
 * @returns the row
 */
export function deniedRow(at: number | undefined, kind: string, subject: string, reason: string, width: number): Part[] {
  const detail = [{ t: `${kind} `, color: TOKEN.muted }, { t: subject, color: TOKEN.textBright }, ...(reason.length > 0 ? [dim(` · "${reason}"`)] : [])]

  return spineRow(atLabel(at), glyph(GLYPH.denied, TOKEN.err), fitted([word('DENIED', TOKEN.err), dim(GAP)], detail, width))
}

/**
 * A failure as its own node (7.10 and screen 31): `×  Width tests on Windows   2 of 14 fail   1m 24s`. In fallback
 * the label stays empty and the step's own time follows its result; on the spine of a live turn the label is the
 * time into the turn.
 * @param title the group's title, or the step's kind and subject
 * @param result its result word
 * @param ms the step's own time, undefined for none
 * @param width the text column's cells
 * @param at its time into the turn, for the label
 * @returns the row
 */
export function failureRow(title: string, result: string, ms: number | undefined, width: number, at?: number): Part[] {
  const tail: Part[] = [
    { t: GAP, color: TOKEN.dim },
    { t: result, color: TOKEN.err },
    ...(ms === undefined ? [] : [dim(GAP), { t: duration(ms), color: TOKEN.machineDim }])
  ]
  const room = width - tail.reduce((n, p) => n + vw(p.t), 0)

  return spineRow(atLabel(at), glyph(GLYPH.fail, TOKEN.err), [{ t: cutTitle(title, Math.max(4, room)), color: TOKEN.text }, ...tail])
}

/**
 * The left's last row while the turn waits on the person (7.10, 9.3): `41s !  NEEDS YOU   shell  rm -rf dist`, its
 * live time in warn. The engine draws the dialog or the card itself (correction C).
 * @param at the time into the turn
 * @param what the kind word and subject it waits on, or what it waits for (`1 question to answer`)
 * @param width the text column's cells
 * @returns the row
 */
export function needsYouRow(at: number | undefined, what: { kind: string; subject: string } | string, width: number): Part[] {
  const detail: Part[] =
    typeof what === 'string'
      ? [dim(what)]
      : [
          { t: `${what.kind}  `, color: TOKEN.muted },
          { t: what.subject, color: TOKEN.textBright }
        ]

  return spineRow(atLabel(at, TOKEN.warn), glyph(GLYPH.needs, TOKEN.warn), fitted([word('NEEDS YOU', TOKEN.warn), dim(GAP)], detail, width))
}

/**
 * A pause that is not a failure (7.10, 9.3): `!  WAITING   rate limited · resumes at 14:05 · or /model to switch`, its
 * time in warn. A countdown in it updates in place; the row never moves.
 * @param at the time into the turn
 * @param detail what it waits for, times in `machine`
 * @param width the text column's cells
 * @returns the row
 */
export function waitingRow(at: number | undefined, detail: readonly Part[], width: number): Part[] {
  return spineRow(atLabel(at, TOKEN.warn), glyph(GLYPH.needs, TOKEN.warn), fitted([word('WAITING', TOKEN.warn), dim(GAP)], detail, width))
}

/**
 * Something that left the machine (7.10, v7 E.5): `↗  committed   a1f3c2e fix(ci): read Bun from mise.toml`, drawn the
 * moment its call returns. The hash or PR number bright, the rest dim.
 * @param at the time into the turn
 * @param verb `committed`, `pushed`, `opened`, `merged`, `created`
 * @param id the hash, PR or key, '' for none
 * @param rest the rest of what it says
 * @param width the text column's cells
 * @returns the row
 */
export function shippedRow(at: number | undefined, verb: string, id: string, rest: string, width: number): Part[] {
  const detail: Part[] = [
    ...(id.length > 0 ? [{ t: id, color: TOKEN.textBright }] : []),
    ...(rest.length > 0 ? [dim(`${id.length > 0 ? ' ' : ''}${rest}`)] : [])
  ]

  return spineRow(atLabel(at), glyph(GLYPH.shipped, TOKEN.accent), fitted([{ t: verb, color: TOKEN.text }, dim(GAP)], detail, width))
}

/**
 * The one success that gets a row of its own (1.8, screen 19): a wait the person asked for, `✓  CI passed   3 checks`.
 * @param at the time into the turn
 * @param title what passed
 * @param detail its counts
 * @param width the text column's cells
 * @returns the row
 */
export function passedRow(at: number | undefined, title: string, detail: string, width: number): Part[] {
  return spineRow(atLabel(at), glyph(GLYPH.ok, TOKEN.ok), fitted([{ t: title, color: TOKEN.text }, dim(GAP)], [dim(detail)], width))
}

/**
 * A notice from outside the turn (7.10): grey and one line. `●` for memory and compaction, with its clock; `!` for
 * the context warning, with none.
 * @param kind which glyph it takes
 * @param text what it says
 * @param width the text column's cells
 * @param clock its clock time, '' for none
 * @returns the row
 */
export function noticeRow(kind: 'notice' | 'warning', text: string, width: number, clock = ''): Part[] {
  return spineRow(clock.length > 0 ? { t: clock, color: TOKEN.machine } : NO_LABEL, glyph(kind === 'notice' ? GLYPH.notice : GLYPH.needs, TOKEN.muted), [
    { t: cutTitle(text, width), color: TOKEN.muted }
  ])
}

/**
 * A sentence Claude said while working, in ctrl+o (amendment 11, screen 30): its clock, the spine, the sentence muted.
 * @param clock the clock it was said at, '' for none
 * @param text the sentence
 * @param width the text column's cells
 * @returns the rows, wrapped
 */
export function sentenceRows(clock: string, text: string, width: number): Part[][] {
  return wrapWords(text, width).map((r, i) =>
    spineRow(i === 0 && clock.length > 0 ? { t: clock, color: TOKEN.machine } : NO_LABEL, SPINE, [{ t: r, color: TOKEN.muted }])
  )
}

/**
 * The plan's closing node (7.9, screen 05): `◇  PLAN   ready · waiting for your approval · 7 steps, all reads`.
 * @param at the time into the turn
 * @param detail what it says
 * @param width the text column's cells
 * @returns the row
 */
export function planRow(at: number | undefined, detail: string, width: number): Part[] {
  return spineRow(atLabel(at), glyph(GLYPH.agent, TOKEN.machine), fitted([word('PLAN', TOKEN.machine), dim(GAP)], [dim(detail)], width))
}

/**
 * A step on an agent's own spine (screen 27): `6s ✓  shell   bun test hooks/width   14 pass`, its label its own time.
 * @param ms the step's own time
 * @param ok whether it passed
 * @param kind its kind word
 * @param subject what it ran
 * @param result its result word
 * @param width the text column's cells
 * @returns the row
 */
export function stepNodeRow(ms: number | undefined, ok: boolean, kind: string, subject: string, result: string, width: number): Part[] {
  return spineRow(
    atLabel(ms),
    ok ? glyph(GLYPH.ok, TOKEN.ok) : glyph(GLYPH.fail, TOKEN.err),
    fitted(
      [{ t: kind, color: TOKEN.muted }, dim(GAP), { t: subject, color: TOKEN.text }, dim(GAP)],
      [{ t: result, color: ok ? TOKEN.machineDim : TOKEN.err }],
      width
    )
  )
}

/**
 * The third failure row when there are more than three (13.1): `+ n more · /steps n`, dim.
 * @param more how many more failures there are
 * @param turnNo the turn's number
 * @returns the row's text column parts
 */
export function moreParts(more: number, turnNo: number): Part[] {
  return [dim(`+ ${more} more · /steps ${turnNo}`)]
}

/**
 * Fallback's `+ n more · /steps n` row (13.1), on the spine above the receipt: the failures past the three drawn.
 * @param more how many failure keys drew no row
 * @param turnNo the turn's number
 * @returns the row
 */
export function moreRow(more: number, turnNo: number): Part[] {
  return spineRow(NO_LABEL, SPINE, moreParts(more, turnNo))
}

/**
 * The failures the left shows (13.1): at most three; with more, the first two and a `+ n more` row.
 * @param all every failure to show, oldest first
 * @returns the ones drawn, and how many the `+ n more` row stands for (0 for none)
 */
export function capFailures<T>(all: readonly T[]): { shown: T[]; more: number } {
  return all.length <= 3 ? { shown: [...all], more: 0 } : { shown: all.slice(0, 2), more: all.length - 2 }
}

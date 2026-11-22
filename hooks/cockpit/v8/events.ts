// The left's event rows (spec 7.10, 13.1, 13.7, 13.8): one row each on the spine, its label the time into the turn at
// which it happened, and a `└` detail line where one thing explains it. Pure: the left draws what these return.
import type { Part } from '../../shared/parts'
import { duration } from '../../shared/look/format'
import { GLYPH } from '../../shared/look/glyphs'
import { TOKEN } from '../../shared/look/palette'
import { cutTitle } from '../../shared/look/paths'
import { NO_LABEL, SPINE, spineRow } from '../../shared/look/spine'
import type { Label } from '../../shared/look/spine'
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
 * The third failure row when there are more than three (13.1): `+ n more · /steps n`, dim.
 * @param more how many more failures there are
 * @param turnNo the turn's number
 * @returns the row's text column parts
 */
export function moreParts(more: number, turnNo: number): Part[] {
  return [dim(`+ ${more} more · /steps ${turnNo}`)]
}

/**
 * The failures the left shows (13.1): at most three; with more, the first two and a `+ n more` row.
 * @param all every failure to show, oldest first
 * @returns the ones drawn, and how many the `+ n more` row stands for (0 for none)
 */
export function capFailures<T>(all: readonly T[]): { shown: T[]; more: number } {
  return all.length <= 3 ? { shown: [...all], more: 0 } : { shown: all.slice(0, 2), more: all.length - 2 }
}

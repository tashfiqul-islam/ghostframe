// The left's turn opening (spec 7.1 to 7.3): the turn header, your message as a card (added, queued and to an agent
// too), and the thought row. Pure: the prompt and reply sites draw what these return.
import type { TurnAfter } from '../../../types'
import type { Part } from '../../shared/parts'
import { bottomEdge, cardRow, topEdge } from '../../shared/look/card'
import { clockTime, duration } from '../../shared/look/format'
import { GLYPH } from '../../shared/look/glyphs'
import { TOKEN } from '../../shared/look/palette'
import { NO_LABEL, SPINE, spineOnly, spineRow } from '../../shared/look/spine'
import { THOUGHT_LEVELS, trace } from '../../shared/look/trace'
import { wrapWords } from '../../shared/look/wrap'
import { vw } from '../../shared/text'

/** The label state words of amendment 12, in v8's capitals (7.1). */
const AFTER: Record<TurnAfter, string> = { resume: 'RESUMED', compact: 'AFTER COMPACT', rewind: 'AFTER REWIND' }

/** A turn header's facts (7.1). */
export type Header = {
  /** The prompt's submit time, wall clock; undefined when the submit was never seen (no label then). */
  at: number | undefined
  /** The turn's number, undefined for a prompt Cockpit never numbered (typed while it was off). */
  turnNo: number | undefined
  after?: TurnAfter | undefined
  /** The day word (5.1), '' when the day is the previous prompt's. */
  day?: string
  isLive: boolean
}

/**
 * The turn header (7.1): `10:14:02 ◆  TURN 7  ────`, the rule in `hairline` to the text column's last cell.
 * @param h the header's facts
 * @param width the text column's cells
 * @returns the row
 */
export function turnHeader(h: Header, width: number): Part[] {
  const tail = [...(h.after === undefined ? [] : [AFTER[h.after]]), ...(h.day !== undefined && h.day.length > 0 ? [h.day] : [])]
  const label: Part[] = [
    { t: 'TURN', color: TOKEN.muted },
    ...(h.turnNo === undefined ? [] : [{ t: ` ${h.turnNo}`, color: TOKEN.textBright, bold: true }]),
    ...(tail.length > 0 ? [{ t: ` · ${tail.join(' · ')}`, color: TOKEN.machine, bold: true }] : [])
  ]
  const used = label.reduce((n, p) => n + vw(p.t), 0)

  return spineRow(
    h.at === undefined ? NO_LABEL : { t: clockTime(h.at), color: TOKEN.machine },
    { t: GLYPH.turn, color: h.isLive ? TOKEN.accent : TOKEN.spine },
    [...label, { t: '  ', color: TOKEN.hairline }, { t: GLYPH.rule.repeat(Math.max(1, width - used - 2)), color: TOKEN.hairline }]
  )
}

/**
 * An agent's conversation opens with its own header (7.1, screen 27): `◇  AGENT Audit tests  ────`, in the agent colour.
 * @param at when it started
 * @param name its name
 * @param width the text column's cells
 * @returns the row
 */
export function agentHeader(at: number, name: string, width: number): Part[] {
  const t = `AGENT ${name}`

  return spineRow({ t: clockTime(at), color: TOKEN.machine }, { t: GLYPH.agent, color: TOKEN.agent }, [
    { t, color: TOKEN.agent, bold: true },
    { t: '  ', color: TOKEN.hairline },
    { t: GLYPH.rule.repeat(Math.max(1, width - vw(t) - 2)), color: TOKEN.hairline }
  ])
}

/** How a message entered the conversation (7.2). */
export type MessageKind = 'typed' | 'added' | 'queued' | 'toAgent'

const MESSAGE_GLYPH: Record<MessageKind, Part> = {
  typed: { t: GLYPH.you, color: TOKEN.accent },
  added: { t: GLYPH.added, color: TOKEN.muted },
  queued: { t: GLYPH.queued, color: TOKEN.muted },
  toAgent: { t: GLYPH.toAgent, color: TOKEN.muted }
}

/**
 * Your message as a card (7.2): a `surface` card with half-cell edges, the glyph, the text in `textBright`. Added and
 * queued messages carry their clock in the label and `added` / `QUEUED` at the card's right end; a message to an agent
 * carries `from main`. A queued card is followed by when it sends.
 * @param text the message
 * @param kind how it entered
 * @param width the text column's cells
 * @param at its clock, for an added or queued message
 * @returns the rows
 */
export function messageCard(text: string, kind: MessageKind, width: number, at?: number): Part[][] {
  const rows = wrapWords(text.trim(), width - 4 - 2 - (kind === 'added' || kind === 'queued' ? 8 : 0))
  const label =
    kind === 'toAgent' ? { t: 'from main', color: TOKEN.dim } : at !== undefined && kind !== 'typed' ? { t: clockTime(at), color: TOKEN.machine } : NO_LABEL
  const right: Part[] = kind === 'added' ? [{ t: 'added', color: TOKEN.muted }] : kind === 'queued' ? [{ t: 'QUEUED', color: TOKEN.muted, bold: true }] : []
  const body = rows.map((r, i) =>
    cardRow(
      [i === 0 ? MESSAGE_GLYPH[kind] : { t: ' ', color: TOKEN.dim }, { t: ` ${r}`, color: TOKEN.textBright }],
      TOKEN.surface,
      width,
      i === 0 ? label : NO_LABEL,
      i === 0 ? right : []
    )
  )
  const queued = kind === 'queued' ? [spineRow(NO_LABEL, SPINE, [{ t: 'Sends when this turn ends · ctrl+enter send now', color: TOKEN.dim }])] : []

  return [topEdge(TOKEN.surface, width), ...body, bottomEdge(TOKEN.surface, width), ...queued]
}

/**
 * The thought row (7.3): `6s ∴  thought   ⣀⣠⣤…   ctrl+o expand`. The thinking text is never drawn, in ctrl+o too.
 * @param ms how long Claude thought
 * @returns the row
 */
export function thoughtRow(ms: number): Part[] {
  return spineRow({ t: duration(ms), color: TOKEN.machineDim }, { t: GLYPH.thought, color: TOKEN.muted }, [
    { t: 'thought', color: TOKEN.muted },
    { t: '   ', color: TOKEN.dim },
    ...trace(THOUGHT_LEVELS),
    { t: '   ', color: TOKEN.dim },
    { t: 'ctrl+o', color: TOKEN.accent },
    { t: ' expand', color: TOKEN.dim }
  ])
}

/** The one blank row inside a turn: the spine alone (7.1). */
export const blankRow = (): Part[] => spineOnly()

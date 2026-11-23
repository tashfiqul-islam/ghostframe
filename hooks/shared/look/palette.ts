// Cockpit v8's colours (spec section 2): every hex Cockpit draws with is here, and nowhere else. The tokens colour
// text, the tints colour cell backgrounds, the pills colour a state word's background. The transcript with Cockpit off
// keeps its own palette (shared/tokens.ts), unchanged from main.

/** The colour tokens (section 2): text and glyph colours. */
export const TOKEN = {
  bg: '#0B0B0E',
  surface: '#14141B',
  code: '#0F0F14',
  codeHead: '#16161D',
  pane: '#0D0E12',
  paneCard: '#13141A',
  hairline: '#1E1E26',
  spine: '#24242E',
  textBright: '#ECECF1',
  text: '#B2B2BC',
  muted: '#7C7C88',
  dim: '#5E5E6A',
  accent: '#FAB387',
  machine: '#7EC8BE',
  machineDim: '#4E7A75',
  ok: '#96D292',
  err: '#EC84A0',
  warn: '#E8B98A',
  agent: '#B4A0DE',
  link: '#8FB8DE',
  barDone: '#3F6E68',
  wordmark: '#3A4846',
  wordmarkVersion: '#56706B'
} as const

/** The braille trace's colour at each level, 0 to 6 (section 2): `#2E3A39` at the bottom, rising to `machine`. */
export const TRACE_STEPS = ['#2E3A39', '#3B524F', '#496965', '#56817C', '#639992', '#71B0A8', '#7EC8BE'] as const

/** The tints (section 2), drawn as cell backgrounds. */
export const TINT = {
  addedLine: '#111B15',
  addedWord: '#1D3A28',
  removedLine: '#1D1317',
  removedWord: '#3A1E27',
  errCard: '#1A1216',
  zebra: '#121218',
  drawer: '#121219',
  selected: '#1E1E26',
  dividerFocused: '#2A2A34'
} as const

/** A pill's state: the word it carries and the background it sits on (section 2). */
export type PillState = 'done' | 'live' | 'failed' | 'needsYou' | 'plan' | 'agent'

/** The pill backgrounds, one per state (section 2). */
export const PILL: Record<PillState, string> = {
  done: '#132019',
  live: '#2A1D15',
  failed: '#24141A',
  needsYou: '#241C12',
  plan: '#10201E',
  agent: '#1C1726'
}

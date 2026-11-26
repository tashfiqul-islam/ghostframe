// Rows of segments to terminal text: 24-bit colour, or the nearest of the 256 colours where the terminal lacks it.
import type { Seg } from './render.ts'

/** How many colours the terminal draws. */
export type Depth = 'truecolor' | '256'

/**
 * Whether the terminal draws 24-bit colour: COLORTERM says so, or it is a terminal known to.
 * @param env the environment
 * @returns the colour depth
 */
export function depthOf(env: Record<string, string | undefined>): Depth {
  const ct = (env['COLORTERM'] ?? '').toLowerCase()

  if (ct === 'truecolor' || ct === '24bit') return 'truecolor'
  if (env['WT_SESSION'] !== undefined) return 'truecolor' // Windows Terminal
  if (/^(iTerm\.app|WezTerm|vscode|ghostty|Hyper)$/.test(env['TERM_PROGRAM'] ?? '')) return 'truecolor'
  if (/(kitty|ghostty|wezterm|alacritty|foot|direct|truecolor)/.test(env['TERM'] ?? '')) return 'truecolor'

  return '256'
}

const channel = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16)
const rgb = (h: string): [number, number, number] => [channel(h, 1), channel(h, 3), channel(h, 5)]

const LEVELS: readonly number[] = [0, 95, 135, 175, 215, 255]
const near = (v: number): number => LEVELS.reduce<number>((best, l, i) => (Math.abs(l - v) < Math.abs((LEVELS[best] ?? 0) - v) ? i : best), 0)
const dist = (a: readonly number[], b: readonly number[]): number => a.reduce((n, x, i) => n + (x - (b[i] ?? 0)) ** 2, 0)

/**
 * The nearest xterm 256-colour index to a hex colour: the closer of the 6×6×6 cube and the grey ramp.
 * @param hex `#RRGGBB`
 * @returns an index from 16 to 255
 */
export function xterm256(hex: string): number {
  const c = rgb(hex)
  const [r, g, b] = [near(c[0]), near(c[1]), near(c[2])]
  const cube = 16 + 36 * r + 6 * g + b
  const cubeRgb = [LEVELS[r] ?? 0, LEVELS[g] ?? 0, LEVELS[b] ?? 0]
  const avg = (c[0] + c[1] + c[2]) / 3
  const gi = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)))
  const grey = 8 + 10 * gi

  return dist(c, [grey, grey, grey]) < dist(c, cubeRgb) ? 232 + gi : cube
}

const color = (hex: string, layer: 38 | 48, depth: Depth): string =>
  depth === 'truecolor' ? `\x1b[${layer};2;${rgb(hex).join(';')}m` : `\x1b[${layer};5;${xterm256(hex)}m`

/**
 * One row as terminal text: each segment resets, then sets its bold, foreground and background.
 * @param segs the row
 * @param depth the colour depth
 * @returns the text with SGR escapes, ending in a reset
 */
export const ansi = (segs: readonly Seg[], depth: Depth): string =>
  segs
    .map(
      x => `\x1b[0m${x.b === true ? '\x1b[1m' : ''}${x.fg !== undefined ? color(x.fg, 38, depth) : ''}${x.bg !== undefined ? color(x.bg, 48, depth) : ''}${x.t}`
    )
    .join('') + '\x1b[0m'

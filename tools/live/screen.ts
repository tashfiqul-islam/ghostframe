// A captured screen: every cell's character, foreground, background and bold, read from the headless terminal's
// buffer, and the two files a capture is saved as (a .txt of the rows, an .html that draws the cells in colour).
import type { Terminal } from '@xterm/headless'

import { TOKEN } from '../../hooks/shared/look/palette.ts'

/** One terminal cell. `ch` is '' for the second half of a wide character; a colour is `#RRGGBB`, or null for the terminal's default. */
export type Cell = { ch: string; width: number; fg: string | null; bg: string | null; bold: boolean }

/** A whole screen at one moment. */
export type Capture = { name: string; cols: number; rows: number; cells: Cell[][]; cursor: { x: number; y: number } }

// The 16 ANSI colours as Windows Terminal's default scheme draws them, then the 6×6×6 cube and the grey ramp.
const ANSI16 = [
  '#0C0C0C',
  '#C50F1F',
  '#13A10E',
  '#C19C00',
  '#0037DA',
  '#881798',
  '#3A96DD',
  '#CCCCCC',
  '#767676',
  '#E74856',
  '#16C60C',
  '#F9F1A5',
  '#3B78FF',
  '#B4009E',
  '#61D6D6',
  '#F2F2F2'
]

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0').toUpperCase()}`

/**
 * The hex of a 256-colour palette index.
 * @param i the index, 0 to 255
 * @returns `#RRGGBB`
 */
export function paletteHex(i: number): string {
  if (i < 16) return ANSI16[i] ?? '#000000'
  if (i >= 232) {
    const v = 8 + (i - 232) * 10

    return hex((v << 16) | (v << 8) | v)
  }
  const c = i - 16
  const level = (n: number): number => (n === 0 ? 0 : 55 + n * 40)

  return hex((level(Math.floor(c / 36)) << 16) | (level(Math.floor(c / 6) % 6) << 8) | level(c % 6))
}

/**
 * The screen the terminal shows now.
 * @param term the headless terminal, its writes flushed
 * @param name the capture's name
 * @returns the capture
 */
export function captureOf(term: Terminal, name: string): Capture {
  const buffer = term.buffer.active
  const cells: Cell[][] = []

  for (let y = 0; y < term.rows; y++) {
    const line = buffer.getLine(buffer.viewportY + y)
    const row: Cell[] = []

    for (let x = 0; x < term.cols; x++) {
      const c = line?.getCell(x)

      if (c === undefined) {
        row.push({ ch: ' ', width: 1, fg: null, bg: null, bold: false })
        continue
      }
      const fg = c.isFgRGB() ? hex(c.getFgColor()) : c.isFgPalette() ? paletteHex(c.getFgColor()) : null
      const bg = c.isBgRGB() ? hex(c.getBgColor()) : c.isBgPalette() ? paletteHex(c.getBgColor()) : null
      const isInverse = c.isInverse() !== 0

      row.push({
        ch: c.getWidth() === 0 ? '' : c.getChars() === '' ? ' ' : c.getChars(),
        width: c.getWidth(),
        fg: isInverse ? bg : fg,
        bg: isInverse ? fg : bg,
        bold: c.isBold() !== 0
      })
    }
    cells.push(row)
  }

  return { name, cols: term.cols, rows: term.rows, cells, cursor: { x: buffer.cursorX, y: buffer.cursorY } }
}

/**
 * A row's text, one character per drawn cell (a wide character once, its second half nothing).
 * @param cap the capture
 * @param y the row
 * @param from the first column, default 0
 * @param to the column after the last, default the width
 * @returns the text
 */
export function rowText(cap: Capture, y: number, from: number = 0, to: number = cap.cols): string {
  return (cap.cells[y] ?? [])
    .slice(from, to)
    .map(c => c.ch)
    .join('')
}

/**
 * The whole screen as text, one line per row, trailing spaces kept off.
 * @param cap the capture
 * @returns the rows joined by newlines
 */
export function textOf(cap: Capture): string {
  return Array.from({ length: cap.rows }, (_, y) => rowText(cap, y).trimEnd()).join('\n')
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The screen as a page that draws each cell in its colours, on section 2's `bg` with its `text` as the default.
 * @param cap the capture
 * @returns a standalone HTML document
 */
export function htmlOf(cap: Capture): string {
  const rows = cap.cells.map(row => {
    let html = ''

    for (const c of row) {
      if (c.width === 0) continue
      const style = [
        c.fg === null ? '' : `color:${c.fg}`,
        c.bg === null ? '' : `background:${c.bg}`,
        c.bold ? 'font-weight:bold' : '',
        c.width === 2 ? 'width:2ch' : ''
      ]
        .filter(s => s !== '')
        .join(';')

      html += `<span${style === '' ? '' : ` style="${style}"`}>${escapeHtml(c.ch)}</span>`
    }

    return `<div>${html}</div>`
  })

  return `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(cap.name)}</title>
<style>
  body { margin: 0; padding: 16px; background: ${TOKEN.bg}; color: ${TOKEN.text}; }
  .screen { font: 12px/19px 'Cascadia Mono', 'Cascadia Code', Consolas, monospace; white-space: pre; width: ${cap.cols}ch; }
  .screen span { display: inline-block; width: 1ch; height: 19px; overflow: visible; vertical-align: top; }
  h1 { font: 12px system-ui, sans-serif; color: ${TOKEN.muted}; margin: 0 0 8px; }
</style>
<h1>${escapeHtml(cap.name)} · ${cap.cols}×${cap.rows}</h1>
<div class="screen">
${rows.join('')}
</div>
`
}

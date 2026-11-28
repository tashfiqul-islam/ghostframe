// The glyph field: the mascot set in JetBrains Mono on the 8 x 16 cell grid, drawn to <canvas>.
// A canvas is not an LCP candidate, so the field never competes with the hero mascot or the headline.
// Data: field.json, written by tools/build-field.py. Import it and call drawField() once from the hero's script.

/** The field as tools/build-field.py writes it. */
export interface Field {
  /** Cells across (140). */
  cols: number
  /** Cells down (87). */
  rows: number
  /** The eyes' column (70): the light source. */
  ex: number
  /** The eyes' row (38). */
  ey: number
  /** One string per row, one character per cell; a space is an empty cell. */
  chars: string[]
  /** Base64 of cols x rows bytes: each cell's brightness, 0 to 238. */
  v: string
}

const CELL_W = 8
const CELL_H = 16

/**
 * A cell's colour: warm within about 300 px of the eyes, cold phosphor everywhere else.
 * @param b the cell's brightness, 0 to 238
 * @param dist the cell's distance from the eyes, in px
 * @returns a CSS colour
 */
function tint(b: number, dist: number): string {
  const warm = 0.2 * Math.exp(-((dist / 300) ** 2))
  const cold = 1 - Math.min(1, warm * 5)
  const r = Math.trunc(b * (0.97 + warm - 0.17 * cold))
  const g = Math.trunc(b * (0.95 + warm * 0.5 + 0.06 * cold))
  const bl = Math.min(255, Math.trunc(b * (1.07 - warm + 0.03 * cold)))

  return `rgb(${r},${g},${bl})`
}

/**
 * Draws the field once into an offscreen canvas, then copies it into every `canvas[data-field]`.
 * Sets `data-field-ready="1"` on <html> when done. Call it after JetBrains Mono 500 has loaded.
 * @param field the data from field.json
 * @param root where to look for the canvases
 */
export function paintField(field: Field, root: ParentNode = document): void {
  const targets = root.querySelectorAll<HTMLCanvasElement>('canvas[data-field]')

  if (targets.length === 0) return

  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  const off = document.createElement('canvas')

  off.width = field.cols * CELL_W * dpr
  off.height = field.rows * CELL_H * dpr

  const c = off.getContext('2d')

  if (c === null) return

  c.scale(dpr, dpr)
  c.font = '500 13.333px "JetBrains Mono", ui-monospace, monospace'
  c.textAlign = 'center'
  c.textBaseline = 'middle'

  const v = atob(field.v)
  let i = 0

  for (let y = 0; y < field.rows; y++) {
    const row = field.chars[y] ?? ''

    for (let x = 0; x < field.cols; x++, i++) {
      const ch = row[x] ?? ' '

      if (ch === ' ') continue

      const dist = Math.hypot((x - field.ex) * CELL_W, (y - field.ey) * CELL_H)

      c.fillStyle = tint(v.charCodeAt(i), dist)
      c.fillText(ch, x * CELL_W + CELL_W / 2, y * CELL_H + CELL_H / 2)
    }
  }

  for (const target of targets) {
    target.width = off.width
    target.height = off.height
    target.getContext('2d')?.drawImage(off, 0, 0)
  }

  document.documentElement.dataset.fieldReady = '1'
}

/**
 * Waits for the mono face, then paints. A font that fails to load still paints, in the fallback face.
 * @param field the data from field.json
 * @returns a promise that settles once the field is painted
 */
export async function drawField(field: Field): Promise<void> {
  try {
    await document.fonts.load('500 13.333px "JetBrains Mono"')
  } catch {
    // Paint anyway.
  }

  paintField(field)
}

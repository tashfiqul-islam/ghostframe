// The renderer against the reference renderer (docs/design/statusline-preview.ts), cell for cell, at 200 and 100
// columns in both sample states. The reference always draws the slab and its 2-cell margin, so the renderer is asked
// for them too. The one approved difference: the eyes, amber in the reference at any calm reading, follow the three
// pressure levels here (green under 60%).
import { expect, test } from 'bun:test'
import { join } from 'node:path'

import { STATUS } from '../hooks/shared/look/palette.ts'
import { render } from './render.ts'
import type { Seg } from './render.ts'
import { NORMAL, PRESSURE } from './samples.ts'

type Cell = { ch: string; fg: string | null; bg: string | null; b: boolean }

const PREVIEW = join(import.meta.dir, '..', 'docs', 'design', 'statusline-preview.ts')
const hex = (r: string, g: string, b: string): string => `#${[r, g, b].map(x => Number(x).toString(16).padStart(2, '0').toUpperCase()).join('')}`

// Reads the reference's ANSI: every segment starts with a reset, then bold, foreground and background.
function cellsOfAnsi(line: string): Cell[] {
  const cells: Cell[] = []
  let fg: string | null = null
  let bg: string | null = null
  let b = false

  // oxlint-disable-next-line eslint/no-control-regex -- ESC is the point: the reference's rows are SGR escapes
  for (const part of line.split(/(\x1b\[[\d;]*m)/)) {
    // oxlint-disable-next-line eslint/no-control-regex -- the same SGR escape, read for its parameters
    const m = /^\x1b\[([\d;]*)m$/.exec(part)

    if (m === null) {
      for (const ch of part) cells.push({ ch, fg, bg, b })
      continue
    }

    const p = (m[1] ?? '').split(';')

    if (p[0] === '0' || p[0] === '') [fg, bg, b] = [null, null, false]
    else if (p[0] === '1') b = true
    else if (p[0] === '38') fg = hex(p[2] ?? '', p[3] ?? '', p[4] ?? '')
    else if (p[0] === '48') bg = hex(p[2] ?? '', p[3] ?? '', p[4] ?? '')
  }

  return cells
}

// One cell per code point: every glyph the design draws is one cell wide.
const cellsOf = (row: readonly Seg[]): Cell[] => row.flatMap(s => Array.from(s.t, ch => ({ ch, fg: s.fg ?? null, bg: s.bg ?? null, b: s.b === true })))

function reference(state: 'normal' | 'pressure', width: number): Cell[][] {
  const r = Bun.spawnSync(['bun', PREVIEW, '--width', String(width), '--state', state], { stdout: 'pipe', stderr: 'pipe' })
  const lines = r.stdout.toString().split('\n')
  // The two rows come after the second rule: label, rule, prompt, rule, row, row.
  const rules = lines.flatMap((l, i) => (l.includes('─'.repeat(20)) ? [i] : []))
  const at = (rules[1] ?? -10) + 1

  return [lines[at] ?? '', lines[at + 1] ?? ''].map(cellsOfAnsi)
}

for (const width of [200, 100]) {
  for (const [state, facts] of [
    ['normal', NORMAL],
    ['pressure', PRESSURE]
  ] as const) {
    test(`matches the reference renderer at ${width} columns, ${state}`, () => {
      const ref = reference(state, width)
      const mine = render(facts, width, { icons: true, slab: true }).map(cellsOf)
      const diffs: string[] = []

      for (const r of [0, 1]) {
        expect(mine[r]?.length).toBe(width)
        expect(ref[r]?.length).toBe(width)
        for (let c = 0; c < width; c++) {
          const a = JSON.stringify(ref[r]?.[c])
          const b = JSON.stringify(mine[r]?.[c])

          if (a !== b) diffs.push(`row ${r} col ${c}: reference ${a} renderer ${b}`)
        }
      }

      // The eyes are the bottom pixels of the mark's first row, cells 1 and 4 after the 2-cell margin.
      const eyes =
        state === 'normal'
          ? [3, 6].map(
              c =>
                `row 0 col ${c}: reference {"ch":"▀","fg":"#A29DB0","bg":"#FAB387","b":false} renderer {"ch":"▀","fg":"#A29DB0","bg":"${STATUS.eyeCalm}","b":false}`
            )
          : []

      expect(diffs).toEqual(eyes)
    })
  }
}

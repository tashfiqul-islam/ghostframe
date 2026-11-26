// The renderer's layout rules (docs/design/statusline.md): widths, fixed columns, meters, thresholds, the mark, icons
// off, unknown values, and its speed.
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { STATUS, TOKEN } from '../hooks/shared/look/palette.ts'
import { widthOf } from './io.ts'
import { MIN_W, len, mark, meter, render } from './render.ts'
import type { Facts, Options, Seg } from './render.ts'
import { EMPTY, NORMAL, PRESSURE } from './samples.ts'

const ON: Options = { icons: true, slab: false }
const STATES: [string, Facts][] = [
  ['normal', NORMAL],
  ['pressure', PRESSURE],
  ['empty', EMPTY]
]
const TILES: readonly string[] = [STATUS.tileCalm, STATUS.tileWarm, STATUS.tileHot]

type Cell = { ch: string; fg: string | undefined; bg: string | undefined }
// One cell per code point: every glyph the design draws is one cell wide.
const cells = (row: readonly Seg[] | undefined): Cell[] => (row ?? []).flatMap(s => Array.from(s.t, ch => ({ ch, fg: s.fg, bg: s.bg })))
const text = (row: readonly Seg[] | undefined): string =>
  cells(row)
    .map(c => c.ch)
    .join('')
const at = (f: Facts, w = 200, o: Options = ON): Cell[][] => render(f, w, o).map(cells)

// The first cell of each tile: its ▏ edge.
const edges = (row: Cell[]): number[] => row.flatMap((c, i) => (c.ch === '▏' ? [i] : []))
// Where a run of text starts in a row.
const startOf = (row: Cell[], s: string): number =>
  row
    .map(c => c.ch)
    .join('')
    .indexOf(s)

describe('widths', () => {
  test('every COLUMNS from 90 to 300: rows exactly W wide, the last tile ending on the last cell', () => {
    for (let cols = 90; cols <= 300; cols++) {
      const w = widthOf({ COLUMNS: String(cols) })

      expect(w).toBe(Math.min(cols - 4, 210))
      for (const [, f] of STATES) {
        const rows = render(f, w, ON)

        if (w < MIN_W) {
          expect(rows.length).toBe(1)
          expect(len(rows[0] ?? [])).toBeLessThanOrEqual(w)
          continue
        }
        expect(rows.length).toBe(2)
        for (const row of rows) {
          expect(len(row)).toBe(w)
          // The last tile's surface reaches the last cell of W.
          expect(TILES).toContain(cells(row).at(-1)?.bg ?? '')
        }
      }
    }
  })

  test('padding narrows W by two cells per side, and GF_MAXW moves the cap', () => {
    expect(widthOf({ COLUMNS: '200', GF_PADDING: '1' })).toBe(194)
    expect(widthOf({ COLUMNS: '400' })).toBe(210)
    expect(widthOf({ COLUMNS: '400', GF_MAXW: '300' })).toBe(300)
  })

  test('below 90 cells: one plain line that never overflows', () => {
    for (let w = 20; w < MIN_W; w++) {
      for (const [, f] of STATES) {
        const rows = render(f, w, ON)

        expect(rows.length).toBe(1)
        expect(len(rows[0] ?? [])).toBeLessThanOrEqual(w)
      }
    }
    expect(text(render(NORMAL, 80, ON)[0])).toBe('Opus 5.5 · ghostframe main ● · ctx 41% · 5h 34% · wk 8%')
  })
})

describe('fixed columns', () => {
  test('each left column starts at the same cell in every state', () => {
    for (const w of [100, 139, 140, 200, 210]) {
      const starts = STATES.map(([, f]) => {
        const [r1] = at(f, w)
        const row = r1 ?? []

        return [startOf(row, 'Opus 5.5'), startOf(row, 'ghostframe')]
      })

      for (const s of starts) expect(s).toEqual(starts[0] ?? [])
    }
  })

  test("each tile's number starts on its meter's first cell", () => {
    for (const w of [100, 160, 200]) {
      for (const [, f] of STATES) {
        const [r1 = [], r2 = []] = at(f, w)

        for (const e of edges(r1)) {
          expect(r1[e + 3]?.ch).not.toBe(' ')
          expect(r2[e + 3]?.ch).toBe('▮')
          expect(r2[e + 2]?.ch).toBe(' ')
        }
      }
    }
  })

  test('icons off keeps every column and tile where it is, with no icon cells', () => {
    for (const w of [100, 200]) {
      for (const [, f] of STATES) {
        const on = at(f, w, { icons: true, slab: false })
        const off = at(f, w, { icons: false, slab: false })

        expect(edges(off[0] ?? [])).toEqual(edges(on[0] ?? []))
        expect(startOf(off[0] ?? [], 'ghostframe')).toBe(startOf(on[0] ?? [], 'ghostframe'))
        expect(
          off
            .flat()
            .map(c => c.ch)
            .join('')
        ).not.toMatch(/[\uE000-\uF8FF]/)
      }
    }
  })

  test('the slab adds a 2-cell margin and paints every cell', () => {
    const rows = at(NORMAL, 200, { icons: true, slab: true })

    for (const row of rows) {
      expect(row.slice(0, 2).map(c => c.ch)).toEqual([' ', ' '])
      expect(row.every(c => c.bg !== undefined)).toBe(true)
    }
    expect(at(NORMAL, 200)[0]?.[0]?.bg).toBeUndefined()
  })
})

describe('meters', () => {
  const W = 20
  const lit = (p: number): number => meter(p, W, null, STATUS.tileCalm).filter(s => s.fg === TOKEN.machine || s.fg === TOKEN.warn || s.fg === TOKEN.err).length

  test('fill at 0, 1, 59, 60, 84, 85, 99 and 100%', () => {
    expect([0, 1, 59, 60, 84, 85, 99, 100].map(lit)).toEqual([0, 0, 12, 12, 17, 17, 20, 20])
  })

  test('pace sits where an even burn would be, never past the last cell', () => {
    const paceAt = (pace: number): number => meter(10, W, pace, STATUS.tileCalm).findIndex(s => s.fg === TOKEN.textBright)

    expect([0, 1, 59, 60, 84, 85, 99, 100].map(paceAt)).toEqual([0, 0, 11, 12, 16, 17, 19, 19])
    expect(meter(10, W, null, STATUS.tileCalm).some(s => s.fg === TOKEN.textBright)).toBe(false)
  })

  test('unlit blocks are quieter at 25, 50 and 75%', () => {
    const quarters = meter(0, W, null, STATUS.tileCalm).flatMap((s, i) => (s.fg === STATUS.meterQuarter ? [i] : []))

    expect(quarters).toEqual([5, 10, 15])
  })

  test('threshold colours: teal under 60, amber 60 to 84, red from 85', () => {
    const tone = (p: number): string | undefined => meter(p, W, null, STATUS.tileCalm)[0]?.fg

    expect([59, 60, 84, 85, 100].map(tone)).toEqual([TOKEN.machine, TOKEN.warn, TOKEN.warn, TOKEN.err, TOKEN.err])
    const surface = (p: number): [string | undefined, string | undefined] => {
      const f: Facts = { ...NORMAL, ctx: { pct: p, reset: null, pace: null } }
      const [r1 = []] = at(f)
      const e = edges(r1)[0] ?? 0

      return [r1[e]?.fg, r1[e]?.bg]
    }

    expect(surface(59)).toEqual([STATUS.edgeCalm, STATUS.tileCalm])
    expect(surface(60)).toEqual([TOKEN.warn, STATUS.tileWarm])
    expect(surface(84)).toEqual([TOKEN.warn, STATUS.tileWarm])
    expect(surface(85)).toEqual([TOKEN.err, STATUS.tileHot])
  })
})

describe('the mark', () => {
  const eyes = (p: number): string[] => [mark(p)[0][1]?.bg ?? '', mark(p)[0][4]?.bg ?? '']

  test('a fixed 6 × 2 slot', () => {
    for (const p of [0, 70, 90]) for (const row of mark(p)) expect(len(row)).toBe(6)
  })

  test('eyes green under 60, amber 60 to 84, red from 85', () => {
    expect(eyes(59)).toEqual([STATUS.eyeCalm, STATUS.eyeCalm])
    expect(eyes(60)).toEqual([STATUS.eyeWarm, STATUS.eyeWarm])
    expect(eyes(84)).toEqual([STATUS.eyeWarm, STATUS.eyeWarm])
    expect(eyes(85)).toEqual([STATUS.eyeHot, STATUS.eyeHot])
  })

  test('the highest of context, 5-hour and week drives the eyes; unknown is calm', () => {
    const eyeIn = (f: Facts): string | undefined => at(f)[0]?.[1]?.bg

    expect(eyeIn(EMPTY)).toBe(STATUS.eyeCalm)
    expect(eyeIn({ ...EMPTY, week: { pct: 85, reset: null, pace: null } })).toBe(STATUS.eyeHot)
    expect(eyeIn({ ...EMPTY, five: { pct: 60, reset: null, pace: null } })).toBe(STATUS.eyeWarm)
    expect(eyeIn(PRESSURE)).toBe(STATUS.eyeHot)
  })
})

describe('states and notes', () => {
  test('unknown readings show "—" and an empty meter, never 0%', () => {
    const [r1 = [], r2 = []] = at(EMPTY)
    const row1 = r1.map(c => c.ch).join('')

    expect(row1.match(/—/g)?.length).toBe(3)
    expect(row1).not.toContain('0%')
    expect(r2.some(c => c.ch === '▮' && (c.fg === TOKEN.machine || c.fg === TOKEN.textBright))).toBe(false)
  })

  test('"no edits yet" at +0 −0, and the session timer when there is no cache', () => {
    expect(text(render(EMPTY, 200, ON)[0])).toContain('no edits yet')
    expect(text(render({ ...EMPTY, elapsed: '28m' }, 200, ON)[1])).toContain('session 28m')
    expect(text(render({ ...EMPTY, elapsed: '28m' }, 100, ON)[1])).toContain('28m')
    expect(text(render(EMPTY, 200, ON)[1])).not.toContain('session')
  })

  test('pressure notes at 200: compacts at 95%, ahead of pace with the reset', () => {
    const row = text(render(PRESSURE, 200, ON)[0])

    expect(row).toContain('compacts at 95%')
    expect(row).toContain('ahead of pace  ↻ 38m')
  })

  test('notes shorten step by step as the tiles narrow, labels first', () => {
    const seen = new Set<string>()

    for (let w = 210; w >= MIN_W; w--) {
      const row = text(render(PRESSURE, w, ON)[0])

      if (row.includes('ahead of pace  ↻ 38m')) seen.add('full')
      if (row.includes('ahead ↻38m')) seen.add('ahead')
      if (row.includes('↻ 38m') && !row.includes('ahead')) seen.add('reset')
      if (row.includes(' at 95%') && !row.includes('compacts')) seen.add('at 95%')
      if (row.includes('5H') || row.includes('CTX')) seen.add('short label')
    }
    expect([...seen].toSorted()).toEqual(['ahead', 'at 95%', 'full', 'reset', 'short label'])
  })

  test('narrow: no rules, no effort word, short labels, the reset only on a red budget', () => {
    const n = text(render(NORMAL, 120, ON)[0])
    const n2 = text(render(NORMAL, 120, ON)[1])
    const p = text(render(PRESSURE, 120, ON)[0])

    expect(n).not.toContain('│')
    expect(n2).not.toContain('medium')
    expect(n).toContain('CTX')
    expect(n).not.toContain('↻')
    expect(p).toContain('↻')
  })

  test('a PR that needs you replaces the changes column in its colour', () => {
    const red = render(PRESSURE, 200, ON)
    const amber = render({ ...PRESSURE, pr: { n: 7, state: 'pending' } }, 200, ON)

    expect(text(red[0])).toContain('PR #23')
    expect(red[1]?.find(s => s.t === 'changes requested')?.fg).toBe(TOKEN.err)
    expect(amber[1]?.find(s => s.t === 'pending')?.fg).toBe(TOKEN.warn)
    expect(text(red[0])).not.toContain('+9.3k')
  })
})

describe('speed', () => {
  test('the renderer itself: 1,000 renders at under 2 ms each', () => {
    const t0 = performance.now()

    for (let i = 0; i < 1000; i++) render(i % 2 === 0 ? NORMAL : PRESSURE, 90 + (i % 121), ON)

    expect((performance.now() - t0) / 1000).toBeLessThan(2)
  })

  // The warm path only: back to back, git cached. After an idle gap Bun's own start is ~103 ms on Windows
  // (docs/design/statusline.md, "Measured"), which no ceiling here could hold.
  test('a whole run of main.ts, warm and git cached, takes under 100 ms (median of 5)', () => {
    const main = join(import.meta.dir, 'main.ts')
    const stdin = Buffer.from(JSON.stringify({ workspace: { current_dir: join(import.meta.dir, '..') }, context_window: { used_percentage: 41 } }))
    const env = { ...process.env, COLUMNS: '204', GF_FIXTURE: undefined, GF_DEBUG: undefined }
    const run = (): number => {
      const t0 = performance.now()
      const r = Bun.spawnSync([process.execPath, main], { stdin, env })

      expect(r.exitCode).toBe(0)
      expect(r.stdout.toString()).toContain('CONTEXT')

      return performance.now() - t0
    }

    run()
    run()
    const times = Array.from({ length: 5 }, run).toSorted((a, b) => a - b)

    expect(times[2] ?? Number.POSITIVE_INFINITY).toBeLessThan(100)
  })
})

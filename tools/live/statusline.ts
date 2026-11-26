// Step 13: ghostframe's status line in a real session, at 200 and 100 columns. It runs this worktree's
// statusline/main.ts as the statusLine command (padding 0, refreshed every second), and GF_FIXTURE forces the
// under-pressure state by laying a JSON file over Claude Code's. Checks structure only: the two rows' place, their
// width against what Claude Code allows, no wrap and no "…", and the hot tile under pressure.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STATUS, TOKEN } from '../../hooks/shared/look/palette.ts'
import { SETTINGS } from './config.ts'
import type { Step } from './harness.ts'
import { rowText, textOf, type Capture } from './screen.ts'
import type { Session } from './session.ts'
import type { Suite } from './steps.ts'

const ROOT = join(import.meta.dirname, '..', '..').replaceAll('\\', '/')
const TILES = new Set<string>([STATUS.tileCalm, STATUS.tileWarm, STATUS.tileHot])
// Claude Code indents the status line by two cells and cuts a row longer than COLUMNS − 4 (padding 0) with "…".
const INDENT = 2
let fixture = ''

/**
 * The suite's settings: the base live settings, this worktree as the plugin, Cockpit off, and the status line command.
 * @param dir the suite's capture folder
 * @returns the settings file's path
 */
function settingsFor(dir: string): string {
  mkdirSync(dir, { recursive: true })
  fixture = join(dir, 'statusline-fixture.json').replaceAll('\\', '/')
  writeFileSync(fixture, '{}\n')

  const base: unknown = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  const baseEnv = typeof base === 'object' && base !== null && 'env' in base && typeof base.env === 'object' ? base.env : {}
  const file = join(dir, 'statusline-settings.json')

  writeFileSync(
    file,
    JSON.stringify(
      {
        ...(typeof base === 'object' ? base : {}),
        env: { ...baseEnv, CLAUDE_CODE_PLUGIN_DIRS: ROOT, GHOSTFRAME_COCKPIT: '0', GF_FIXTURE: fixture },
        statusLine: { type: 'command', command: `bun ${ROOT}/statusline/main.ts`, padding: 0, refreshInterval: 1 }
      },
      null,
      2
    )
  )

  return file
}

const pressure = (): object => {
  const now = Math.floor(Date.now() / 1000)

  return {
    context_window: { used_percentage: 88 },
    rate_limits: { five_hour: { used_percentage: 91, resets_at: now + 38 * 60 }, seven_day: { used_percentage: 76, resets_at: now + 3 * 86400 } },
    pr: { number: 23, review_state: 'changes_requested' }
  }
}

/** The row the mark's top half sits on: `▄▀▀▀▀▄` from the indent. */
const markRow = (cap: Capture): number =>
  textOf(cap)
    .split('\n')
    .findIndex(r => r.slice(INDENT, INDENT + 6) === '▄▀▀▀▀▄')

function checkRows(step: Step, cap: Capture, cols: number, state: string): void {
  const y = markRow(cap)
  const rows = textOf(cap).split('\n')
  const w = Math.min(cols - 4, 210)
  const last = INDENT + w - 1

  step.expect(`${state}: the mark's two rows are on screen`, y >= 0 && rows[y + 1]?.slice(INDENT, INDENT + 6) === '▀▀▀▀▀▀', `mark row ${y}`)
  if (y < 0) return

  const footer = rows[y + 2] ?? ''

  step.expect(
    `${state}: the two rows sit directly above the footer row, which starts in the mark's column`,
    footer.trim() !== '' && footer.search(/\S/) === INDENT && !footer.includes('▏'),
    `row ${y + 2}: “${footer.trim().slice(0, 60)}”`
  )
  step.expect(
    `${state}: the row above is the prompt's rule (nothing wrapped into it)`,
    /^─+$/.test((rows[y - 1] ?? '').trim()),
    `row ${y - 1}: “${(rows[y - 1] ?? '').trim().slice(0, 40)}”`
  )
  for (const r of [y, y + 1]) {
    const text = rowText(cap, r, 0, cols)

    step.expect(
      `${state}: row ${r - y + 1} has three tiles and no "…"`,
      (text.match(/▏/g) ?? []).length === 3 && !text.includes('…'),
      `“${text.trim().slice(-60)}”`
    )
    step.expect(
      `${state}: row ${r - y + 1}'s last tile ends on cell ${last}, the last Claude Code allows (W = ${w})`,
      TILES.has(cap.cells[r]?.[last]?.bg ?? '') && !TILES.has(cap.cells[r]?.[last + 1]?.bg ?? ''),
      `cell ${last} ${cap.cells[r]?.[last]?.bg}, cell ${last + 1} ${cap.cells[r]?.[last + 1]?.bg}`
    )
  }
}

/** Step 13: the status line, normal and under pressure. */
export const statusline: Suite = {
  id: 'S',
  widths: [200, 100],
  steps: ['13'],
  settings: settingsFor,
  async run(s: Session, stepOf: (id: string) => Step, cols: number) {
    const step = stepOf('13')

    await s.waitFor(cap => markRow(cap) >= 0, 15_000, 'the status line')
    const normal = step.keep(await s.capture('statusline-normal'))

    checkRows(step, normal, cols, 'normal')

    writeFileSync(fixture, JSON.stringify(pressure()))
    const hot = await s.waitFor(cap => cap.cells[markRow(cap)]?.some(c => c.bg === STATUS.tileHot) === true, 15_000, 'the hot tile')

    step.keep(await s.capture('statusline-pressure'))
    checkRows(step, hot, cols, 'pressure')

    const y = markRow(hot)
    const row = rowText(hot, y, 0, cols)
    const edge = hot.cells[y]?.find(c => c.ch === '▏')

    step.expect('pressure: the context tile is hot, its edge red', edge?.fg === TOKEN.err && edge.bg === STATUS.tileHot, `edge ${edge?.fg} on ${edge?.bg}`)
    // Wide, the notes show in full. Narrow, the notes shorten or drop with the room the tile has (a long repo name
    // takes it), and the alert is the red label and the reset on the red budget.
    const label = hot.cells[y]?.[row.indexOf('CTX')]
    step.expect(
      'pressure: the alert text shows',
      cols >= 144 ? row.includes('compacts at 95%') && row.includes('ahead of pace') : label?.fg === TOKEN.err && row.includes('↻'),
      `“${row.trim().slice(0, 150)}”; CTX in ${label?.fg ?? 'none'}`
    )
    step.expect("pressure: the mark's eyes are red", hot.cells[y]?.[INDENT + 1]?.bg === STATUS.eyeHot, `eye ${hot.cells[y]?.[INDENT + 1]?.bg}`)
    writeFileSync(fixture, '{}\n')
  }
}

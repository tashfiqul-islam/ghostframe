// The status line's comparison sheet (docs/design/statusline/sheet-100.png): the reference renderer
// (docs/design/statusline-preview.ts) and the renderer (statusline/render.ts), with and without the slab, in both sample
// states, at COLUMNS 100 (W 96, what Claude Code gives a padding-0 status line). Drawn into the harness's headless
// terminal and saved as a capture page; docs/assets/screenshots.ts renders it. Sample data only: no session.
//
//   bun tools/live/sheet.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Unicode11Addon } from '@xterm/addon-unicode11'
import { Terminal } from '@xterm/headless'

import { TOKEN } from '../../hooks/shared/look/palette.ts'
import { ansi } from '../../statusline/ansi.ts'
import { render } from '../../statusline/render.ts'
import { NORMAL, PRESSURE } from '../../statusline/samples.ts'
import { captureOf, htmlOf } from './screen.ts'

const COLUMNS = 100
const W = COLUMNS - 4
const ROOT = join(import.meta.dirname, '..', '..')
const PREVIEW = join(ROOT, 'docs', 'design', 'statusline-preview.ts')
const OUT = join(ROOT, 'docs', 'assets', 'captures', 'statusline-sheet-100.html')

const rgb = (hex: string): string => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)).join(';')
const dim = (text: string): string => `\x1b[38;2;${rgb(TOKEN.muted)}m${text}\x1b[0m`

/**
 * The reference renderer's two rows: they follow its second rule (label, rule, prompt, rule, row, row).
 * @param state the sample state
 * @returns the two rows, as the reference printed them
 */
function reference(state: 'normal' | 'pressure'): string[] {
  const r = Bun.spawnSync(['bun', PREVIEW, '--width', String(W), '--state', state], { stdout: 'pipe', stderr: 'pipe' })

  if (r.exitCode !== 0) throw new Error(`the reference renderer failed: ${r.stderr.toString()}`)
  const lines = r.stdout.toString().split('\n')
  const rules = lines.flatMap((l, i) => (l.includes('─'.repeat(20)) ? [i] : []))
  const at = rules[1]

  if (at === undefined) throw new Error('the reference renderer printed no second rule')

  return [lines[at + 1] ?? '', lines[at + 2] ?? '']
}

const lines: string[] = []

for (const [state, facts, title] of [
  ['normal', NORMAL, 'normal'],
  ['pressure', PRESSURE, 'under pressure']
] as const) {
  const head = `── ${title} · COLUMNS ${COLUMNS} · W ${W} `

  lines.push(dim(head + '─'.repeat(COLUMNS - 4 - head.length)))
  lines.push(dim('reference renderer (sample data, slab):'), ...reference(state))
  lines.push(dim('renderer, GF_SLAB=1:'), ...render(facts, W, { icons: true, slab: true }).map(row => ansi(row, 'truecolor')))
  lines.push(dim('renderer, as installed (no slab):'), ...render(facts, W, { icons: true, slab: false }).map(row => ansi(row, 'truecolor')))
  lines.push('')
}

const term = new Terminal({ cols: COLUMNS, rows: lines.length, scrollback: 0, allowProposedApi: true })

term.loadAddon(new Unicode11Addon())
term.unicode.activeVersion = '11'
await new Promise<void>(done => term.write(lines.join('\r\n'), done))
writeFileSync(OUT, htmlOf(captureOf(term, 'statusline-sheet-100')))
console.log(`wrote ${OUT}`)

// Renders the README's demo, readme-demo.webp, from the frames step 15 of the live checks records (tools/live/demo.ts):
// one real turn at 144 × 40, each changed screen saved as an .html page with the time it was seen. Each frame is drawn
// as screenshots.ts draws a capture (the same font and cell size), and Claude Code's welcome header (its logo, the
// model and plan, the project's path) is blanked. The turn plays sped up to PLAY_MS, each frame keeping its share of
// the real time between frames, and the last frame holds for HOLD_MS before the loop starts again.
//
//   cd docs/assets && bun install --frozen-lockfile && bun demo.ts <LIVE_OUT>/<run>/D144/demo
//
// Like screenshots.ts it drives an installed Chrome (SHOTS_CHANNEL to choose another) and needs the font installed
// (JetBrainsMono Nerd Font Mono, or SHOTS_FONT). DEMO_SCALE sets the pixel ratio (default 2).
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright-core'
import sharp from 'sharp'

const here = import.meta.dirname
const channel = process.env['SHOTS_CHANNEL'] ?? 'chrome'
const font = process.env['SHOTS_FONT'] ?? 'JetBrainsMono NFM'
const scale = Number(process.env['DEMO_SCALE'] ?? '2')
const PLAY_MS = 11_000
const HOLD_MS = 2500
const MIN_MS = 40
const OUT = join(here, 'readme-demo.webp')

const [dir] = process.argv.slice(2)

if (dir === undefined) {
  console.error('usage: bun demo.ts <LIVE_OUT>/<run>/D144/demo')
  process.exit(2)
}

type Frame = { file: string; at: number }
const isFrame = (f: unknown): f is Frame =>
  typeof f === 'object' && f !== null && 'file' in f && typeof f.file === 'string' && 'at' in f && typeof f.at === 'number'
const parsed: unknown = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8'))

if (!Array.isArray(parsed) || !parsed.every(isFrame)) throw new Error(`${dir}/frames.json: not a list of { file, at }`)
const frames: Frame[] = parsed
const first = frames[0]
const last = frames.at(-1)

if (first === undefined || last === undefined || frames.length < 2) throw new Error(`${dir}: fewer than two frames`)
const recorded = last.at - first.at
const delays = frames.map((f, i) => {
  const next = frames[i + 1]

  return next === undefined ? HOLD_MS : Math.max(MIN_MS, Math.round(((next.at - f.at) / recorded) * PLAY_MS))
})

const browser = await chromium.launch({ channel })
const shots: Buffer[] = []
// Once a turn header has been on screen, the welcome above it has scrolled away with it.
let hasSeenHeader = false

try {
  const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  for (const frame of frames) {
    await page.goto(pathToFileURL(join(dir, frame.file)).href)
    await page.addStyleTag({
      // As screenshots.ts: 14.4px of JetBrains Mono is one 19px cell tall, so block and box glyphs tile with no gaps.
      content: `h1 { display: none } body { padding: 20px } .screen { font-family: '${font}', 'JetBrainsMono Nerd Font Mono', monospace; font-size: 14.4px; white-space: normal } .screen div { white-space: pre; height: 19px }`
    })
    await page.evaluate(async () => document.fonts.ready)
    if (!(await page.evaluate(f => document.fonts.check(`12px '${f}'`), font))) {
      throw new Error(`the font "${font}" is not installed; install it or set SHOTS_FONT`)
    }
    const blanked = await page.evaluate(seen => {
      const rows = [...document.querySelectorAll('.screen > div')].map(div =>
        [...div.querySelectorAll('span')].map(span => ({ span, ch: span.textContent ?? '', w: span.style.width === '2ch' ? 2 : 1 }))
      )
      const textOf = (row: { ch: string }[]): string => row.map(c => c.ch).join('')
      const blank = (row: { span: HTMLSpanElement; w: number }[], before: number): void => {
        let col = 0

        for (const c of row) {
          if (col < before) {
            c.span.textContent = ' '
            c.span.style.cssText = c.w === 2 ? 'width:2ch' : ''
          }
          col += c.w
        }
      }
      const header = rows.findIndex(row => /\d\d:\d\d:\d\d ◆ {2}TURN \d/.test(textOf(row)))

      if (header < 0 && seen) return 'scrolled'
      if (header < 0) {
        // Before the turn starts the conversation is empty: everything above the prompt's top rule is the welcome.
        const rule = rows.findIndex(row => /^─{40,}$/.test(textOf(row).trim()))

        if (rule < 0) return 'none'
        for (const row of rows.slice(0, rule)) blank(row, Infinity)

        return 'welcome'
      }
      // The divider: the column where `│` stands on the most rows, right of the left's spine.
      const counts = new Map<number, number>()

      for (const row of rows) {
        let col = 0

        for (const c of row) {
          if (c.ch === '│' && col > 40) counts.set(col, (counts.get(col) ?? 0) + 1)
          col += c.w
        }
      }
      const divider = [...counts].toSorted((a, b) => b[1] - a[1])[0]

      for (const row of rows.slice(0, header)) blank(row, divider === undefined ? Infinity : divider[0])

      return 'header'
    }, hasSeenHeader)

    if (blanked === 'header') hasSeenHeader = true
    if (blanked === 'none') throw new Error(`${frame.file}: no turn header and no prompt rule, so the welcome header cannot be blanked`)
    const box = await page.locator('.screen').boundingBox()

    if (box === null) throw new Error(`${frame.file}: no screen on the page`)
    // The screen and a 20px margin, the same on every side.
    shots.push(await page.screenshot({ clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } }))
  }
} finally {
  await browser.close()
}

await sharp(shots, { join: { animated: true } })
  .webp({ delay: delays, loop: 0, quality: 82, effort: 6 })
  .toFile(OUT)
const total = delays.reduce((a, b) => a + b, 0)

console.log(`wrote ${OUT}: ${frames.length} frames, ${(total / 1000).toFixed(1)} s a loop, ${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`)

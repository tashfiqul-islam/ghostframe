// Renders the README's demo, readme-demo.webp, from the frames step 15 of the live checks records (tools/live/demo.ts):
// one real turn at 144 × 40, each changed screen saved as an .html page with the time it was seen. Each frame is drawn
// as screenshots.ts draws a capture (the same font and cell size), and Claude Code's welcome header (its logo, the
// model and plan, the project's path) is blanked. The turn plays sped up to PLAY_MS, each frame keeping its share of
// the real time between frames, and the last frame holds for HOLD_MS before the loop starts again.
//
//   cd docs/assets && bun install --frozen-lockfile && bun demo.ts <LIVE_OUT>/<run>/D144/demo
//
// DEMO_VIEW=phone makes the phone version from the same frames instead: readme-demo-phone.webp and the still
// readme-demo-phone.png, cut to the left 32 columns of Cockpit's pane (its tabs, the turn's card and its steps) from
// the frame the pane docks, at 3x. A README column on a 390px phone is 324px wide, so 32 columns there draw the text at
// about 16px, the size of the README's own text; the steps' outcomes at the pane's right edge are cut off.
//
// Like screenshots.ts it drives an installed Chrome (SHOTS_CHANNEL to choose another) and needs the font installed
// (JetBrainsMono Nerd Font Mono, or SHOTS_FONT). DEMO_SCALE sets the pixel ratio (default 2, or 3 for the phone).
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright-core'
import sharp from 'sharp'

const here = import.meta.dirname
const channel = process.env['SHOTS_CHANNEL'] ?? 'chrome'
const font = process.env['SHOTS_FONT'] ?? 'JetBrainsMono NFM'
const isPhone = process.env['DEMO_VIEW'] === 'phone'
const scale = Number(process.env['DEMO_SCALE'] ?? (isPhone ? '3' : '2'))
const PLAY_MS = isPhone ? 10_000 : 11_000
const HOLD_MS = 2500
const MIN_MS = 40
const OUT = join(here, isPhone ? 'readme-demo-phone.webp' : 'readme-demo.webp')
const STILL = join(here, 'readme-demo-phone.png')
// The phone's cut, in cells of the 144 × 40 screen: the pane's left 32 columns, its rows from the tabs to the steps.
const PHONE = { col: 81, cols: 32, row: 1, rows: 17, margin: 4 }
const ROW_PX = 19

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
const browser = await chromium.launch({ channel })
const shots: { png: Buffer; at: number }[] = []
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
    // The phone's cut starts once the pane has docked: before it, that part of the screen is empty.
    if (isPhone && !hasSeenHeader) continue
    const cell = box.width / 144
    const m = PHONE.margin
    const clip = isPhone
      ? { x: box.x + PHONE.col * cell - m, y: box.y + PHONE.row * ROW_PX - m, width: PHONE.cols * cell + 2 * m, height: PHONE.rows * ROW_PX + 2 * m }
      : // The screen and a 20px margin, the same on every side.
        { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 }

    shots.push({ png: await page.screenshot({ clip }), at: frame.at })
  }
} finally {
  await browser.close()
}

const start = shots[0]
const end = shots.at(-1)

if (start === undefined || end === undefined || shots.length < 2) throw new Error(`${dir}: fewer than two frames to animate`)
const recorded = end.at - start.at
const delays = shots.map((s, i) => {
  const next = shots[i + 1]

  return next === undefined ? HOLD_MS : Math.max(MIN_MS, Math.round(((next.at - s.at) / recorded) * PLAY_MS))
})

await sharp(
  shots.map(s => s.png),
  { join: { animated: true } }
)
  .webp({ delay: delays, loop: 0, quality: 82, effort: 6 })
  .toFile(OUT)
const total = delays.reduce((a, b) => a + b, 0)

console.log(`wrote ${OUT}: ${shots.length} frames, ${(total / 1000).toFixed(1)} s a loop, ${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`)
if (isPhone) {
  // The still for reduced motion: the finished turn, the same cut.
  await sharp(end.png).png({ compressionLevel: 9 }).toFile(STILL)
  console.log(`wrote ${STILL}: ${(statSync(STILL).size / 1024).toFixed(0)} KB`)
}

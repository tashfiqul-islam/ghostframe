// Renders the README's screenshots: each harness capture in captures/ (an .html page that draws every cell in its
// colours, written by tools/live) becomes a PNG beside this file, at 2x. Only the screen is drawn, not the capture's
// title. The cells are drawn in a Nerd Font so the status line's icons show, as they do in a terminal set up for them.
//
//   cd docs/assets && bun install --frozen-lockfile && bun screenshots.ts
//
// It drives an installed Chrome (playwright-core downloads no browser), or SHOTS_CHANNEL (msedge, chrome-beta…) to
// choose another. The font must be installed: JetBrainsMono Nerd Font Mono, or SHOTS_FONT to choose.
//
// Claude Code's welcome header (its logo, the model and plan, the project's path) is the engine's, not ghostframe's,
// and says who ran the session. Every cell left of the pane's divider above the first turn header is blanked, so
// the left starts at the conversation. The pane beside it is untouched. A capture with no turn header or no divider
// fails, rather than being drawn with the header.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright-core'

const here = import.meta.dirname
const captures = join(here, 'captures')
const channel = process.env['SHOTS_CHANNEL'] ?? 'chrome'
const font = process.env['SHOTS_FONT'] ?? 'JetBrainsMono NFM'
const pages = readdirSync(captures).filter(f => f.endsWith('.html'))

if (pages.length === 0) throw new Error(`no .html captures in ${captures}`)

const browser = await chromium.launch({ channel })

try {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1800, height: 1200 } })
  const page = await context.newPage()

  for (const file of pages) {
    await page.goto(pathToFileURL(join(captures, file)).href)
    await page.addStyleTag({
      // 14.4px of JetBrains Mono is one 19px cell tall (its line is 1.32 em), so block and box glyphs tile with no gaps.
      // Captures taken before tools/live/screen.ts joined its rows with no newline drew an empty line after each row.
      content: `h1 { display: none } body { padding: 20px } .screen { font-family: '${font}', 'JetBrainsMono Nerd Font Mono', monospace; font-size: 14.4px; white-space: normal } .screen div { white-space: pre; height: 19px }`
    })
    await page.evaluate(async () => document.fonts.ready)
    const masked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.screen > div')].map(div =>
        [...div.querySelectorAll('span')].map(span => ({ span, ch: span.textContent ?? '', w: span.style.width === '2ch' ? 2 : 1 }))
      )
      const textOf = (row: { ch: string }[]): string => row.map(c => c.ch).join('')
      const first = rows.findIndex(row => /\d\d:\d\d:\d\d ◆ {2}TURN \d/.test(textOf(row)))
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

      if (first < 0 || divider === undefined || divider[1] < rows.length / 2) return { first, divider: divider?.[0] ?? -1 }
      for (const row of rows.slice(0, first)) {
        let col = 0

        for (const c of row) {
          if (col < divider[0]) {
            c.span.textContent = ' '
            c.span.style.cssText = c.w === 2 ? 'width:2ch' : ''
          }
          col += c.w
        }
      }

      return { first, divider: divider[0] }
    })

    if (masked.first < 0 || masked.divider < 0) throw new Error(`${file}: no turn header or no pane divider, so the welcome header cannot be blanked`)
    const isFont = await page.evaluate(f => document.fonts.check(`12px '${f}'`), font)

    if (!isFont) throw new Error(`the font "${font}" is not installed; install it or set SHOTS_FONT`)
    const out = join(here, file.replace(/\.html$/, '.png'))

    await page.locator('body').screenshot({ path: out })
    console.log(`wrote ${out}`)

    // The hero's status line on its own: its two rows, from the mark (`▄▀▀▀▀▄` two cells in) across the screen.
    if (file === 'readme-hero.html') {
      const rows = page.locator('.screen > div')
      const texts = await rows.allTextContents()
      const mark = texts.findIndex(t => t.slice(2, 8) === '▄▀▀▀▀▄')

      if (mark < 0) throw new Error(`${file}: no status line (its mark's top row) to cut out`)
      const top = await rows.nth(mark).boundingBox()
      const bottom = await rows.nth(mark + 1).boundingBox()

      if (top === null || bottom === null) throw new Error(`${file}: the status line's rows are not on the page`)
      const line = join(here, 'readme-statusline.png')
      const pad = 12

      // Exactly the two rows high: the prompt's rule sits right above them and the mode line right below.
      await page.screenshot({ path: line, clip: { x: top.x - pad, y: top.y, width: top.width + 2 * pad, height: bottom.y + bottom.height - top.y } })
      console.log(`wrote ${line}`)
    }
  }
} finally {
  await browser.close()
}

// Renders the README's screenshots: each harness capture in captures/ (an .html page that draws every cell in its
// colours, written by tools/live) becomes a PNG beside this file, at 2x. Only the screen is drawn, not the capture's
// title. The cells are drawn in a Nerd Font so the status line's icons show, as they do in a terminal set up for them.
//
//   cd docs/assets && bun install --frozen-lockfile && bun screenshots.ts
//
// It drives an installed Chrome (playwright-core downloads no browser), or SHOTS_CHANNEL (msedge, chrome-beta…) to
// choose another. The font must be installed: JetBrainsMono Nerd Font Mono, or SHOTS_FONT to choose.
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
    const isFont = await page.evaluate(f => document.fonts.check(`12px '${f}'`), font)

    if (!isFont) throw new Error(`the font "${font}" is not installed; install it or set SHOTS_FONT`)
    const out = join(here, file.replace(/\.html$/, '.png'))

    await page.locator('body').screenshot({ path: out })
    console.log(`wrote ${out}`)
  }
} finally {
  await browser.close()
}

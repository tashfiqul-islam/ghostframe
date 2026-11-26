// Renders the design diagrams in diagrams/ (self-contained HTML, drawn with the diagram-design skill's `ghostframe`
// profile, see /.diagram-design) to PNGs beside them at 2x: only the <svg>, as the skill's export does. GitHub's <img>
// loads no web fonts, so a PNG keeps the diagrams' typography where an exported SVG would not.
//
//   cd docs/assets && bun install --frozen-lockfile && bun diagrams.ts
//
// It drives an installed Chrome (playwright-core downloads no browser), or SHOTS_CHANNEL to choose another. The fonts
// load from Google Fonts, so it needs the network.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright-core'

const dir = join(import.meta.dirname, 'diagrams')
const pages = readdirSync(dir).filter(f => f.endsWith('.html'))
if (pages.length === 0) throw new Error(`no diagrams in ${dir}`)

const browser = await chromium.launch({ channel: process.env['SHOTS_CHANNEL'] ?? 'chrome' })

try {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } })
  for (const file of pages) {
    await page.goto(pathToFileURL(join(dir, file)).href, { waitUntil: 'networkidle' })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    // Each family the diagrams draw with must have loaded; a fallback face would change every measured width.
    const missing = await page.evaluate(() =>
      ["600 12px 'Hanken Grotesk'", "9px 'Geist Mono'", "italic 14px 'Instrument Serif'"].filter(f => !document.fonts.check(f))
    )
    if (missing.length > 0) throw new Error(`${file}: fonts not loaded: ${missing.join(', ')}`)
    const out = join(dir, file.replace(/\.html$/, '.png'))
    await page.locator('svg').first().screenshot({ path: out })
    console.log(`wrote ${out}`)
  }
} finally {
  await browser.close()
}

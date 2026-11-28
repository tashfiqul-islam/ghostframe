import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { builtPages } from '../build/page-text/pages'
import { FONT_FILES, GLYPH_FACE_POINTS } from '../build/fonts/glyphs'

const site = join(import.meta.dirname, '..')
const coverage: Record<string, { codePoints: number[] }> = JSON.parse(readFileSync(join(site, 'public', 'fonts', 'coverage.json'), 'utf8'))
const held = (file: string) => new Set(coverage[file]!.codePoints)
const sets: Record<string, Set<number>> = { 'Hanken Grotesk': held(FONT_FILES['Hanken Grotesk']), 'JetBrains Mono': held(FONT_FILES['JetBrains Mono']) }
// The glyph face joins the mono family by unicode-range, so those four code points are the mono family's too.
for (const point of GLYPH_FACE_POINTS) if (!held(FONT_FILES.glyphs).has(point)) throw new Error(`U+${point.toString(16)} is not in the glyph face`)
for (const point of GLYPH_FACE_POINTS) sets['JetBrains Mono']!.add(point)

for (const path of builtPages(join(site, 'dist'))) {
  test(`${path} sets every character in the font that holds it`, async ({ page }) => {
    await page.goto(path)
    // Every rendered text node with the first family of its computed font-family; text that is not displayed sets no glyph.
    const runs = await page.evaluate(() => {
      const found: { text: string; family: string }[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement
        const text = node.textContent ?? ''
        if (!element || !text.trim() || !element.checkVisibility()) continue
        const family = getComputedStyle(element)
          .fontFamily.split(',')[0]!
          .trim()
          .replace(/^["']|["']$/g, '')
        found.push({ text, family })
      }
      return found
    })
    const failures = new Set<string>()
    for (const { text, family } of runs) {
      const set = sets[family]
      for (const char of text) {
        if (/\s/u.test(char)) continue
        const point = char.codePointAt(0)!
        if (!set?.has(point))
          failures.add(`${path}: ${char} U+${point.toString(16).toUpperCase().padStart(4, '0')} is not in ${family}${set ? '' : ' (not a site font)'}`)
      }
    }
    expect([...failures]).toEqual([])
    expect(runs.length).toBeGreaterThan(0)
  })
}

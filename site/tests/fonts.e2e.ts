import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { builtPages } from '../build/page-text/pages'
import { FONT_FILES, GLYPH_FACE_POINTS } from '../build/fonts/glyphs'

const site = join(import.meta.dirname, '..')
const coverage: Record<string, { codePoints: number[] }> = JSON.parse(readFileSync(join(site, 'public', 'fonts', 'coverage.json'), 'utf8'))
const held = (file: string) => new Set(coverage[file]!.codePoints)
const sets: Record<string, Set<number>> = { 'Hanken Grotesk': held(FONT_FILES['Hanken Grotesk']), 'JetBrains Mono': held(FONT_FILES['JetBrains Mono']) }
const glyphs = held(FONT_FILES.glyphs)
for (const point of GLYPH_FACE_POINTS) if (!glyphs.has(point)) throw new Error(`U+${point.toString(16)} is not in the glyph face`)
const GLYPH_FAMILY = 'Julia Glyphs'

test('--mono lists the glyph family right after JetBrains Mono', async ({ page }) => {
  await page.goto('/')
  const mono = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mono'))
  const families = mono.split(',').map(family => family.trim().replace(/^["']|["']$/g, ''))
  expect(families.slice(0, 2)).toEqual(['JetBrains Mono', GLYPH_FAMILY])
})

for (const path of builtPages(join(site, 'dist'))) {
  test(`${path} sets every character in the font that holds it`, async ({ page }) => {
    await page.goto(path)
    // Every rendered text node with the first family of its computed font-family; text that is not displayed sets no glyph.
    const runs = await page.evaluate(() => {
      const found: { text: string; family: string; stack: string[] }[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement
        const text = node.textContent ?? ''
        if (!element || !text.trim() || !element.checkVisibility()) continue
        const stack = getComputedStyle(element)
          .fontFamily.split(',')
          .map(name => name.trim().replace(/^["']|["']$/g, ''))
        found.push({ text, family: stack[0]!, stack })
      }
      return found
    })
    const failures = new Set<string>()
    for (const { text, family, stack } of runs) {
      const set = sets[family]
      const drawn = stack.includes(GLYPH_FAMILY) ? glyphs : new Set<number>()
      for (const char of text) {
        if (/\s/u.test(char)) continue
        const point = char.codePointAt(0)!
        if (!set?.has(point) && !drawn.has(point))
          failures.add(`${path}: ${char} U+${point.toString(16).toUpperCase().padStart(4, '0')} is not in ${family}${set ? '' : ' (not a site font)'}`)
      }
    }
    expect([...failures]).toEqual([])
    expect(runs.length).toBeGreaterThan(0)
  })
}

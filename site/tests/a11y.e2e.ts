import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { builtPages } from '../build/page-text/pages'

const pages = builtPages(join(import.meta.dirname, '..', 'dist'))

for (const path of pages) {
  test(`${path} has no axe violation at WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(path)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })

  test(`${path} runs no animation under reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(path)
    const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)
    expect(running).toBe(0)
  })
}

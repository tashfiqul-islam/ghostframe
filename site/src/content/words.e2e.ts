import { expect, test } from '@playwright/test'

import { words } from './words'

const { text: long, short } = words.demo.lede

test.describe('a string with a short variant for phones', () => {
  test('reads the full string on a wide screen, and only that one', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByText(long)).toBeVisible()
    await expect(page.getByText(short)).toBeHidden()
    expect(await page.locator('[data-demo-lede]').ariaSnapshot()).toBe(`- paragraph: ${long}`)
  })

  test('reads the short string on a phone, and only that one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByText(short)).toBeVisible()
    await expect(page.getByText(long)).toBeHidden()
    expect(await page.locator('[data-demo-lede]').ariaSnapshot()).toBe(`- paragraph: ${short}`)
  })
})

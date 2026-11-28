import { expect, test } from '@playwright/test'

import { siteData } from '../../build/site-data/site-data'

const command = siteData().facts.commands.find(c => c.startsWith('/plugin install'))

test.describe('the copy button', () => {
  test('is idle until pressed', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Copy the command' })).toHaveText('COPY')
  })

  test('copies the command, says so, and returns to idle after 1.2 s', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    const button = page.getByRole('button', { name: 'Copy the command' })
    await button.click()
    await expect(button).toHaveText('COPIED ✓')
    await expect(page.getByRole('status')).toHaveText('Copied to the clipboard.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command)
    await expect(button).toHaveText('COPY', { timeout: 2000 })
  })

  test('selects the command when the clipboard refuses, and says how to copy it', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Copy the command' }).click()
    await expect(page.getByRole('button', { name: 'Copy the command' })).toHaveText('SELECTED')
    await expect(page.getByRole('status')).toHaveText('The clipboard is blocked. The command is selected; copy it with your keyboard.')
    expect(await page.evaluate(() => getSelection()?.toString())).toBe(command)
  })
})

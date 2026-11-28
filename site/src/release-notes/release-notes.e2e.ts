import { expect, test } from '@playwright/test'
import { releaseNotesPage } from '../../build/release-notes/releases'
import { siteData } from '../../build/site-data/site-data'
import { words } from '../content/words'

const { releases } = siteData()
const model = releaseNotesPage(releases)
const latest = releases[0]!.version

test('the release notes show each release with one filter chip per group, counted', async ({ page }) => {
  await page.goto('/releases/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(words.releaseNotes.heading)
  await expect(page.locator(`[id="v${latest}"]`).getByRole('heading', { level: 2 })).toHaveText(latest)
  const shown = page.getByRole('group', { name: words.releaseNotes.filters }).getByRole('button')
  await expect(shown).toHaveText(model.chips.map(c => `${c.label} ${c.count}`))
})

test('the release notes link their Atom feed, which answers as Atom', async ({ page, request }) => {
  await page.goto('/releases/')
  const href = await page.locator('link[rel="alternate"][type="application/atom+xml"]').getAttribute('href')
  expect(href).toBe(model.feed)
  const response = await request.get(model.feed)
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain(`<title>ghostframe ${latest}</title>`)
})

import { expect, test } from '@playwright/test'
import { words } from '../src/content/words'
import { origin } from '../src/site'

test('the landing page names the product and its tagline', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(words.landing.title)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ghostframe')
})

test('a missing page answers with a real 404 status', async ({ page }) => {
  const response = await page.goto('/no-such-page/')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(words.notFound.heading)
})

test('llms.txt is served as UTF-8 text, opens with the H1 and links the landing page on the site origin', async ({ request }) => {
  const response = await request.get('/llms.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8')
  const text = await response.text()
  expect(text.startsWith(`# ghostframe\n\n> ${words.landing.description}\n`)).toBe(true)
  expect(text).toContain(`](${origin}/)`)
})

test('every page names its canonical URL on the site origin', async ({ page }) => {
  await page.goto('/releases/')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/releases/`)
})

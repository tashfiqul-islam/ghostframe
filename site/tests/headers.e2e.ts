import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const written = /Content-Security-Policy: (.+)/.exec(readFileSync(join(import.meta.dirname, '..', 'dist', '_headers'), 'utf8'))?.[1]

test('pages are served under the CSP the build wrote, which allows nothing inline by name', async ({ request }) => {
  const response = await request.get('/')
  expect(response.headers()['content-security-policy']).toBe(written)
  expect(written).not.toContain('unsafe-inline')
})

test('the page runs under that CSP without a violation', async ({ page }) => {
  const violations: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') violations.push(message.text())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Copy the command' }).click()
  expect(violations).toEqual([])
})

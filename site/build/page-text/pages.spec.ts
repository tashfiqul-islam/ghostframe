import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { builtPages } from './pages'

test('lists every built page by the URL it is served at, the 404 by its file', () => {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'))
  for (const file of ['index.html', 'releases/index.html', '404.html', 'releases/feed.xml', '_astro/page.abc.js']) {
    mkdirSync(dirname(join(dist, file)), { recursive: true })
    writeFileSync(join(dist, file), '')
  }
  expect(builtPages(dist)).toEqual(['/', '/404.html', '/releases/'])
})

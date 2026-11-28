// `bun build/brand/copy.ts`, run before the build from site/: writes the brand files the site serves into
// public/brand, byte for byte as site data read them (ADR 0018). public/brand is generated and gitignored; build/checks
// holds the bytes equal.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { siteData } from '../site-data/site-data'

for (const [path, bytes] of siteData().brand) {
  const to = join(process.cwd(), 'public', 'brand', path)
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, bytes)
}

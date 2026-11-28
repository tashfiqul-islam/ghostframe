import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { siteHeaders } from './headers'

function distWith(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, path)), { recursive: true })
    writeFileSync(join(dist, path), content)
  }
  return dist
}
const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`

describe('siteHeaders', () => {
  const dist = distWith({
    'index.html': '<style>a{color:red}</style><script type="module">import "./x"</script><script src="/_astro/a.js"></script>',
    '404.html': '<style>b{color:blue}</style>'
  })
  const headers = siteHeaders(dist)
  const csp = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? ''

  test('allows each inline script and style by its hash, and nothing inline otherwise', () => {
    expect(csp).toContain(`script-src 'self' ${sha('import "./x"')}`)
    expect(csp).toContain(`style-src 'self' ${sha('a{color:red}')} ${sha('b{color:blue}')}`)
    expect(csp).not.toContain('unsafe-inline')
  })

  test('refuses framing, plugins and foreign bases', () => {
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  // Cloudflare joins a header two rules both set, so /* sets no Cache-Control: the assets default already revalidates.
  test('caches hashed build files for a year and leaves everything else on the revalidating default', () => {
    expect(headers).toContain('/_astro/*\n  Cache-Control: public, max-age=31536000, immutable')
    expect(headers.match(/Cache-Control/g)).toHaveLength(1)
  })

  test('sends the other security headers on every response', () => {
    for (const h of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy: same-origin',
      'Permissions-Policy: camera=(), microphone=(), geolocation=()'
    ]) {
      expect(headers).toContain(`  ${h}`)
    }
  })

  test('fails when the CSP outgrows one _headers line (2,000 characters)', () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`p${i}.html`, `<script type="module">s${i}</script>`]))
    expect(() => siteHeaders(distWith(many))).toThrow(/the CSP is \d+ characters; a _headers line holds 2,000/)
  })
})

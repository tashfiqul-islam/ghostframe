// The site's response headers, written to dist/_headers after the build (ADR 0020): a CSP that allows each inline
// script and style by its hash and nothing else inline, year-long caching for hashed build files, and the other
// security headers. HSTS is set on the zone, not here, so it also covers the HTTP-to-HTTPS redirect.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { builtPages } from '../page-text/pages'

const LINE_LIMIT = 2000

export function siteHeaders(dist: string): string {
  const scripts = new Set<string>()
  const styles = new Set<string>()
  for (const page of builtPages(dist)) {
    const html = readFileSync(join(dist, page.endsWith('/') ? `${page}index.html` : page), 'utf8')
    for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) scripts.add(hash(body!))
    for (const [, body] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.add(hash(body!))
  }
  const csp = [
    "default-src 'self'",
    ["script-src 'self'", ...scripts].join(' '),
    ["style-src 'self'", ...styles].join(' '),
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
  const line = `  Content-Security-Policy: ${csp}`
  if (line.length > LINE_LIMIT) throw new Error(`the CSP is ${line.length} characters; a _headers line holds 2,000`)
  return [
    '/*',
    line,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    // Cloudflare joins a header two rules both set, so only hashed files get a Cache-Control; the rest keep the
    // assets default, which revalidates.
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    ''
  ].join('\n')
}

function hash(body: string): string {
  return `'sha256-${createHash('sha256').update(body).digest('base64')}'`
}

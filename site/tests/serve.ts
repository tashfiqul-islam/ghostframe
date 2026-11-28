// The built site, served the way Workers static assets serves it, for the browser tests and Lighthouse: gzip, the
// 404 page with a 404 status, and the headers in dist/_headers, so the tests run under the CSP that ships.
// Usage: bun tests/serve.ts <distDir> <port>. GET /__health answers "ok" once the server is up.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const [dirArg, portArg] = Bun.argv.slice(2)
if (!dirArg || !portArg) throw new Error('usage: bun tests/serve.ts <distDir> <port>')
const dir: string = dirArg

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/atom+xml; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.xml', '.json', '.txt'])

interface Rule {
  pattern: string
  headers: [string, string][]
}

/** The rules of a _headers file: a path pattern on its own line, then indented `Name: value` lines. */
function readRules(path: string): Rule[] {
  if (!existsSync(path)) throw new Error(`no ${path}: run the build first`)
  const rules: Rule[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    if (!line.startsWith(' ')) rules.push({ pattern: line.trim(), headers: [] })
    else {
      const at = line.indexOf(':')
      rules.at(-1)?.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()])
    }
  }
  return rules
}

const rules = readRules(join(dir, '_headers'))
const matches = (pattern: string, path: string) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern)

function resolve(pathname: string): string | undefined {
  const p = join(dir, decodeURIComponent(pathname))
  for (const c of [p, join(p, 'index.html'), `${p}.html`]) if (existsSync(c) && statSync(c).isFile()) return c
  return undefined
}

Bun.serve({
  port: Number(portArg),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/__health') return new Response('ok')
    let file = resolve(url.pathname)
    let status = 200
    if (!file) {
      file = resolve('/404.html')
      status = 404
    }
    if (!file) throw new Error('dist has no 404.html')
    const ext = extname(file)
    const headers = new Headers({ 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' })
    for (const rule of rules) if (matches(rule.pattern, url.pathname)) for (const [name, value] of rule.headers) headers.set(name, value)
    const body = await Bun.file(file).bytes()
    if (COMPRESSIBLE.has(ext) && (req.headers.get('accept-encoding') ?? '').includes('gzip')) {
      headers.set('content-encoding', 'gzip')
      return new Response(Bun.gzipSync(body, { level: 9 }), { status, headers })
    }
    return new Response(body, { status, headers })
  }
})
console.log(`serving ${dir} on ${portArg}`)

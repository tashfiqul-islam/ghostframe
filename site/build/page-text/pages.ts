// The built pages, by the URL each is served at: `index.html` files at their folder with a trailing slash, any other
// HTML file (the 404) at its own path. Tests that visit every page take the list from here, never by hand.
import { readdirSync } from 'node:fs'

export function builtPages(dist: string): string[] {
  return readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .map(path => path.replaceAll('\\', '/'))
    .filter(path => path.endsWith('.html'))
    .map(path => (path === 'index.html' ? '/' : path.endsWith('/index.html') ? `/${path.slice(0, -'index.html'.length)}` : `/${path}`))
    .toSorted()
}

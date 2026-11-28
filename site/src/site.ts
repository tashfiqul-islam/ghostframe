// Where the site lives: the one fact about it the repository cannot supply. Canonical URLs, the sitemap, the feed and
// the social tags all read `origin`; the build fails while ORIGIN is empty.

// shortcut: the workers.dev address stands in until the domain is chosen; set the real origin here then.
const ORIGIN = 'https://ghostframe.example.workers.dev'

export function siteOrigin(value: string): string {
  if (value === '') throw new Error("set the site's origin in site/src/site.ts")
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error(`the site origin must be https://, not ${JSON.stringify(value)}`)
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`the site origin is scheme and host only, not ${JSON.stringify(value)}`)
  return url.origin
}

export const origin = siteOrigin(ORIGIN)

// The design tokens live in one file, src/styles/tokens.css. These read it, so tests and build checks see the same
// values the browser does, and nothing else holds a copy.

const declaration = /(--[\w-]+)\s*:\s*([^;}]+)/g
const use = /var\(\s*(--[\w-]+)/g

/** Every custom property declared in `css`, name to value (lower-cased, trimmed). Later declarations win. */
export function readTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const [, name, value] of stripComments(css).matchAll(declaration)) tokens.set(name!, value!.trim().toLowerCase())
  return tokens
}

/** The custom properties `css` uses with var() that neither `tokens` nor `css` itself declares, in order of first use. */
export function undeclaredTokens(css: string, tokens: Map<string, string>): string[] {
  const local = readTokens(css)
  const missing = new Set<string>()
  for (const [, name] of stripComments(css).matchAll(use)) if (!tokens.has(name!) && !local.has(name!)) missing.add(name!)
  return [...missing]
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// `(max-width: 767px)`, `(min-width: 1024px)`, `(width <= 767px)`, `(width > 900px)`
const mediaWidth = /\((?:(?:max|min)-width\s*:\s*|width\s*[<>]=?\s*)(\d+(?:\.\d+)?px)\)/g

/**
 * The media-query widths in `css` that no `--bp-*` token declares, in order of first use. Custom properties cannot be
 * used inside `@media`, so tokens.css records each breakpoint as a token and this holds every query to them.
 */
export function undeclaredBreakpoints(css: string, tokens: Map<string, string>): string[] {
  const declared = new Set([...tokens].filter(([name]) => name.startsWith('--bp-')).map(([, value]) => value))
  const missing = new Set<string>()
  for (const query of stripComments(css).matchAll(/@media[^{]*/g)) {
    for (const [, width] of query[0].matchAll(mediaWidth)) if (!declared.has(width!)) missing.add(width!)
  }
  return [...missing]
}

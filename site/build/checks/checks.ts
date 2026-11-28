// The checks that run over site/ after the build: every finding names its file and says what is wrong. One entry
// point, so CI, the pre-push hook and a person all run the same rules.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checkFacts } from '../facts/facts'
import { pageText } from '../page-text/page-text'
import { BRAND_FILES, readSiteData } from '../site-data/site-data'
import { readTokens, undeclaredBreakpoints, undeclaredTokens } from '../tokens/tokens'

export interface Inputs {
  /** The site/ folder, holding dist/ after a build. */
  site: string
  /** The repository root the facts come from. */
  repo: string
}

// Names used inside the project that must never reach a page (GLOSSARY: internal name).
const INTERNAL_NAMES = [/\bv\d+(?![.\d])/g, /\bphase \d+\b/gi, /\(\d+\.\d+\)/g]
const SKIP = new Set(['dist', 'node_modules', '.astro', 'test-results', 'playwright-report', '.lighthouseci'])

export function checkSite({ site, repo }: Inputs): string[] {
  const { facts, releases, brand } = readSiteData(repo)
  const releaseVersions = releases.map(r => r.version)
  const findings: string[] = []
  const at = (file: string, message: string) => findings.push(`${relative(site, file).replaceAll('\\', '/')}: ${message}`)

  // Text files (llms.txt) read as a page with no markup: the same facts and the same internal names apply.
  for (const page of files(join(site, 'dist')).filter(f => f.endsWith('.html') || f.endsWith('.txt'))) {
    const html = readFileSync(page, 'utf8')
    for (const finding of checkFacts(html, facts, releaseVersions)) at(page, finding)
    for (const name of internalNames(html)) at(page, `internal name "${name}"`)
  }

  const source = files(site, SKIP)
  for (const file of source.filter(f => /\.(js|mjs|cjs|jsx)$/.test(f))) at(file, 'hand-written JavaScript; the site is TypeScript only (ADR 0023)')

  const shippedBrand = join(site, 'public', 'brand')
  const listed: readonly string[] = BRAND_FILES
  for (const path of BRAND_FILES) {
    const copy = join(shippedBrand, path)
    if (!existsSync(copy)) at(copy, 'missing; build/brand/copy.ts copies every file in BRAND_FILES')
    else if (!brand.get(path)?.equals(readFileSync(copy))) {
      at(copy, `differs from docs/design/brand/${path}; brand files ship as exported (ADR 0018)`)
    }
  }
  for (const file of files(shippedBrand)) {
    if (!listed.includes(relative(shippedBrand, file).replaceAll('\\', '/'))) at(file, 'not in BRAND_FILES (build/site-data)')
  }

  const tokens = readTokens(readFileSync(join(site, 'src/styles/tokens.css'), 'utf8'))
  for (const file of source.filter(f => /\.(css|astro)$/.test(f))) {
    const css = readFileSync(file, 'utf8')
    for (const name of undeclaredTokens(css, tokens)) at(file, `undeclared token ${name}`)
    for (const width of undeclaredBreakpoints(css, tokens)) at(file, `breakpoint ${width} is not a --bp-* token in tokens.css`)
  }
  return findings
}

function internalNames(html: string): string[] {
  const text = pageText(html, { demo: 'keep' })
  return INTERNAL_NAMES.flatMap(p => [...text.matchAll(p)].map(m => ({ at: m.index, name: m[0] })))
    .toSorted((a, b) => a.at - b.at)
    .map(m => m.name)
}

/** Every file under `dir`, sorted, leaving out folders named in `skip` (at any depth). */
function files(dir: string, skip = new Set<string>()): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => !(e.isDirectory() && skip.has(e.name)))
    .flatMap(e => (e.isDirectory() ? files(join(dir, e.name), skip) : [join(dir, e.name)]))
    .toSorted()
}

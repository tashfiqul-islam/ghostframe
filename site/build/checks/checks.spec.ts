import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { BRAND_FILES } from '../site-data/site-data'
import { checkSite } from './checks'

const repo = join(import.meta.dir, '..', 'site-data', 'fixtures', 'repo')

/** A throwaway site/ folder: `files` maps a path inside it to its content. */
function siteWith(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), 'site-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const brand = (path: string) => readFileSync(join(repo, 'docs/design/brand', path))
const shipped = Object.fromEntries(BRAND_FILES.map(p => [`public/brand/${p}`, brand(p)]))

const pages = {
  'dist/index.html': '<h1>ghostframe</h1><p>v1.0.0</p><code>/plugin install ghostframe@ghostframe</code>',
  'src/styles/tokens.css': ':root { --gold: #ffc83d; }',
  'src/parts/a.css': '.a { color: var(--gold); }'
}
const clean = { ...pages, ...shipped }

describe('checkSite', () => {
  test('finds nothing on a clean site', () => {
    expect(checkSite({ site: siteWith(clean), repo })).toEqual([])
  })

  test('names the page that states a wrong fact', () => {
    const site = siteWith({ ...clean, 'dist/releases/index.html': '<a>v1.0.1</a>' })
    expect(checkSite({ site, repo })).toEqual(['dist/releases/index.html: version 1.0.1 is not a fact (known: 1.0.0, 2.1.329, 2.2.0)'])
  })

  test('names the page that leaks an internal name', () => {
    const site = siteWith({ ...clean, 'dist/index.html': '<p>Cockpit v8 lands in phase 5; see the spec (7.14).</p>' })
    expect(checkSite({ site, repo })).toEqual([
      'dist/index.html: internal name "v8"',
      'dist/index.html: internal name "phase 5"',
      'dist/index.html: internal name "(7.14)"'
    ])
  })

  test('names an internal name or a wrong fact in a text file the build writes, such as llms.txt', () => {
    const site = siteWith({ ...clean, 'dist/llms.txt': '# ghostframe\n\nVersion 1.0.1, built in phase 5.\n' })
    expect(checkSite({ site, repo })).toEqual([
      'dist/llms.txt: version 1.0.1 is not a fact (known: 1.0.0, 2.1.329, 2.2.0)',
      'dist/llms.txt: internal name "phase 5"'
    ])
  })

  test('names an internal name inside the demo too: the demo is a story, but its words still ship', () => {
    const site = siteWith({ ...clean, 'dist/index.html': '<section data-demo><pre>Cockpit v8 plays</pre></section>' })
    expect(checkSite({ site, repo })).toEqual(['dist/index.html: internal name "v8"'])
  })

  test('reads only page text for internal names, not inline styles or scripts', () => {
    const site = siteWith({
      ...clean,
      'dist/index.html': '<style>.wide[data-astro-cid-v434x]{display:none}</style><script>const v2 = 1</script><p>ghostframe</p>'
    })
    expect(checkSite({ site, repo })).toEqual([])
  })

  test('names hand-written JavaScript anywhere in site/ except the build output and installed packages', () => {
    const site = siteWith({
      ...clean,
      'src/parts/old.js': '',
      'tests/helper.mjs': '',
      'build/x.cjs': '',
      'src/Island.jsx': '',
      'dist/_astro/page.abc123.js': '',
      'node_modules/pkg/index.js': '',
      '.astro/content.js': ''
    })
    expect(checkSite({ site, repo })).toEqual([
      'build/x.cjs: hand-written JavaScript; the site is TypeScript only (ADR 0023)',
      'src/Island.jsx: hand-written JavaScript; the site is TypeScript only (ADR 0023)',
      'src/parts/old.js: hand-written JavaScript; the site is TypeScript only (ADR 0023)',
      'tests/helper.mjs: hand-written JavaScript; the site is TypeScript only (ADR 0023)'
    ])
  })

  test('names a stylesheet that uses a token tokens.css does not declare', () => {
    const site = siteWith({ ...clean, 'src/parts/b.astro': '<style>.b { color: var(--golden); }</style>' })
    expect(checkSite({ site, repo })).toEqual(['src/parts/b.astro: undeclared token --golden'])
  })

  test('names a stylesheet whose media width is not a --bp token', () => {
    const site = siteWith({
      ...clean,
      'src/styles/tokens.css': ':root { --gold: #ffc83d; --bp-phone: 767px; }',
      'src/parts/c.astro': '<style>@media (max-width: 768px) { .c { color: var(--gold); } }</style>'
    })
    expect(checkSite({ site, repo })).toEqual(['src/parts/c.astro: breakpoint 768px is not a --bp-* token in tokens.css'])
  })
})

describe('checkSite, brand files', () => {
  test('finds nothing when every listed brand file ships as exported', () => {
    expect(checkSite({ site: siteWith(clean), repo })).toEqual([])
  })

  test('names a listed brand file that public/brand lacks', () => {
    const { ['public/brand/icons/apple-touch-icon.png']: _left, ...rest } = shipped
    expect(checkSite({ site: siteWith({ ...pages, ...rest }), repo })).toEqual([
      'public/brand/icons/apple-touch-icon.png: missing; build/brand/copy.ts copies every file in BRAND_FILES'
    ])
  })

  test('names a brand file whose bytes differ from docs/design/brand', () => {
    const site = siteWith({ ...clean, ...shipped, 'public/brand/icons/favicon-32.png': 'retouched' })
    expect(checkSite({ site, repo })).toEqual([
      'public/brand/icons/favicon-32.png: differs from docs/design/brand/icons/favicon-32.png; brand files ship as exported (ADR 0018)'
    ])
  })

  test('names a file in public/brand that BRAND_FILES does not list', () => {
    const site = siteWith({ ...clean, ...shipped, 'public/brand/extra.svg': '<svg/>' })
    expect(checkSite({ site, repo })).toEqual(['public/brand/extra.svg: not in BRAND_FILES (build/site-data)'])
  })
})

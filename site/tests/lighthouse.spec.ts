// The Lighthouse budget: 100 in Performance, Accessibility, Best Practices and SEO, and every counted Agentic Browsing
// audit passing, mobile and desktop, on every page.
// Run against the built site served with real status codes: `bun test ./tests/lighthouse.spec.ts` after a build.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'astro/zod'
import { builtPages } from '../build/page-text/pages'

const site = join(import.meta.dir, '..')
const port = 4410
const chrome = Bun.env['CHROME_PATH'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const pages = builtPages(join(site, 'dist'))
if (pages.length === 0) throw new Error('no built pages: run the build first')
// Lighthouse 13.6 will not audit a page that answers 404 (ERRORED_DOCUMENT_REQUEST, every category null), so the 404
// page is audited at /404.html, where it is a file served with 200. tests/landing.e2e.ts holds the real 404 status.
const exempt: Record<string, string[]> = {}

let server: ReturnType<typeof Bun.spawn>
beforeAll(async () => {
  server = Bun.spawn(['bun', join(site, 'tests/serve.ts'), join(site, 'dist'), String(port)], { stdout: 'ignore' })
  await serverUp(100)
})

/** Waits for the server's health route rather than a fixed sleep: one try every 100 ms, `left` tries in all. */
async function serverUp(left: number): Promise<void> {
  const up = await fetch(`http://localhost:${port}/__health`).then(
    r => r.ok,
    () => false
  )
  if (up) return
  if (left === 0) throw new Error('the test server did not start within 10 s')
  await Bun.sleep(100)
  return serverUp(left - 1)
}
afterAll(() => server.kill())

const reportSchema = z.object({
  categories: z.record(z.string(), z.object({ score: z.number().nullable(), auditRefs: z.array(z.object({ id: z.string(), weight: z.number() })) })),
  audits: z.record(
    z.string(),
    z.object({ score: z.number().nullable(), scoreDisplayMode: z.string(), numericValue: z.number().optional(), details: z.unknown().optional() })
  )
})
const requests = z.object({ items: z.array(z.object({ resourceType: z.string().optional(), transferSize: z.number() })) })
type Report = z.infer<typeof reportSchema>

function lighthouse(path: string, preset: 'mobile' | 'desktop'): Report {
  const out = join(mkdtempSync(join(tmpdir(), 'lh-')), 'report.json')
  const args = [
    'x',
    'lighthouse',
    `http://localhost:${port}${path}`,
    '--quiet',
    '--output=json',
    `--output-path=${out}`,
    `--chrome-path=${chrome}`,
    // WebMCP is behind an origin trial (Chrome 149 to 162); the feature flag turns it on without a token, so the WebMCP
    // audits run instead of reading "not applicable". Agentic Browsing runs beside Performance: alone, CLS errors.
    '--chrome-flags=--headless=new --enable-features=WebMCP'
  ]
  if (preset === 'desktop') args.push('--preset=desktop')
  const run = Bun.spawnSync(['bun', ...args], { cwd: site })
  if (run.exitCode !== 0) throw new Error(`lighthouse failed on ${path} (${preset}): ${run.stderr.toString()}`)
  return reportSchema.parse(JSON.parse(readFileSync(out, 'utf8')))
}

/** The scored audits below 1 in each category, leaving out the page's exemptions. */
function shortfalls(run: Report, path: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const id of ['performance', 'accessibility', 'best-practices', 'seo']) {
    const failing = run.categories[id]!.auditRefs.filter(a => a.weight > 0 && (run.audits[a.id]?.score ?? 1) < 1).map(a => a.id)
    result[id] = failing.filter(a => !(exempt[path] ?? []).includes(a))
  }
  return result
}

// Agentic Browsing is scored as a fraction: an audit counts unless Lighthouse marks it not applicable, informative or
// manual (report-utils.js, calculateCategoryFraction). The budget is every counted audit passing, and exactly these
// counted: the site serves no ard.json and registers no WebMCP tools (ADR 0028), so those audits never count.
const AGENTIC_COUNTED = ['agent-accessibility-tree', 'cumulative-layout-shift', 'llms-txt']
const NOT_COUNTED = new Set(['notApplicable', 'informative', 'manual'])

/** Each Agentic Browsing audit: "pass" or "fail" when it counts, otherwise its display mode. */
function agentic(run: Report): Record<string, string> {
  return Object.fromEntries(
    run.categories['agentic-browsing']!.auditRefs.map(({ id }) => {
      const audit = run.audits[id]!
      return [id, NOT_COUNTED.has(audit.scoreDisplayMode) ? audit.scoreDisplayMode : audit.score === 1 ? 'pass' : 'fail']
    })
  )
}

const reports = new Map<string, Report>()
/** One Lighthouse run per page and preset, shared by that page's budget tests. */
function report(path: string, preset: 'mobile' | 'desktop'): Report {
  const key = `${preset} ${path}`
  if (!reports.has(key)) reports.set(key, lighthouse(path, preset))
  return reports.get(key)!
}

const JS_CEILING_BYTES = 120 * 1024
const LCP_BUDGET_MS = 1800

describe.each(['mobile', 'desktop'] as const)('Lighthouse, %s', preset => {
  test.each(pages)(
    '%s has no scored audit below 1, apart from its exemptions',
    path => {
      expect(shortfalls(report(path, preset), path)).toEqual({ performance: [], accessibility: [], 'best-practices': [], seo: [] })
    },
    120_000
  )

  test.each(pages)(
    '%s passes every Agentic Browsing audit that counts, and exactly the planned ones count',
    path => {
      const results = agentic(report(path, preset))
      const counted = Object.entries(results).filter(([, r]) => r === 'pass' || r === 'fail')
      expect(Object.fromEntries(counted)).toEqual(Object.fromEntries(AGENTIC_COUNTED.map(id => [id, 'pass'])))
      // The flag took: Chrome exposed WebMCP, so the registered-tools audit ran (it lists none) rather than going N/A.
      expect(results['webmcp-registered-tools']).toBe('informative')
    },
    120_000
  )

  test.each(pages)('%s loads under 120 KB of JavaScript, gzipped, and never shifts', path => {
    const { audits } = report(path, preset)
    const scripts = requests.parse(audits['network-requests']?.details).items.filter(i => i.resourceType === 'Script')
    expect(scripts.reduce((sum, i) => sum + i.transferSize, 0)).toBeLessThan(JS_CEILING_BYTES)
    expect(audits['cumulative-layout-shift']?.numericValue).toBe(0)
  })
})

// The mid-range phone of the budget is Lighthouse's mobile run: simulated slow 4G and a 4x slower CPU.
test.each(pages)('%s paints its largest content within 1.8 s on the throttled phone run', path => {
  expect(report(path, 'mobile').audits['largest-contentful-paint']?.numericValue).toBeLessThan(LCP_BUDGET_MS)
})

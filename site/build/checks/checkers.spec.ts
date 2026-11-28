// The type checkers prove they still check: each planted file holds one type error, and each checker must fail on it.
// A checker that silently stops checking (an option ignored, an extension skipped) fails this test instead of
// letting real errors through. ADR 0023.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const site = join(import.meta.dir, '..', '..')
const planted = join(import.meta.dir, 'fixtures', 'planted')
const bin = (name: string) => join(site, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.exe` : name)

const checkers = {
  tsc: (config: string) => [bin('tsc'), '-p', config],
  tsrs: (config: string) => [bin('tsrs'), '-p', config, '--runExternalCode']
}

/** Runs `checker` over `file` alone, with the site's own compiler options; returns its exit code and output. */
function check(checker: keyof typeof checkers, file: string): { code: number; out: string } {
  const dir = mkdtempSync(join(planted, '.run-'))
  const config = join(dir, 'tsconfig.json')
  const base = relative(dir, join(site, 'tsconfig.json')).replaceAll('\\', '/')
  writeFileSync(config, JSON.stringify({ extends: base, include: [`../${file}`, '../../../../../.astro/types.d.ts'], exclude: [] }))
  const run = Bun.spawnSync(checkers[checker](config), { cwd: site })
  return { code: run.exitCode, out: `${run.stdout.toString()}${run.stderr.toString()}` }
}

describe.each(['tsc', 'tsrs'] as const)('%s', checker => {
  test('passes a clean file', () => {
    expect(check(checker, 'clean.ts')).toEqual({ code: 0, out: '' })
  })

  test.each(['bad.ts', 'island.tsx'])('fails on the type error planted in %s', file => {
    const { code, out } = check(checker, file)
    expect(code).not.toBe(0)
    expect(out).toContain('TS2322')
  })
})

describe('tsrs, the checker for .astro files', () => {
  test.each(['frontmatter.astro', 'script.astro'])('fails on the type error planted in %s', file => {
    const { code, out } = check('tsrs', file)
    expect(code).not.toBe(0)
    expect(out).toContain(file)
    expect(out).toContain('TS2322')
  })
})

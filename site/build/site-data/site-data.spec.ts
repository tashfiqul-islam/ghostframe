import { describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BRAND_FILES, SITE_INPUTS, readSiteData } from './site-data'

const fixture = join(import.meta.dir, 'fixtures', 'repo')

describe('readSiteData', () => {
  test('reads the facts and the release notes from one repository', () => {
    const data = readSiteData(fixture)
    expect({ version: data.facts.version, latest: data.releases[0]?.version }).toEqual({ version: '1.0.0', latest: '1.0.0' })
  })

  test('fails, naming the input, when the changelog is missing', () => {
    const repo = mkdtempSync(join(tmpdir(), 'site-data-'))
    cpSync(fixture, repo, { recursive: true })
    rmSync(join(repo, 'CHANGELOG.md'))
    expect(() => readSiteData(repo)).toThrow('site input CHANGELOG.md is missing')
  })
})

describe('readSiteData, brand files', () => {
  test('holds the bytes of every listed brand file, as exported', () => {
    const { brand } = readSiteData(fixture)
    expect([...brand.keys()]).toEqual([...BRAND_FILES])
    expect(brand.get('icons/favicon-32.png')?.equals(readFileSync(join(fixture, 'docs/design/brand/icons/favicon-32.png')))).toBe(true)
  })

  test('fails, naming the file, when a listed brand file is missing', () => {
    const repo = mkdtempSync(join(tmpdir(), 'site-data-'))
    cpSync(fixture, repo, { recursive: true })
    rmSync(join(repo, 'docs/design/brand/icons/apple-touch-icon.png'))
    expect(() => readSiteData(repo)).toThrow('brand file docs/design/brand/icons/apple-touch-icon.png is missing')
  })
})

describe('the CI job', () => {
  test('runs the site checks when any site input changes', () => {
    const workflow = readFileSync(join(import.meta.dir, '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8')
    const watched = /git diff --quiet "\$BASE" HEAD -- (.+?);/.exec(workflow)?.[1]?.split(' ') ?? []
    expect(watched.toSorted()).toEqual(['site', '.github/workflows/ci.yml', ...SITE_INPUTS].toSorted())
  })
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomFeed, readReleases, releaseNotesPage } from './releases'

// The pending 1.0.0 notes as release-please wrote them on the release branch, 2026-11-28.
const pending = readFileSync(join(import.meta.dir, 'fixtures/pending-1.0.0.md'), 'utf8')

describe('readReleases', () => {
  test('reads the first release in the heading form release-please writes without a compare link', () => {
    const [release] = readReleases(pending)
    expect({ version: release?.version, date: release?.date }).toEqual({ version: '1.0.0', date: '2026-11-28' })
  })

  test('keeps the groups in the changelog order, with their change counts', () => {
    const groups = readReleases(pending)[0]!.groups.map(g => [g.name, g.changes.length])
    expect(groups).toEqual([
      ['Features', 3],
      ['Fixes', 13],
      ['Performance', 3],
      ['Docs', 1],
      ['Internal', 5]
    ])
  })

  test('splits a change row into its scope, sentence, pull request and commit', () => {
    const features = readReleases(pending)[0]!.groups[0]!
    expect(features.changes[1]).toEqual({
      scope: 'cockpit',
      text: "let tables, code cards and diff cards use a wide left's room",
      pullRequest: 50,
      commit: 'efc94ae'
    })
  })

  test('reads a change with no pull request', () => {
    expect(readReleases(pending)[0]!.groups[0]!.changes[0]).toEqual({
      scope: 'cockpit',
      text: 'Cockpit, the redesigned chat UI',
      pullRequest: null,
      commit: '6a07220'
    })
  })

  test('reads the heading form with a compare link, newest release first', () => {
    const later =
      '# Changelog\n\n## [1.1.0](https://github.com/o/r/compare/v1.0.0...v1.1.0) (2026-12-05)\n\n### Fixes\n\n* **hooks:** a fix ([#60](https://github.com/o/r/issues/60)) ([abc1234](https://github.com/o/r/commit/abc1234def))\n\n'
    const releases = readReleases(later + pending.replace('# Changelog\n', ''))
    expect(releases.map(r => r.version)).toEqual(['1.1.0', '1.0.0'])
  })

  test('fails on a changelog with no release, rather than building an empty page', () => {
    expect(() => readReleases('# Changelog\n')).toThrow('CHANGELOG.md has no release')
  })

  test('fails on a change row it cannot read, naming the line', () => {
    expect(() => readReleases('## 1.0.0 (2026-11-28)\n\n### Fixes\n\n* a row with no scope\n')).toThrow('cannot read change row: * a row with no scope')
  })
})

describe('atomFeed', () => {
  test('writes one entry per release with a stable id, linked to the release notes', () => {
    const feed = atomFeed(readReleases(pending), 'https://site.example')
    expect(feed).toStartWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">')
    expect(feed).toContain('<id>https://site.example/releases/#v1.0.0</id>')
    expect(feed).toContain('<link rel="alternate" href="https://site.example/releases/#v1.0.0"/>')
    expect(feed).toContain('<updated>2026-11-28T00:00:00Z</updated>')
    expect(feed.match(/<entry>/g)).toHaveLength(1)
  })

  test('escapes markup in a change sentence', () => {
    const feed = atomFeed(
      readReleases('## 1.0.0 (2026-11-28)\n\n### Fixes\n\n* **hooks:** keep <b> & friends ([abc1234](https://x/commit/abc1234))\n'),
      'https://site.example'
    )
    expect(feed).toContain('keep &amp;lt;b&amp;gt; &amp;amp; friends')
  })
})

describe('releaseNotesPage', () => {
  test('gives one filter chip for all changes, then one per group in changelog order, each counted', () => {
    expect(releaseNotesPage(readReleases(pending)).chips).toEqual([
      { group: null, label: 'ALL', count: 25 },
      { group: 'Features', label: 'FEATURES', count: 3 },
      { group: 'Fixes', label: 'FIXES', count: 13 },
      { group: 'Performance', label: 'PERFORMANCE', count: 3 },
      { group: 'Docs', label: 'DOCS', count: 1 },
      { group: 'Internal', label: 'INTERNAL', count: 5 }
    ])
  })

  test('counts a group across every release', () => {
    const two = readReleases('## 1.1.0 (2026-12-05)\n\n### Fixes\n\n* **hooks:** a ([abc1234](x))\n\n' + pending.replace('# Changelog\n', ''))
    expect(releaseNotesPage(two).chips.find(c => c.group === 'Fixes')?.count).toBe(14)
  })

  test('names the feed the page links', () => {
    expect(releaseNotesPage(readReleases(pending)).feed).toBe('/releases/feed.xml')
  })
})

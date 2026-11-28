// The release notes, read from release-please's CHANGELOG.md text (ADR 0019). Git supplies counts elsewhere; every
// sentence on the release notes page comes from here.

export interface Change {
  scope: string
  text: string
  pullRequest: number | null
  commit: string
}
export interface Group {
  name: string
  changes: Change[]
}
export interface Release {
  version: string
  date: string
  groups: Group[]
}

// `## 1.0.0 (2026-11-28)` or `## [1.1.0](compare link) (2026-12-05)`
const releaseHeading = /^## (?:\[(\d+\.\d+\.\d+)\]\([^)]*\)|(\d+\.\d+\.\d+)) \((\d{4}-\d{2}-\d{2})\)$/
const groupHeading = /^### (.+)$/
// `* **scope:** sentence ([#50](link)) ([efc94ae](link))`, the pull request optional
const changeRow = /^\* \*\*([\w-]+):\*\* (.+?)(?: \(\[#(\d+)\]\([^)]*\)\))? \(\[([0-9a-f]{7,40})\]\([^)]*\)\)$/

/** Every release in `changelog`, newest first, as written. Throws on a line it cannot read and on no release at all. */
export function readReleases(changelog: string): Release[] {
  const releases: Release[] = []
  for (const line of changelog.split('\n').map(l => l.trimEnd())) {
    if (line === '' || line === '# Changelog') continue
    const heading = releaseHeading.exec(line)
    if (heading) {
      releases.push({ version: (heading[1] ?? heading[2])!, date: heading[3]!, groups: [] })
      continue
    }
    const release = releases.at(-1)
    if (!release) throw new Error(`cannot read changelog line before any release: ${line}`)
    const group = groupHeading.exec(line)
    if (group) {
      release.groups.push({ name: group[1]!, changes: [] })
      continue
    }
    const row = changeRow.exec(line)
    const current = release.groups.at(-1)
    if (!row || !current) throw new Error(`cannot read change row: ${line}`)
    current.changes.push({ scope: row[1]!, text: row[2]!, pullRequest: row[3] ? Number(row[3]) : null, commit: row[4]!.slice(0, 7) })
  }
  if (releases.length === 0) throw new Error('CHANGELOG.md has no release')
  return releases
}

/** The release notes' Atom feed (RFC 4287): one entry per release, its changes as an HTML list. */
export function atomFeed(releases: Release[], origin: string): string {
  const page = `${origin}/releases/`
  const entries = releases.map(r => {
    const html = r.groups
      .map(g => `<h3>${escape(g.name)}</h3><ul>${g.changes.map(c => `<li>${escape(c.scope)}: ${escape(c.text)}</li>`).join('')}</ul>`)
      .join('')
    return [
      '  <entry>',
      `    <id>${page}#v${r.version}</id>`,
      `    <title>ghostframe ${r.version}</title>`,
      `    <updated>${r.date}T00:00:00Z</updated>`,
      `    <link rel="alternate" href="${page}#v${r.version}"/>`,
      `    <content type="html">${escape(html)}</content>`,
      '  </entry>'
    ].join('\n')
  })
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${page}</id>`,
    '  <title>ghostframe release notes</title>',
    `  <updated>${releases[0]!.date}T00:00:00Z</updated>`,
    `  <link rel="self" href="${page}feed.xml"/>`,
    `  <link rel="alternate" href="${page}"/>`,
    '  <author><name>ghostframe</name></author>',
    ...entries,
    '</feed>',
    ''
  ].join('\n')
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface FilterChip {
  /** The group the chip shows, or null for every change. */
  group: string | null
  label: string
  count: number
}

/** What the release notes page shows beyond the releases themselves: the filter chips, counted, and its feed. */
export function releaseNotesPage(releases: Release[]): { chips: FilterChip[]; feed: string } {
  const groups = releases.flatMap(r => r.groups)
  const names = [...new Set(groups.map(g => g.name))]
  const count = (name: string | null) => groups.filter(g => name === null || g.name === name).reduce((n, g) => n + g.changes.length, 0)
  const chips = [{ group: null, label: 'ALL', count: count(null) }, ...names.map(name => ({ group: name, label: name.toUpperCase(), count: count(name) }))]
  return { chips, feed: '/releases/feed.xml' }
}

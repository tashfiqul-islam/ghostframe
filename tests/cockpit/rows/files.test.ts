import { expect, test } from 'claude-code/testing'

import { filesView } from '../../../hooks/cockpit/rows/views'
import type { FileRow } from '../../../hooks/cockpit/rows/views'
import { GLYPH } from '../../../hooks/shared/look/glyphs'

// The Files tab (8.5): the header's count, the rows and the bars come from one list. Seen live: `FILES 3` and three
// bars, but two rows: a row whose path the row had no room for drew nothing but its bar. A file outside the project
// (the home folder, a temp folder) has no counts by design, so it gets no bar: a dim `outside` at the bar's place.
const text = (row: readonly { t: string }[]) => row.map(p => p.t).join('')
const files: FileRow[] = [
  { path: '~/.claude/projects/D--Projects-ghostframe/memory/verify-against-spec.md', adds: 0, dels: 0, isAgent: false },
  { path: '~/AppData/Local/Temp/claude/fb01919585ba1850/58b9815c/scratchpad/band-block.ts', adds: 0, dels: 0, isAgent: false },
  { path: 'hooks/cockpit/band.tsx', adds: 12, dels: 3, isAgent: false }
]
const NAMES = ['verify-against-spec.md', 'band-block.ts', 'band.tsx']

for (const width of [60, 90]) {
  const rows = filesView(files, 11, width).map(text)
  const fileRows = rows.filter(r => /^ {4}\S/.test(r))

  test(`${width} columns: three files, two outside the project: three rows under a header of 3`, () => {
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}3 files changed /))
    expect(fileRows).toHaveLength(3)
    // Each row names its file: the file name is the last thing a row may lose.
    for (const [i, name] of NAMES.entries()) expect(fileRows[i]).toContain(name)
    for (const r of fileRows) expect(r.length).toBeLessThanOrEqual(width)
  })

  test(`${width} columns: rows, bars and the header agree; outside files say so and draw no bar`, () => {
    const bars = fileRows.filter(r => r.includes(GLYPH.change))

    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatch(/band\.tsx +\+12 {3}−3 {2}■+/)
    expect(fileRows.filter(r => /outside\s*$/.test(r))).toHaveLength(2)
    expect(fileRows.length).toBe(Number(/(\d+) files? changed/.exec(rows.join('\n'))?.[1]))
  })

  test(`${width} columns: a file name too long for its row is cut in the middle, never left out`, () => {
    const long = `src/${'a'.repeat(60)}-the-end.ts`
    const one = filesView([{ path: long, adds: 1, dels: 0, isAgent: false }], 11, width)
      .map(text)
      .filter(r => /^ {4}\S/.test(r))

    expect(one).toHaveLength(1)
    expect(one[0]).toMatch(/^ {4}\S*a+…a*-the-end\.ts|^ {4}\S*…\S*the-end\.ts/)
  })
}

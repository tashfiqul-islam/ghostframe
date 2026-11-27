import { expect, test } from 'claude-code/testing'

import { TEXT_AT } from '../../../hooks/shared/look/spine'
import { widthOf } from '../../../hooks/shared/look/width'
import { answerRows } from '../../../hooks/transcript/rows/markdown'
import { FINISHED, wordsIn } from '../../support/finished'
import { bare, UNBROKEN } from '../../support/unbroken'

const text = (row: readonly { t: string }[]) => row.map(p => p.t).join('')

for (const [name, said] of Object.entries(UNBROKEN)) {
  for (const width of [40, 70, 120]) {
    test(`B1. Cockpit on: ${name} text at ${width} cells wraps inside its words, every row fits, nothing lost`, () => {
      const rows = answerRows(said, { width, hasLead: true }).map(text)

      for (const r of rows) expect(widthOf(r)).toBeLessThanOrEqual(TEXT_AT + width)
      expect(bare(rows.map(r => r.slice(TEXT_AT)).join(''))).toBe(bare(said))
    })
  }
}

test('B4. `Note that …` with no colon is a plain paragraph, never a NOTE card', () => {
  const rows = answerRows('Note that the build is slow.\nIt takes a minute.', { width: 60, hasLead: false }).map(text)

  expect(rows.some(r => r.includes('NOTE'))).toBe(false)
  expect(rows.map(r => r.slice(TEXT_AT).trim())).toEqual(['Note that the build is slow.', 'It takes a minute.'])
})

test('B4. `Note:` ends at a fence: the code below keeps its code card', () => {
  const rows = answerRows('Note: run this:\n```sh\nbun test\n```\nafter', { width: 60, hasLead: false }).map(text)
  const note = rows.find(r => r.includes('NOTE')) ?? ''
  const code = rows.find(r => r.includes('bun test')) ?? ''

  expect(note).toMatch(/NOTE {3}run this:\s*$/)
  expect(code).not.toContain('NOTE')
  expect(rows.some(r => r.includes('```'))).toBe(false)
  expect(rows.some(r => r.trim().endsWith('after'))).toBe(true)
})

// A guard, not a proof: Cockpit on draws the raw text and never used the streaming cut, so this passed before the fix.
for (const said of FINISHED) {
  test(`B2, B3. Cockpit on: the finished reply ${JSON.stringify(said)} keeps every word`, () => {
    const shown = answerRows(said, { width: 70, hasLead: true }).map(text).join(' ')

    for (const w of wordsIn(said)) expect(shown).toContain(w)
  })
}

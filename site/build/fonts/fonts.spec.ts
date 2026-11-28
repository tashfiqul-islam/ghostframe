import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FONT_FILES, GLYPH_FACE_POINTS, WORDS_POINTS } from './glyphs'

const dir = join(import.meta.dirname, '..', '..', 'public', 'fonts')
const coverage: Record<string, { sha256: string; codePoints: number[] }> = JSON.parse(readFileSync(join(dir, 'coverage.json'), 'utf8'))
const held = (file: string) => new Set(coverage[file]!.codePoints)

describe('the font subsets', () => {
  test.each(Object.values(FONT_FILES))('%s matches its entry in coverage.json', file => {
    const sha256 = createHash('sha256')
      .update(readFileSync(join(dir, file)))
      .digest('hex')
    expect(coverage[file]?.sha256).toBe(sha256)
  })

  test('coverage.json lists the three files and no other', () => {
    expect(Object.keys(coverage).toSorted()).toEqual(Object.values(FONT_FILES).toSorted())
  })

  test('the glyph face holds exactly U+2713, U+21BB, U+2234 and U+25AE', () => {
    expect(coverage[FONT_FILES.glyphs]!.codePoints.toSorted((a, b) => a - b)).toEqual(GLYPH_FACE_POINTS.toSorted((a, b) => a - b))
  })

  test('JetBrains Mono holds box drawing, block elements and the prompt chevron', () => {
    const mono = held(FONT_FILES['JetBrains Mono'])
    for (const point of [0x2500, 0x2580, 0x276f]) expect(mono.has(point)).toBe(true)
  })

  test('Hanken Grotesk holds every character of words.ts', () => {
    const sans = held(FONT_FILES['Hanken Grotesk'])
    expect(WORDS_POINTS.filter(point => !sans.has(point))).toEqual([])
  })
})

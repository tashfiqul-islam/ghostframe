import { expect, test } from 'claude-code/testing'

import { ONE_CELL_RANGES, graphemesOf, segmentedWidth, stripAnsi, widthOf } from '../../../hooks/shared/look/width'

test('plain text and the empty string take one cell per character', () => {
  expect(widthOf('')).toBe(0)
  expect(widthOf('abc')).toBe(3)
})

test('text-presentation symbols take one cell; VS16 makes them two-cell emoji', () => {
  expect(widthOf('\u00A9')).toBe(1)
  expect(widthOf('\u2122')).toBe(1)
  expect(widthOf('\u00A9\uFE0F')).toBe(2)
  expect(widthOf('\u263A\uFE0E')).toBe(1)
  expect(widthOf('\u263A\uFE0F')).toBe(2)
})

test('emoji clusters take two cells: flags, keycaps, ZWJ sequences, default emoji, skin tones', () => {
  expect(widthOf('\u{1F1FA}\u{1F1F8}')).toBe(2)
  expect(widthOf('1\uFE0F\u20E3')).toBe(2)
  expect(widthOf('#\uFE0F\u20E3')).toBe(2)
  expect(widthOf('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}')).toBe(2)
  expect(widthOf('\u{1F60A}')).toBe(2)
  expect(widthOf('\u{1F44D}\u{1F3FD}')).toBe(2)
})

test('East Asian wide and fullwidth characters take two cells each', () => {
  expect(widthOf('\u4E2D\u6587')).toBe(4)
  expect(widthOf('\uFF21\uFF22')).toBe(4)
})

test('zero-width characters and combining marks take no cells', () => {
  expect(widthOf('a\u200Bb')).toBe(2)
  expect(widthOf('\u200D')).toBe(0)
  expect(widthOf('e\u0301')).toBe(1)
})

test('ANSI escapes take no cells and stripAnsi removes them', () => {
  expect(widthOf('\x1b[31mred\x1b[0m')).toBe(3)
  expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
  expect(stripAnsi('\x1b]8;;https://example.com\x07link\x1b]8;;\x1b\\')).toBe('link')
})

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const clustersOf = (s: string): string[] => Array.from(segmenter.segment(s), g => g.segment)

test('the fast path is exact: every code point it takes is one cell and one cluster, alone and beside a letter', () => {
  const wrong: string[] = []

  for (const [lo, hi] of ONE_CELL_RANGES) {
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp)

      for (const s of [ch, `a${ch}`, `${ch}a`]) {
        // The fast path answers s.length cells and s.split('') clusters without segmenting.
        if (widthOf(s) !== s.length || segmentedWidth(s) !== s.length) wrong.push(`width ${cp.toString(16)} in ${JSON.stringify(s)}`)
        if (JSON.stringify(graphemesOf(s)) !== JSON.stringify(clustersOf(s))) wrong.push(`clusters ${cp.toString(16)} in ${JSON.stringify(s)}`)
      }
    }
  }
  expect(wrong).toEqual([])
})

test('the fast path never takes a zero-width or joining code point', () => {
  const joining = [0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x2060, 0x0300, 0x036f, 0xfe0e, 0xfe0f, 0x1b]
  const taken = joining.filter(cp => ONE_CELL_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi))

  expect(taken).toEqual([])
  expect(widthOf('e\u0301')).toBe(1)
  expect(widthOf('a\u00ad')).toBe(1)
  expect(graphemesOf('e\u0301x')).toEqual(['e\u0301', 'x'])
})

test('the fast path takes nothing the full measure would answer differently, anywhere in the BMP', () => {
  const wrong: string[] = []

  for (let cp = 0; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue
    const ch = String.fromCodePoint(cp)

    for (const s of [ch, `a${ch}`]) {
      if (widthOf(s) !== segmentedWidth(s)) wrong.push(`width ${cp.toString(16)}`)
      if (JSON.stringify(graphemesOf(s)) !== JSON.stringify(clustersOf(s))) wrong.push(`clusters ${cp.toString(16)}`)
    }
  }
  expect(wrong).toEqual([])
})

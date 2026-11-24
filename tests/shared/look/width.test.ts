import { expect, test } from 'claude-code/testing'

import { widthOf, stripAnsi } from '../../../hooks/shared/look/width'

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

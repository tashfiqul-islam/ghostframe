import { expect, test } from 'claude-code/testing'

import { inRange, parseRange, rangeText } from '../../hooks/shared/range'

test('a range is a floor and a ceiling: `>=a.b.c <x.y.z`', () => {
  expect(parseRange('>=2.1.329 <2.2.0')).toEqual({ min: [2, 1, 329], below: [2, 2, 0] })
})

test('any other range is refused, never read loosely', () => {
  for (const text of ['>=2.1.329', '^2.1.329', '>=2.1 <2.2', '<2.2.0 >=2.1.329', '>=2.2.0 <2.1.329', '', '>=2.1.329  <2.2.0x']) {
    expect(() => parseRange(text)).toThrow()
  }
})

test('the floor is in the range, the ceiling is not', () => {
  const range = parseRange('>=2.1.329 <2.2.0')

  expect(inRange('2.1.329', range)).toBe(true)
  expect(inRange('2.1.332', range)).toBe(true)
  expect(inRange('2.1.999', range)).toBe(true)
  expect(inRange('2.1.328', range)).toBe(false)
  expect(inRange('2.2.0', range)).toBe(false)
  expect(inRange('3.0.0', range)).toBe(false)
})

test('a development build counts as its release: `2.1.330-dev` is 2.1.330', () => {
  const range = parseRange('>=2.1.329 <2.2.0')

  expect(inRange('2.1.330-dev', range)).toBe(true)
  expect(inRange('2.2.0-dev', range)).toBe(false)
})

test('a version that is not a release is refused', () => {
  expect(() => inRange('nightly', parseRange('>=2.1.329 <2.2.0'))).toThrow()
})

test('the range reads as words in the notice', () => {
  expect(rangeText(parseRange('>=2.1.329 <2.2.0'))).toBe('2.1.329 and later, below 2.2.0')
})

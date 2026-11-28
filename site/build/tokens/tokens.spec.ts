import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTokens, undeclaredBreakpoints, undeclaredTokens } from './tokens'

const site = join(import.meta.dir, '..', '..')
const tokensCss = readFileSync(join(site, 'src/styles/tokens.css'), 'utf8')

// The colour tokens exactly as the Components artboard lists them (docs/design/website/Components.dc.html, file 11).
const artboardColours = {
  '--bg': '#0b0b0e',
  '--bg-deep': '#060608',
  '--surface-1': '#111117',
  '--surface-2': '#17171f',
  '--line-1': '#1e1d24',
  '--line-2': '#2a2a34',
  '--text': '#eceaf2',
  '--text-2': '#8c8899',
  '--text-3': '#7f7b8b',
  '--gold': '#ffc83d',
  '--gold-hi': '#fff3c9',
  '--gold-lo': '#ffa21a',
  '--calm': '#7ec8be',
  '--calm-eye': '#5beba6',
  '--busy': '#e8b98a',
  '--busy-eye': '#fab387',
  '--hot': '#ec84a0',
  '--hot-eye': '#d7263d'
}

describe('tokens.css', () => {
  test('holds every colour token of the Components artboard, with its value', () => {
    const tokens = readTokens(tokensCss)
    for (const [name, value] of Object.entries(artboardColours)) expect([name, tokens.get(name)]).toEqual([name, value])
  })

  test('declares no colour the artboard does not list', () => {
    const colours = [...readTokens(tokensCss)].filter(([, v]) => v.startsWith('#')).map(([n]) => n)
    expect(colours.toSorted()).toEqual(Object.keys(artboardColours).toSorted())
  })
})

describe('undeclaredTokens', () => {
  test('names a var() that tokens.css does not declare', () => {
    const tokens = readTokens(':root { --gold: #ffc83d; }')
    expect(undeclaredTokens('.a { color: var(--gold); border-color: var(--glod); }', tokens)).toEqual(['--glod'])
  })

  test('accepts a property declared locally in the same file', () => {
    const tokens = readTokens(':root { --gold: #ffc83d; }')
    expect(undeclaredTokens('.a { --p: 0; transform: scaleX(var(--p)); color: var(--gold); }', tokens)).toEqual([])
  })
})

describe('undeclaredBreakpoints', () => {
  const tokens = readTokens(':root { --bp-phone: 767px; }')

  test('names a media width that no --bp token declares', () => {
    expect(undeclaredBreakpoints('@media (max-width: 767px) {} @media (min-width: 1024px) {}', tokens)).toEqual(['1024px'])
  })

  test('reads the range syntax too', () => {
    expect(undeclaredBreakpoints('@media (width <= 767px) {} @media (width > 900px) {}', tokens)).toEqual(['900px'])
  })
})

test('tokens.css declares the phone breakpoint the 390 artboards use', () => {
  expect(readTokens(tokensCss).get('--bp-phone')).toBe('767px')
})

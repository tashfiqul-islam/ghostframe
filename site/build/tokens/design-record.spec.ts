import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDesignRecord, readTokens } from './tokens'

const site = join(import.meta.dir, '..', '..')
const tokens = readTokens(readFileSync(join(site, 'src/styles/tokens.css'), 'utf8'))
const designMd = readFileSync(join(site, 'DESIGN.md'), 'utf8')
const record = readDesignRecord(designMd)

// The token that holds each typography property of DESIGN.md, by the record's key.
const sans = new Set(['display', 'title', 'lead', 'body'])
const typographyToken: Record<string, ((key: string) => string) | undefined> = {
  fontSize: (key: string) => `--type-${key}`,
  fontWeight: (key: string) => `--weight-${key}`,
  lineHeight: (key: string) => `--leading-${key}`,
  letterSpacing: (key: string) => `--track-${key}`,
  fontFamily: (key: string) => (sans.has(key) ? '--sans' : '--mono')
}

// DESIGN.md writes a bare zero as 0px, "40 px" with a space and a font stack without quotes; tokens.css may not.
const normal = (value: unknown) =>
  String(value)
    .replaceAll(/['"\s]/g, '')
    .replace(/^0$/, '0px')
    .toLowerCase()

// The prose binds a value to its token as `--token` (value). A value may hold one level of parentheses: cubic-bezier(...).
const boundPair = /`(--[\w-]+)`\s+\(((?:[^()]|\([^()]*\))+)\)/g
const boundPairs = (markdown: string): [path: string, token: string, value: string][] =>
  [...markdown.matchAll(boundPair)].map(([, token, value]) => [`prose ${token!}`, token!, value!])
const prose = designMd.replace(/^---[\s\S]*?\r?\n---/, '')

// Each failing line names the DESIGN.md path, the token and both values.
function drift(pairs: [path: string, token: string, value: unknown][]): string[] {
  return pairs
    .filter(([, token, value]) => normal(tokens.get(token) ?? 'missing') !== normal(value))
    .map(([path, token, value]) => `${path}: ${token} is ${tokens.get(token) ?? 'missing'}, DESIGN.md says ${String(value)}`)
}

describe('DESIGN.md frontmatter', () => {
  test('colours equal the colour tokens', () => {
    expect(Object.keys(record.colors).length).toBeGreaterThan(0)
    expect(drift(Object.entries(record.colors).map(([k, v]) => [`colors.${k}`, `--${k}`, v]))).toEqual([])
  })

  test('spacing equals the space tokens', () => {
    expect(Object.keys(record.spacing)).toHaveLength(8)
    expect(drift(Object.entries(record.spacing).map(([k, v]) => [`spacing.${k}`, `--space-${k}`, v]))).toEqual([])
  })

  test('radii equal the radius tokens', () => {
    expect(Object.keys(record.rounded).toSorted()).toEqual(['button', 'chip', 'frame'])
    expect(drift(Object.entries(record.rounded).map(([k, v]) => [`rounded.${k}`, `--radius-${k}`, v]))).toEqual([])
  })

  test('type scale equals the type tokens: family, size, weight, line height and tracking', () => {
    const pairs: [string, string, unknown][] = []
    for (const [key, props] of Object.entries(record.typography)) {
      for (const [prop, value] of Object.entries(props)) {
        const token = typographyToken[prop]
        if (!token) throw new Error(`typography.${key}.${prop} has no token mapping`)
        pairs.push([`typography.${key}.${prop}`, token(key), value])
      }
    }
    expect(pairs.length).toBeGreaterThan(0)
    expect(drift(pairs)).toEqual([])
  })
})

describe('DESIGN.md prose', () => {
  test('every value it binds to a token equals that token', () => {
    expect(boundPairs(prose).length).toBeGreaterThan(20)
    expect(drift(boundPairs(prose))).toEqual([])
  })

  test('binds every --bp-* token to its value in the Layout section', () => {
    const layout = prose.split(/^## /m).find(section => section.startsWith('Layout')) ?? ''
    const named = new Set(boundPairs(layout).map(([, token]) => token))
    const breakpoints = [...tokens.keys()].filter(name => name.startsWith('--bp-'))
    expect(breakpoints.length).toBeGreaterThan(0)
    expect(breakpoints.filter(name => !named.has(name))).toEqual([])
  })

  test('states every colour, space, radius and type token, in the frontmatter or as a bound pair', () => {
    const typeOf = Object.entries(record.typography).flatMap(([key, props]) => Object.keys(props).flatMap(prop => typographyToken[prop]?.(key) ?? []))
    const stated = new Set([
      ...Object.keys(record.colors).map(k => `--${k}`),
      ...Object.keys(record.spacing).map(k => `--space-${k}`),
      ...Object.keys(record.rounded).map(k => `--radius-${k}`),
      ...typeOf,
      ...boundPairs(prose).map(([, token]) => token)
    ])
    const statable = /^--(space|radius|corner|type|weight|leading|track)-|^--(cell-[wh]|press|move|ease-out)$/
    const owed = [...tokens].filter(([name, value]) => value.startsWith('#') || statable.test(name)).map(([name]) => name)
    expect(owed.filter(name => !stated.has(name))).toEqual([])
  })

  test('catches a bound value that differs from its token', () => {
    expect(drift(boundPairs('`--type-hero` (61 px)'))).toEqual(['prose --type-hero: --type-hero is 60px, DESIGN.md says 61 px'])
  })
})

describe('readDesignRecord', () => {
  test('reads the four tables of the frontmatter', () => {
    const md = '---\ncolors:\n  bg: "#000"\nspacing:\n  "1": "4px"\nrounded:\n  chip: "4px"\ntypography:\n  body:\n    fontSize: "18px"\n---\n# x'
    expect(readDesignRecord(md)).toEqual({
      colors: { bg: '#000' },
      spacing: { '1': '4px' },
      rounded: { chip: '4px' },
      typography: { body: { fontSize: '18px' } }
    })
  })

  test('throws when there is no frontmatter', () => {
    expect(() => readDesignRecord('# x')).toThrow('frontmatter')
  })
})

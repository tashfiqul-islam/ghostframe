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

// DESIGN.md writes a bare zero as 0px and a font stack without quotes; tokens.css may not.
const normal = (value: unknown) => String(value).replaceAll(/['"]/g, '').replace(/^0$/, '0px').toLowerCase()

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

test('DESIGN.md names every --bp-* token in its Layout section', () => {
  const layout = designMd.split(/^## /m).find(section => section.startsWith('Layout')) ?? ''
  const breakpoints = [...tokens].filter(([name]) => name.startsWith('--bp-'))
  expect(breakpoints.length).toBeGreaterThan(0)
  for (const [name, value] of breakpoints) {
    expect([name, layout.includes(`\`${name}\``)]).toEqual([name, true])
    expect([name, layout.includes(value.replace('px', ''))]).toEqual([name, true])
  }
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

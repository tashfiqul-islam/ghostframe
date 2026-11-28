import { describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkFacts, readFacts } from './facts'

const fixture = join(import.meta.dir, '..', 'site-data', 'fixtures', 'repo')

function repoWith(change: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'facts-'))
  cpSync(fixture, root, { recursive: true })
  change(root)
  return root
}

describe('readFacts', () => {
  test('reads the version and the supported Claude Code range from plugin.json', () => {
    const facts = readFacts(fixture)
    expect({ version: facts.version, range: facts.claudeCode }).toEqual({ version: '1.0.0', range: { from: '2.1.329', below: '2.2.0' } })
  })

  test('reads the install commands from the README', () => {
    expect(readFacts(fixture).commands).toEqual([
      '/plugin marketplace add tashfiqul-islam/ghostframe',
      '/plugin install ghostframe@ghostframe',
      '/ghostframe-statusline install'
    ])
  })

  test('fails, naming the fact and its source, when plugin.json has no version', () => {
    const root = repoWith(r => writeFileSync(join(r, '.claude-plugin/plugin.json'), '{ "engines": { "claude-code": ">=2.1.329 <2.2.0" } }'))
    expect(() => readFacts(root)).toThrow('fact "version": .claude-plugin/plugin.json has no "version"')
  })

  test('fails when the Claude Code range is not a floor and a ceiling', () => {
    const root = repoWith(r => writeFileSync(join(r, '.claude-plugin/plugin.json'), '{ "version": "1.0.0", "engines": { "claude-code": "^2.1.329" } }'))
    expect(() => readFacts(root)).toThrow('fact "claudeCode": .claude-plugin/plugin.json engines["claude-code"] is "^2.1.329", not ">=x.y.z <x.y.z"')
  })
})

describe('readFacts, eye thresholds', () => {
  test("reads the eye thresholds from the status line's own tone rule", () => {
    expect(readFacts(fixture).eyeThresholds).toEqual({ busy: 60, hot: 85 })
  })

  test('fails, naming the file, when the tone rule no longer reads as two thresholds', () => {
    const root = repoWith(r => writeFileSync(join(r, 'statusline/render.ts'), 'const toneOf = (p: number): Tone => pick(p)\n'))
    expect(() => readFacts(root)).toThrow('fact "eyeThresholds": statusline/render.ts has no toneOf of the form p < N ? calm : p < M ? warm : hot')
  })
})

describe('checkFacts', () => {
  const facts = readFacts(fixture)

  test('passes a page whose versions and commands are all facts', () => {
    const html = '<p>v1.0.0 runs on Claude Code 2.1.329 up to 2.2.0.</p><code>/plugin install ghostframe@ghostframe</code>'
    expect(checkFacts(html, facts)).toEqual([])
  })

  test('names a version the repository does not state', () => {
    expect(checkFacts('<a class="chip">v1.0.1</a>', facts)).toEqual(['version 1.0.1 is not a fact (known: 1.0.0, 2.1.329, 2.2.0)'])
  })

  test('ignores the demo, whose scripted session is not a statement about ghostframe', () => {
    expect(checkFacts('<section data-demo><pre>CI was on Bun 1.4.1</pre></section><p>v1.0.0</p>', facts)).toEqual([])
  })

  test('names a command the README does not give', () => {
    expect(checkFacts('<code>/plugin install ghostframe</code>', facts)).toEqual(['command "/plugin install ghostframe" is not in the README'])
  })
})

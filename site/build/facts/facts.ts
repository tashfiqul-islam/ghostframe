// Facts: what the site states about ghostframe that the repository can prove. They are read from the files that own
// them, and the built pages are checked against them, so a wrong fact fails the build instead of shipping.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'astro/zod'
import { pageCode, pageText } from '../page-text/page-text'

export interface Facts {
  version: string
  claudeCode: { from: string; below: string }
  commands: string[]
  /** The usages (percent) where the eyes turn busy and hot. */
  eyeThresholds: { busy: number; hot: number }
}

const PLUGIN_JSON = '.claude-plugin/plugin.json'
// Only the shape; the facts below say which field is missing or wrong, by name.
const pluginJson = z.object({ version: z.unknown().optional(), engines: z.record(z.string(), z.unknown()).optional() })
const range = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/
const command = /(?:^|[\s`])(\/(?:plugin|ghostframe-[\w-]+)(?: [^\s`<]+)*)/gm
// statusline/render.ts: `const toneOf = (p: number): Tone => (p < 60 ? 'calm' : p < 85 ? 'warm' : 'hot')`
const STATUS_LINE = 'statusline/render.ts'
const toneRule = /const toneOf = \(p: number\): Tone => \(p < (\d+) \? 'calm' : p < (\d+) \? 'warm' : 'hot'\)/
const version = /\bv?(\d+\.\d+\.\d+)\b/g

/** The facts of the repository at `root`. Throws a message naming the fact and the file that should hold it. */
export function readFacts(root: string): Facts {
  const plugin = pluginJson.parse(JSON.parse(readFileSync(join(root, PLUGIN_JSON), 'utf8')))
  if (typeof plugin.version !== 'string') throw new Error(`fact "version": ${PLUGIN_JSON} has no "version"`)
  const declared = plugin.engines?.['claude-code']
  const bounds = typeof declared === 'string' ? range.exec(declared) : null
  if (!bounds) throw new Error(`fact "claudeCode": ${PLUGIN_JSON} engines["claude-code"] is ${JSON.stringify(declared)}, not ">=x.y.z <x.y.z"`)
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const commands = [...new Set([...readme.matchAll(command)].map(m => m[1]!))]
  if (commands.length === 0) throw new Error('fact "commands": README.md gives no install command')
  const tone = toneRule.exec(readFileSync(join(root, STATUS_LINE), 'utf8'))
  if (!tone) throw new Error(`fact "eyeThresholds": ${STATUS_LINE} has no toneOf of the form p < N ? calm : p < M ? warm : hot`)
  return {
    version: plugin.version,
    claudeCode: { from: bounds[1]!, below: bounds[2]! },
    commands,
    eyeThresholds: { busy: Number(tone[1]), hot: Number(tone[2]) }
  }
}

/**
 * What on a built page is not a fact: a version the repository does not state, or a command the README does not
 * give. It reads the page as a reader would (build/page). `releaseVersions` adds the versions the changelog names.
 */
export function checkFacts(html: string, facts: Facts, releaseVersions: string[] = []): string[] {
  const known = [...new Set([facts.version, facts.claudeCode.from, facts.claudeCode.below, ...releaseVersions])]
  const findings: string[] = []
  for (const [, v] of pageText(html).matchAll(version)) if (!known.includes(v!)) findings.push(`version ${v} is not a fact (known: ${known.join(', ')})`)
  for (const c of pageCode(html)) if (c.startsWith('/') && !facts.commands.includes(c)) findings.push(`command "${c}" is not in the README`)
  return findings
}

// The hooks' module boundaries, checked from source: `bun tools/scripts/boundaries.ts` (from the repository root),
// or `--self-test` to prove the checker itself. Each file under hooks/ may import only:
//   hooks/shared/**      shared/**, the repo-root types/, `claude-code`
//   hooks/cockpit/**     cockpit/**, shared/**, types/, `claude-code`
//   hooks/transcript/**  transcript/**, shared/**, types/, `claude-code`, and the cockpit's public surface only
//   hooks/register.tsx   anything under hooks/ (it composes the features)
// and no file may re-export (`export … from`, `export *`): every import names the module that defines it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

/** The cockpit modules the transcript may import: named functions defined there, no re-exports. */
const COCKPIT_PUBLIC: readonly string[] = ['hooks/cockpit/feature', 'hooks/cockpit/left', 'hooks/cockpit/log', 'hooks/cockpit/switch']

/** A module's allowed import targets, as repo-relative path prefixes (without extension). */
type Area = { readonly prefix: string; readonly allowed: readonly string[] }

const AREAS: readonly Area[] = [
  { prefix: 'hooks/shared/', allowed: ['hooks/shared/', 'types/'] },
  { prefix: 'hooks/cockpit/', allowed: ['hooks/cockpit/', 'hooks/shared/', 'types/'] },
  { prefix: 'hooks/transcript/', allowed: ['hooks/transcript/', 'hooks/shared/', 'types/', ...COCKPIT_PUBLIC] }
]

const IMPORT = /^\s*(?:import|export)\s[^'"]*?\sfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm
const REEXPORT = /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s/m

/**
 * The boundary breaks in a set of source files.
 * @param files repo-relative path (forward slashes) to source text
 * @returns one message per break, empty when every import is allowed
 */
export function violations(files: ReadonlyMap<string, string>): string[] {
  const found: string[] = []

  for (const [file, source] of files) {
    if (REEXPORT.test(source)) found.push(`${file}: re-exports (export … from); import from the defining module instead`)

    const area = AREAS.find(a => file.startsWith(a.prefix))

    if (area === undefined) continue

    for (const m of source.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? ''

      if (spec === 'claude-code') continue

      if (!spec.startsWith('.')) {
        found.push(`${file}: imports '${spec}'; a hooks module imports only relative paths and 'claude-code'`)
        continue
      }

      const target = posix.normalize(posix.join(posix.dirname(file), spec))
      // A folder prefix also matches the folder itself (`../types` names types/index.d.ts).
      const isAllowed = area.allowed.some(prefix => (prefix.endsWith('/') ? target.startsWith(prefix) || `${target}/` === prefix : target === prefix))

      if (!isAllowed) found.push(`${file}: imports '${spec}' (${target}), outside what ${area.prefix} may import`)
    }
  }

  return found
}

/** Every .ts/.tsx file under `dir`, keyed by its path relative to `root` with forward slashes. */
function sources(root: string, dir: string, out: Map<string, string> = new Map()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)

    if (statSync(full).isDirectory()) sources(root, full, out)
    else if (/\.tsx?$/.test(name)) out.set(relative(root, full).split(sep).join('/'), readFileSync(full, 'utf8'))
  }

  return out
}

/** Stops the self-test with what it found. */
function fail(what: string): never {
  throw new Error(`self-test: ${what}`)
}

/** Proves the checker: an allowed tree passes, and each kind of break is reported. */
function selfTest(): void {
  const ok = new Map([
    ['hooks/shared/text.ts', "import { C } from './tokens'\nimport type { StepLog } from '../../types'"],
    ['hooks/cockpit/head.ts', "import { cut } from './steps/rows'\nimport { vw } from '../shared/text'"],
    ['hooks/transcript/sites/tools.tsx', "import { isQuiet } from '../../cockpit/left'\nimport { layout } from '../../shared/layout'"],
    ['hooks/register.tsx', "import { registerCockpit } from './cockpit/feature'\nimport { registerReply } from './transcript/sites/reply'"]
  ])

  if (violations(ok).length > 0) fail(`an allowed tree was refused: ${violations(ok).join('; ')}`)

  const bad: [string, string, RegExp][] = [
    ['hooks/shared/time.ts', "import { cut } from '../cockpit/steps/rows'", /outside what hooks\/shared\//],
    ['hooks/cockpit/log.ts', "import { foo } from '../transcript/prose'", /outside what hooks\/cockpit\//],
    ['hooks/transcript/sites/reply.tsx', "import { stepRows } from '../../cockpit/steps/rows'", /outside what hooks\/transcript\//],
    ['hooks/transcript/prose.ts', "export { vw } from '../shared/text'", /re-exports/],
    ['hooks/shared/url.ts', "import x from 'node:path'", /only relative paths/]
  ]

  for (const [file, source, expected] of bad) {
    const got = violations(new Map([[file, source]]))

    if (!got.some(v => expected.test(v))) fail(`${file} should be refused (${expected}); got ${JSON.stringify(got)}`)
  }

  console.log(`boundaries self-test: ok (1 allowed tree, ${bad.length} breaks caught)`)
}

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  const root = process.cwd()
  const found = violations(sources(root, join(root, 'hooks')))

  if (found.length > 0) {
    console.error(found.join('\n'))
    process.exit(1)
  }

  console.log('hooks boundaries: ok')
}

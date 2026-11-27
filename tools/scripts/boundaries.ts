// The hooks' module boundaries, checked from source: `bun tools/scripts/boundaries.ts` (from the repository root),
// or `--self-test` to prove the checker itself. Each file under hooks/ may import only:
//   hooks/shared/**      shared/**, the repo-root types/, `claude-code`
//   hooks/cockpit/**     cockpit/**, shared/**, types/, `claude-code`
//   hooks/transcript/**  transcript/**, shared/**, types/, `claude-code`, and the cockpit's public surface only
//   hooks/statusline/**  statusline/**, shared/**, types/, `claude-code`
//   hooks/register.tsx   anything under hooks/ (it composes the features)
// and no file may re-export (`export … from`, `export *`): every import names the module that defines it. It also
// checks hooks/README.md against the folders under hooks/: every folder it names exists, and every folder is named;
// and that no debug row can ship: each `$.ui.log` row a person sees is a `cockpit:` or `ghostframe:` notice (or the
// `/tui` switch's `notice`), and a trace goes to the debug log alone (`{ to: 'debug' }`).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

/** The cockpit modules the transcript may import: named functions defined there, no re-exports. */
const COCKPIT_PUBLIC: readonly string[] = ['hooks/cockpit/feature', 'hooks/cockpit/left', 'hooks/cockpit/log', 'hooks/cockpit/switch']

/** A module's allowed import targets, as repo-relative path prefixes (without extension). */
type Area = { readonly prefix: string; readonly allowed: readonly string[] }

const AREAS: readonly Area[] = [
  { prefix: 'hooks/shared/', allowed: ['hooks/shared/', 'types/'] },
  { prefix: 'hooks/cockpit/', allowed: ['hooks/cockpit/', 'hooks/shared/', 'types/'] },
  { prefix: 'hooks/transcript/', allowed: ['hooks/transcript/', 'hooks/shared/', 'types/', ...COCKPIT_PUBLIC] },
  { prefix: 'hooks/statusline/', allowed: ['hooks/statusline/', 'hooks/shared/', 'types/'] }
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

// A hooks folder as hooks/README.md names it: `shared/`, `transcript/sites/reply/`, … (backticked, ending in a slash).
const README_FOLDER = /`((?:shared|cockpit|transcript|statusline)(?:\/[a-z0-9-]+)*)\/`/g

/**
 * Where hooks/README.md and the folders under hooks/ disagree, so the README cannot go stale: a folder it names
 * that does not exist, or a folder that exists and it does not name.
 * @param readme the README's text
 * @param folders every folder under hooks/, relative to hooks/ with forward slashes (`transcript/sites`)
 * @returns one message per mismatch, empty when they agree
 */
export function readmeDrift(readme: string, folders: readonly string[]): string[] {
  const named = new Set(Array.from(readme.matchAll(README_FOLDER), m => m[1] ?? ''))
  const exist = new Set(folders)

  return [
    ...[...named].filter(f => !exist.has(f)).map(f => `hooks/README.md names \`${f}/\`, which does not exist`),
    ...[...exist].filter(f => !named.has(f)).map(f => `hooks/${f}/ exists but hooks/README.md does not name it`)
  ]
}

// A `$.ui.log` call: its first argument's start, and what follows it (for a `{ to: 'debug' }` option).
const UI_LOG = /\$\.ui\.log\(\s*([^,)]{0,60})(?=([\s\S]{0,300}))/g
const NOTICE = /^(?:[`'"]cockpit: |notice\s*$)/
// Claude Code labels every plugin message with the plugin's name itself, in the transcript and the debug log alike, so
// a literal "ghostframe:" shows twice ("ghostframe: ghostframe: …", seen live).
const LABELLED = /^[`'"]ghostframe:/

/**
 * The `$.ui.log` rows that are not notices: a row a person would see in the transcript that no prefix names, such as
 * a probe's `probe19 load=…`, which a live check printed under every step; and any row, debug included, that starts
 * with its own "ghostframe:".
 * @param files repo-relative path (forward slashes) to source text
 * @returns one message per such call
 */
export function loggedRows(files: ReadonlyMap<string, string>): string[] {
  const found: string[] = []

  for (const [file, source] of files) {
    for (const m of source.matchAll(UI_LOG)) {
      const first = (m[1] ?? '').trim()
      const rest = m[2] ?? ''
      // The option may sit past the 60 characters read of the text: anywhere on the call's line.
      const isDebug = /^[^\n]*\{\s*to:\s*['"]debug['"]/.test(`${m[1] ?? ''}${rest}`)

      const line = source.slice(0, m.index).split('\n').length

      if (LABELLED.test(first)) {
        found.push(`${file}:${line}: $.ui.log row ${first.slice(0, 40)} starts with "ghostframe:", which Claude Code already adds`)
      } else if (!NOTICE.test(first) && !isDebug) {
        found.push(`${file}:${line}: $.ui.log row ${first.slice(0, 40)} is no cockpit: notice or notice variable; a trace goes { to: 'debug' }`)
      }
    }
  }

  return found
}

/** Every folder under `dir`, relative to it with forward slashes. */
function foldersUnder(dir: string, base = '', out: string[] = []): string[] {
  for (const name of readdirSync(join(dir, base))) {
    const rel = base === '' ? name : `${base}/${name}`

    if (statSync(join(dir, rel)).isDirectory()) {
      out.push(rel)
      foldersUnder(dir, rel, out)
    }
  }

  return out
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

// The two palettes: Cockpit's (spec section 2) and the transcript's with Cockpit off, kept as it is on main.
const PALETTES = new Set(['hooks/shared/look/palette.ts', 'hooks/shared/tokens.ts'])
// The folders Cockpit draws from, where a status glyph is always GLYPH's (spec section 4), never a literal.
const LOOK_FOLDERS = ['hooks/shared/look/', 'hooks/cockpit/rows/', 'hooks/transcript/rows/']
const HEX = /['"`]#[0-9a-fA-F]{6}\b/
const STATUS_GLYPH = /['"`][^'"`\n]*[✓×⊘◇◆●✕✗↗▸◼±][^'"`\n]*['"`]/

/**
 * Colour hexes outside the two palettes, and status glyph literals in the renderers' folders outside its glyph table.
 * @param files every source, by path
 * @returns one message per stray literal
 */
export function strayLiterals(files: ReadonlyMap<string, string>): string[] {
  const out: string[] = []

  for (const [file, text] of files) {
    if (!file.startsWith('hooks/') && !file.startsWith('statusline/')) continue

    for (const [i, line] of text.split('\n').entries()) {
      if (!PALETTES.has(file) && HEX.test(line) && !/^\s*(?:\/\/|\/?\*)/.test(line)) out.push(`${file}:${i + 1} holds a colour hex: use shared/look/palette.ts`)
      if (LOOK_FOLDERS.some(f => file.startsWith(f)) && file !== 'hooks/shared/look/glyphs.ts' && STATUS_GLYPH.test(line) && !/^\s*(?:\/\/|\/?\*)/.test(line)) {
        out.push(`${file}:${i + 1} holds a status glyph: use shared/look/glyphs.ts`)
      }
    }
  }

  return out
}

/**
 * The hooks that do not end with the 1 s guard (hooks/README.md): each `on('<event>', …)` hook's body, up to the `})`
 * that closes it at the same indent, must call `noteOwnTime(` with `next.budget`, so a hook past 1 s of its own work
 * says so in the debug log before the engine's 10 s budget skips it.
 * @param files repo-relative path (forward slashes) to source text
 * @returns one message per hook without it
 */
export function unguardedHooks(files: ReadonlyMap<string, string>): string[] {
  const out: string[] = []

  for (const [file, text] of files) {
    if (!file.startsWith('hooks/')) continue

    const lines = text.split('\n')

    for (const [i, line] of lines.entries()) {
      const opened = /^(\s*)on\('([\w.]+)'/.exec(line)

      if (opened === null) continue

      const indent = opened[1] ?? ''
      const close = lines.findIndex((l, k) => k > i && l.startsWith(`${indent}})`))
      const body = lines.slice(i, close < 0 ? lines.length : close + 1).join('\n')

      if (!/noteOwnTime\(\$, '[^']+', next\.budget\)/.test(body))
        out.push(`${file}:${i + 1}: the ${opened[2] ?? ''} hook does not end with noteOwnTime($, '<name>', next.budget)`)
    }
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

  const readme = 'Layout:\n- `shared/`: helpers.\n- `cockpit/`: the pane.\n- `cockpit/steps/`: the step log.'

  if (readmeDrift(readme, ['shared', 'cockpit', 'cockpit/steps']).length > 0) fail('a README that matches its folders was refused')
  if (!readmeDrift(readme, ['shared', 'cockpit']).some(v => /names `cockpit\/steps\/`, which does not exist/.test(v))) {
    fail('a README naming a missing folder passed')
  }
  if (!readmeDrift(readme, ['shared', 'cockpit', 'cockpit/steps', 'transcript']).some(v => /transcript\/ exists but/.test(v))) {
    fail('a folder the README does not name passed')
  }

  const logs = new Map([
    [
      'hooks/cockpit/a.ts',
      "$.ui.log(`cockpit: seat change failed: ${e}`)\n$.ui.log(notice)\n$.ui.log(notice, noticeSink())\n$.ui.log(`trace ${n}`, { to: 'debug' })"
    ]
  ])

  if (loggedRows(logs).length > 0) fail(`notices were refused: ${loggedRows(logs).join('; ')}`)
  if (loggedRows(new Map([['hooks/cockpit/pane.tsx', 'if (s !== last) { last = s; $.ui.log(s) }\n$.ui.log(`probe19 load=${id}`)']])).length !== 2) {
    fail('a debug row passed')
  }

  const labelled = new Map([
    ['hooks/statusline/command.ts', "$.ui.log('ghostframe: x')\n$.ui.log(`ghostframe: ${what}`, noticeSink())\n$.ui.log(\"ghostframe: t\", { to: 'debug' })"]
  ])

  if (loggedRows(labelled).length !== 3) fail(`a literal "ghostframe:" prefix passed: ${loggedRows(labelled).join('; ')}`)

  const literals = new Map([
    ['hooks/shared/look/palette.ts', "const a = '#0B0B0E'"],
    ['hooks/cockpit/rows/row.ts', 'const ok = GLYPH.ok\n// ✓ in a comment'],
    ['hooks/transcript/prose.ts', "const tick = '✓'"]
  ])

  if (strayLiterals(literals).length > 0) fail(`allowed literals were refused: ${strayLiterals(literals).join('; ')}`)
  if (strayLiterals(new Map([['hooks/cockpit/rows/row.ts', "const a = '#ffffff'\nconst b = '× failed'"]])).length !== 2) fail('a stray literal passed')

  const guarded =
    "  on('tool.call', async ($, e, next) => {\n    try {\n      return await next(e)\n    } finally {\n      noteOwnTime($, 'tool.call', next.budget)\n    }\n  })"
  const bare = "  on('tool.judge', async ($, e, next) => {\n    return next(e)\n  })"

  if (unguardedHooks(new Map([['hooks/transcript/ledger/calls.ts', guarded]])).length > 0) fail('a guarded hook was refused')
  if (unguardedHooks(new Map([['hooks/transcript/ledger/calls.ts', `${guarded}\n${bare}`]])).length !== 1) fail('a hook without the guard passed')

  console.log(
    `boundaries self-test: ok (1 allowed tree, ${bad.length} breaks caught, README drift caught both ways, debug rows caught, "ghostframe:" prefixes caught, stray literals caught, an unguarded hook caught)`
  )
}

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  const root = process.cwd()
  const hooks = join(root, 'hooks')
  const files = sources(root, hooks)
  // The status line program draws with the same palette: its sources (not its specs) hold no colour hex either.
  const statusline = new Map([...sources(root, join(root, 'statusline'))].filter(([f]) => !f.endsWith('.spec.ts')))
  const found = [
    ...violations(files),
    ...loggedRows(files),
    ...strayLiterals(new Map([...files, ...statusline])),
    ...unguardedHooks(files),
    ...readmeDrift(readFileSync(join(hooks, 'README.md'), 'utf8'), foldersUnder(hooks))
  ]

  if (found.length > 0) {
    console.error(found.join('\n'))
    process.exit(1)
  }

  console.log('hooks boundaries: ok')
}

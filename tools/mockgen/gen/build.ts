// Build chat-design-v7.md: join the templates, replace <<mock>> placeholders, check everything.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codePoint, mocks, nth, render, textOf } from './lib'

const here = dirname(fileURLToPath(import.meta.url))
for (const f of readdirSync(here)
  .filter(n => n.startsWith('mocks-'))
  .toSorted())
  // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: the registry order is the DRAFT order
  await import('./' + f)

// glyph check: every symbol a mock uses must be in the vocabulary of section D.3
const ALLOWED = new Set(Array.from('▍│✕⊘✓↗±↺◇●›※∴⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠿─┄·…↩→▰▱▸▏¹²³⁴⁵⁶⁷⁸⁹⁰█×−└★', codePoint))
const symbol = (cp: number): boolean => (cp >= 0x2000 && cp <= 0x2bff) || (cp >= 0xe000 && cp <= 0xf8ff) || cp === 0xd7 || cp === 0xb1 || cp === 0xb7
const ICONS = new Set([0xf2db, 0xf07b, 0xe0a0, 0xf040, 0xf0e4, 0xf017, 0xf073])
const QUOTED = new Set(['e-figure', 'f24', 'g-width', 'i-card']) // mocks that quote foreign art or test glyphs
const bad = new Map<string, string>()
for (const [name, k] of mocks) {
  if (QUOTED.has(nth(name.split(':'), 0))) continue
  for (const l of k.lines)
    for (const ch of textOf(l)) {
      const cp = codePoint(ch)
      if (symbol(cp) && !ALLOWED.has(cp) && !ICONS.has(cp)) bad.set(ch, name)
    }
}
if (bad.size) throw new Error('glyphs outside the vocabulary: ' + [...bad].map(([c, n]) => `${c} U+${codePoint(c).toString(16)} in ${n}`).join(', '))

const draft = process.env['DRAFT'] // DRAFT=1 dumps every mock, DRAFT=f31 the ones with that prefix
const NL = String.fromCharCode(10)
const tpl = draft
  ? [...mocks.keys()]
      .filter(n => draft === '1' || n.startsWith(draft))
      .map(n => ['## ' + n, '', '<<' + n + '>>', ''].join(NL))
      .join(NL)
  : readdirSync(join(here, '..', 'tpl'))
      .filter(n => n.endsWith('.md'))
      .toSorted()
      .map(n => readFileSync(join(here, '..', 'tpl', n), 'utf8'))
      .join('\n')
const used = new Set()
const out = tpl.replace(/^<<([\w:.-]+)>>$/gm, (_: string, name: string) => {
  used.add(name)
  return render(name)
})
const left = out.match(/<<[\w:.-]+>>/g)
if (left) throw new Error('unresolved placeholders: ' + left.join(' '))
const unused = [...mocks.keys()].filter(n => !used.has(n))
if (unused.length && !draft) throw new Error('mocks never placed: ' + unused.join(' '))

// final check on the document itself: every line of every text block has one width per block
let block: { w: number | null } | null = null
let n = 0
const wcw = (s: string): number => {
  let w = 0
  for (const ch of s) {
    const cp = codePoint(ch)
    if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff)) continue
    w +=
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff)
        ? 2
        : 1
  }
  return w
}
for (const line of out.split('\n')) {
  if (/^```(text|paint|bg)$/.test(line)) {
    block = { w: null }
    n += 1
    continue
  }
  if (line.startsWith('```')) {
    block = null
    continue
  }
  if (!block) continue
  const w = wcw(line)
  if (block.w === null) block.w = w
  else if (block.w !== w) throw new Error(`block ${n}: a line is ${w} cells, the block is ${block.w}: ${line}`)
}
const dest = process.argv[2] ?? join(here, '..', 'chat-design-v7.md')
writeFileSync(dest, out)
console.log(`ok · ${mocks.size} mocks · ${n} blocks · ${(out.length / 1024).toFixed(0)} k chars · ${out.split('\n').length} lines -> ${dest}`)

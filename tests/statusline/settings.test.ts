import { expect, test } from 'claude-code/testing'

import { commandOf, diffOf, entryOf, planOf, spanOf, withStatusLine } from '../../hooks/statusline/settings'

// The installer's plan: only the `statusLine` entry's bytes change; every other key, its order, the indentation and
// the line endings stay as the person wrote them.
const ENTRY = entryOf('C:/Users/me/.claude/ghostframe/statusline.js')
const SETTINGS = `{
  "model": "opus",
  "statusLine": {
    "type": "command",
    "command": "bun ~/.claude/ghostframe-statusline.ts",
    "padding": 0
  },
  "permissions": { "allow": ["Bash(git status)", "a \\"quoted\\" }{ string"] }
}
`

test('the entry: bun on the bundled script, padding 0, refresh 10 s; forward slashes, quoted when spaced', async () => {
  expect(ENTRY).toEqual({ type: 'command', command: 'bun C:/Users/me/.claude/ghostframe/statusline.js', padding: 0, refreshInterval: 10 })
  expect(commandOf('C:\\Users\\Jo Ann\\.claude\\ghostframe\\statusline.js')).toBe('bun "C:/Users/Jo Ann/.claude/ghostframe/statusline.js"')
})

test('finds a top-level key past strings that hold braces and quotes', async () => {
  const span = spanOf(SETTINGS, 'permissions')

  expect(span === null ? '' : SETTINGS.slice(span.valueStart, span.valueEnd)).toBe('{ "allow": ["Bash(git status)", "a \\"quoted\\" }{ string"] }')
  expect(spanOf(SETTINGS, 'hooks')).toBeNull()
})

test('replacing the entry changes only its value', async () => {
  const next = withStatusLine(SETTINGS, ENTRY)
  const parsed = JSON.parse(next) as Record<string, unknown>

  expect(parsed['statusLine']).toEqual(ENTRY)
  expect(Object.keys(parsed)).toEqual(['model', 'statusLine', 'permissions'])
  expect(next.startsWith('{\n  "model": "opus",\n  "statusLine": {\n    "type": "command",')).toBe(true)
  expect(next.endsWith('  "permissions": { "allow": ["Bash(git status)", "a \\"quoted\\" }{ string"] }\n}\n')).toBe(true)
})

test('adding the entry puts it last; removing it takes one comma with it', async () => {
  const added = withStatusLine('{\n  "model": "opus"\n}\n', ENTRY)

  expect(Object.keys(JSON.parse(added) as object)).toEqual(['model', 'statusLine'])
  expect(withStatusLine(added, null)).toBe('{\n  "model": "opus"\n}\n')

  const removed = withStatusLine(SETTINGS, null)

  expect(JSON.parse(removed)).toEqual({ model: 'opus', permissions: { allow: ['Bash(git status)', 'a "quoted" }{ string'] } })
  expect(JSON.parse(withStatusLine('{}', ENTRY))).toEqual({ statusLine: ENTRY })
})

test('keeps CRLF line endings and a 4-space indent', async () => {
  const crlf = '{\r\n    "model": "opus",\r\n    "statusLine": { "type": "command", "command": "x" }\r\n}\r\n'
  const next = withStatusLine(crlf, ENTRY)

  expect(next.includes('\n') && !/[^\r]\n/.test(next)).toBe(true)
  expect(next).toContain('\r\n    "statusLine": {\r\n        "type": "command",')
})

test('restoring the previous entry gives back the original text', async () => {
  const before = JSON.parse(SETTINGS) as { statusLine: never }

  expect(JSON.parse(withStatusLine(withStatusLine(SETTINGS, ENTRY), before.statusLine))).toEqual(JSON.parse(SETTINGS))
})

test('refuses a settings file that is not a JSON object', async () => {
  expect(() => withStatusLine('{ "model": ', ENTRY)).toThrow()
  expect(() => withStatusLine('[1]', ENTRY)).toThrow()
})

test('the diff shows the changed lines with context; no change, no diff', async () => {
  const plan = planOf(SETTINGS, ENTRY)

  expect(plan.isChange).toBe(true)
  expect(plan.diff).toContain('-     "command": "bun ~/.claude/ghostframe-statusline.ts",')
  expect(plan.diff).toContain('+     "command": "bun C:/Users/me/.claude/ghostframe/statusline.js",')
  expect(plan.diff).toContain('+     "refreshInterval": 10')
  // Two lines of context above the first change: the entry's key and its unchanged `type`.
  expect(plan.diff.split('\n').slice(0, 3)).toEqual(['@@ line 3 @@', '    "statusLine": {', '      "type": "command",'])
  expect(planOf(plan.text, ENTRY)).toEqual({ text: plan.text, diff: '', isChange: false })
  expect(diffOf('a', 'a')).toBe('')
})

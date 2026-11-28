import { expect, test } from 'claude-code/testing'

import { looksSecret } from '../../../hooks/transcript/rows/secret'

// A paste that looks like it holds a secret keeps the plain label instead of a preview (7.2). The detector errs towards
// catching: a missed secret shows on screen, a false catch only hides a preview. Every value below is fake.
// Each fake key is built from pieces at run time: secret scanners (GitHub push protection) read the source text and
// block a whole key-shaped literal, fake or not, while the detector under test only ever sees the joined string.
const fake = (...pieces: string[]) => pieces.join('')
const CAUGHT: [string, string][] = [
  ['an Anthropic key', fake('ANTHROPIC_API_KEY is ', 'sk-', 'ant-', 'api03-', 'FAKE', '0'.repeat(28))],
  ['an OpenAI key', fake('key: ', 'sk-', 'proj-', 'FAKEabcdefghijklmnopqrstuvwx0123')],
  ['a GitHub token', fake('git remote set-url origin https://', 'ghp', '_', 'FAKEabcdefghijklmnopqrstuvwxyz0123', '@github.com/x/y')],
  ['a GitHub fine-grained token', fake('github', '_pat_', '11FAKE', '0'.repeat(16), '_abcdefghijklmnopqrstuvwxyz')],
  ['a GitHub OAuth token', fake('gho', '_', 'FAKEabcdefghijklmnopqrstuvwxyz0123')],
  ['an AWS access key id', fake('aws_access_key_id = ', 'AKIA', 'FAKE0000EXAMPLE1')],
  ['an AWS session key id', fake('ASIA', 'FAKE0000EXAMPLE2')],
  ['a Slack token', fake('SLACK=', 'xox', 'b-', '0'.repeat(10), '-', 'FAKE'.repeat(4))],
  ['a GitLab token', fake('glpat', '-', 'FAKEabcdefghij0123456789')],
  ['a Google API key', fake('AI', 'za', 'FAKE_abcdefghijklmnopqrstuvwxyz01234')],
  ['a Stripe key', fake('sk_', 'live_', 'FAKEabcdefghijklmnop0123')],
  ['an env assignment', 'DATABASE_PASSWORD=hunter2hunter2'],
  ['an exported token', 'export GITHUB_TOKEN="abc123def456"'],
  ['a KEY= line', 'STRIPE_SECRET_KEY=whatever-it-is'],
  ['a JSON key', '{ "api_key": "abcd1234efgh5678" }'],
  ['a YAML secret', 'client_secret: "p4ssw0rd-long-one"'],
  ['a quoted password in code', "const password = 'correct-horse-battery'"],
  ['a PEM block', fake('-----BEGIN OPENSSH ', 'PRIVATE KEY', '-----')],
  ['an RSA PEM block', fake('-----BEGIN RSA ', 'PRIVATE KEY', '-----')],
  ['a long random token', 'Authorization: Bearer Zx9Qm2LkP7vRt4Wn8Ys1Hd6Jf3Gb5Kc0'],
  ['a JWT', fake('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiJGQUtFIn0', '.', 'FAKEsignatureFAKEsignature0123')]
]

const PLAIN: [string, string][] = [
  ['ordinary code', 'const token = getToken(request)\nif (!token) throw new Error("no token")\nreturn token.slice(0, 8)'],
  ['a function on passwords', 'function hashPassword(password: string): string {\n  return bcrypt.hashSync(password, 10)\n}'],
  ['an env reference, not a value', 'export API_KEY=$API_KEY\nTOKEN=${TOKEN}'],
  ['a git log with SHAs', 'commit 58fef0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7\nAuthor: someone\n\n    fix(cockpit): name every Files row'],
  ['a full hex SHA-256', 'sha256: 30e2724e2aecb1bf5dc9f3130901afb71c5fa229051c190a6d7ad9aff6378d6d'],
  ['UUIDs in a log', '2026-11-28 13:03:51 request 7baa38c7-f204-40c6-beab-cee90f4c64b2 done in 12 ms'],
  ['ordinary JSON', '{ "id": "a1B2c3", "tokenCount": 1234, "name": "ghostframe", "keywords": ["cockpit", "tui"] }'],
  ['JSON with a token count', '{ "usage": { "input_tokens": 120, "output_tokens": 48 }, "stop_reason": "end_turn" }'],
  ['a stack trace', 'TypeError: Cannot read properties of undefined (reading "text")\n    at pasteShown (hooks/transcript/rows/turn.ts:90:12)'],
  ['a long camelCase name', 'export function drawTheTurnHeaderWithItsClockAndNumber(header: Header) {}'],
  ['a long path', 'D:/Projects/ghostframe-wt/paste-preview/tests/transcript/sites/prompt.paste.test.tsx'],
  ['a URL', 'https://github.com/tashfiqul-islam/ghostframe/actions/runs/12345678901/job/98765432101'],
  ['prose about keys', 'Press the key twice. The secret is to keep the password manager open.'],
  ['a markdown table', '| Option | Default |\n| ------ | ------- |\n| cockpit | on |']
]

for (const [what, text] of CAUGHT) {
  test(`caught: ${what}`, () => {
    expect(looksSecret(text)).toBe(true)
  })
}

for (const [what, text] of PLAIN) {
  test(`not caught: ${what}`, () => {
    expect(looksSecret(text)).toBe(false)
  })
}

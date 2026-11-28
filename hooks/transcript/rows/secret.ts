// Whether a paste looks like it holds a secret (7.2): such a paste keeps the plain `[Pasted text #1 +N lines]` label,
// so a key never shows on screen or in a screenshot. It errs towards catching: a false catch only hides a preview.

// Known key shapes: Anthropic, OpenAI, GitHub, AWS, Slack, GitLab, Google, Stripe, npm, Hugging Face, and JWTs.
const KEY_SHAPE = new RegExp(
  [
    String.raw`\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}`,
    String.raw`\bgh[pousr]_[A-Za-z0-9]{20,}`,
    String.raw`\bgithub_pat_[A-Za-z0-9_]{20,}`,
    String.raw`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`,
    String.raw`\bxox[abposr]-[A-Za-z0-9-]{10,}`,
    String.raw`\bglpat-[A-Za-z0-9_-]{20,}`,
    String.raw`\bAIza[0-9A-Za-z_-]{35}`,
    String.raw`\b[rs]k_(?:live|test)_[0-9A-Za-z]{16,}`,
    String.raw`\bnpm_[A-Za-z0-9]{36}`,
    String.raw`\bhf_[A-Za-z]{30,}`,
    String.raw`\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`
  ].join('|')
)

// A PEM block: keys and certificates alike.
const PEM = /-----BEGIN [A-Z0-9 ]+-----/

// `NAME=value` with a secret-sounding upper-case name and a literal value (not `$NAME` or `${NAME}`).
const ENV_ASSIGN = /^\s*(?:export\s+)?[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIALS?)[A-Z0-9_]*\s*=\s*["']?[^\s"'$]{6,}/m

// `name: "value"` or `name = 'value'` in JSON, YAML or code: a secret-sounding name and a quoted literal of 8 or more
// cells with no space (`const token = getToken()` and `"tokenCount": 12` are not literals).
const QUOTED_ASSIGN =
  /["']?[\w.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|access[_-]?key|credential)[\w.-]*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i

// A long random string: 32 or more characters of the base64 and URL-safe alphabet, with upper case, lower case and a
// digit, at 4.3 bits a character or more. Hex alone tops out at 4 bits (git SHAs, SHA-256 sums, UUIDs never pass),
// and words and paths stay under it; 32 random base64 characters land near 4.6 to 4.9.
const TOKEN_RUN = /[A-Za-z0-9+/_=-]{32,}/g
const MIN_BITS = 4.3

/**
 * Shannon entropy of a string, in bits a character.
 * @param s the string
 * @returns its entropy
 */
function bitsPerChar(s: string): number {
  const counts = new Map<string, number>()

  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)

  let bits = 0

  for (const n of counts.values()) bits -= (n / s.length) * Math.log2(n / s.length)

  return bits
}

const isRandom = (run: string): boolean => /[A-Z]/.test(run) && /[a-z]/.test(run) && /\d/.test(run) && bitsPerChar(run) >= MIN_BITS

/**
 * Whether a paste looks like it holds a secret: a known key shape, a PEM block, a secret-sounding assignment with a
 * literal value, or a long random string.
 * @param text the pasted text
 * @returns whether it does
 */
export function looksSecret(text: string): boolean {
  return KEY_SHAPE.test(text) || PEM.test(text) || ENV_ASSIGN.test(text) || QUOTED_ASSIGN.test(text) || (text.match(TOKEN_RUN) ?? []).some(isRandom)
}

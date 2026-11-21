import { COMMIT_HEAD, GIT_COMMIT, GIT_PUSH } from './describe'
import { clean, stripNoise } from './tests'

// ─── Shipped: what a shell call committed, pushed or opened ───────────────────

export type Ship = {
  id: string
  turn?: string | null
  commit?: { sha: string; subject: string; files: number; adds: number; dels: number }
  push?: { from: string; to: string }
  pr?: { n: number; url: string; head?: string; base?: string }
}

/** A command's words, quotes respected: `--title "fix -B main"` is two words, the second still quoted. */
const words = (command: string) => command.match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) ?? []
const unquote = (word: string) => word.replace(/"([^"]*)"|'([^']*)'/g, '$1$2')

/** A flag's value (`--base main`, `--base=main`, `-B main`); a flag inside a quoted word is not one. */
const flag = (command: string, names: string[]) => {
  const ws = words(command)

  for (const n of names) {
    for (const [i, w] of ws.entries()) {
      const next = ws[i + 1]

      if (w === n && next !== undefined) return unquote(next)
      if (w.startsWith(`${n}=`)) return unquote(w.slice(n.length + 1))
    }
  }

  return undefined
}

export const isShipCommand = (command: string): boolean => GIT_COMMIT.test(command) || GIT_PUSH.test(command) || /\bgh\s+pr\s+create\b/.test(command)

/** What a shell call shipped, read from its command and output; nothing → undefined. */
export function parseShip(id: string, command: string, raw: string): Ship | undefined {
  const text = clean(raw)
  const ship: Ship = { id }

  if (GIT_COMMIT.test(command)) {
    const head = COMMIT_HEAD.exec(text)
    const stat = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(text)

    if (head !== null) {
      ship.commit = {
        sha: (head[1] ?? '').slice(0, 7),
        subject: (head[2] ?? '').trim(),
        files: Number(stat?.[1] ?? 0),
        adds: Number(stat?.[2] ?? 0),
        dels: Number(stat?.[3] ?? 0)
      }
    }
  }

  if (GIT_PUSH.test(command)) {
    const m = /^\s*[+*=!-]?\s*(?:[0-9a-f]+\.\.\.?[0-9a-f]+|\[new branch\]|\[new tag\])\s+(\S+)\s+->\s+(\S+)/m.exec(text)

    if (m !== null) ship.push = { from: m[1] ?? '', to: m[2] ?? '' }
  }

  if (/\bgh\s+pr\s+create\b/.test(command)) {
    const m = /(https:\/\/\S+\/pull\/(\d+))/.exec(text)

    if (m !== null) {
      const head = flag(command, ['--head', '-H'])
      const base = flag(command, ['--base', '-B'])

      ship.pr = { n: Number(m[2]), url: m[1] ?? '', ...(head !== undefined ? { head } : {}), ...(base !== undefined ? { base } : {}) }
    }
  }

  return ship.commit || ship.push || ship.pr ? ship : undefined
}

/** A shell call's output as text: stdout and stderr, or the error text the model read. */
export function shellText(output: unknown): string {
  if (typeof output === 'string') return stripNoise(output)

  if (typeof output === 'object' && output !== null) {
    const stdout = 'stdout' in output ? output.stdout : undefined
    const stderr = 'stderr' in output ? output.stderr : undefined

    return stripNoise([stdout, stderr].filter((x): x is string => typeof x === 'string').join('\n'))
  }

  return ''
}

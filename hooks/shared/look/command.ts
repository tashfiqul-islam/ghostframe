// The `cd` prefix (spec 13.4): Claude often runs `cd <dir> && <command>`; a step shows the command only, and its
// drawer says where it ran when that is not the project root.

// One leading change of folder and what joins it to the command: `cd <dir> &&`, `cd <dir>;`, `cd /d <dir> &&`,
// `pushd <dir> &&`, `Set-Location <dir>;`. The folder may be quoted.
const PREFIX = /^\s*(?:cd(?:\s+\/d)?|pushd|Set-Location(?:\s+-(?:Literal)?Path)?)\s+("[^"]*"|'[^']*'|[^\s;&]+)\s*(?:&&|;)\s*/i

/**
 * A command with its leading `cd` prefixes stripped, repeatedly, and the last folder they moved to.
 * @param cmd the command as Claude ran it
 * @returns the command, and the folder (undefined when there was no prefix)
 */
export function stripCd(cmd: string): { command: string; dir: string | undefined } {
  let rest = cmd
  let dir: string | undefined

  for (let m = PREFIX.exec(rest); m !== null; m = PREFIX.exec(rest)) {
    dir = (m[1] ?? '').replace(/^["']|["']$/g, '')
    rest = rest.slice(m[0].length)
  }

  return { command: rest.trim(), dir }
}

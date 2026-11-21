import { fitParts, partsWidth } from '../shared/parts'
import type { Part } from '../shared/parts'
import { C } from '../shared/tokens'

const unmark = (s: string) => s.replace(/\*\*|__|`/g, '').trim()

// ─── Notices (single lines, never framed) ────────────────────────────────────

/** A slash command's one-line output as a notice: `/  /effort high · applies from next turn`. */
export function commandNotice(command: string, args: string, text: string, width: number): Part[] | undefined {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length !== 1 || command.length === 0) return undefined

  const body = unmark(lines[0] ?? '')
  const parts: Part[] =
    command === 'compact'
      ? [
          { t: '↻  ', color: C.dim },
          { t: 'context compacted', color: C.muted },
          { t: ` · ${body}`, color: C.dim }
        ]
      : [
          { t: '/  ', color: C.dim },
          // Engine lines use muted and dim only (§0.2): a notice never competes with prose.
          { t: `/${command}${args.trim().length > 0 ? ` ${args.trim()}` : ''}`, color: C.muted },
          { t: ` · ${body}`, color: C.dim }
        ]

  // A notice is one line: as long as it needs, clipped at the measure.
  return partsWidth(parts) <= width ? parts : fitParts(parts, width)
}

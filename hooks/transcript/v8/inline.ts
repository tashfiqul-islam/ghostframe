// Inline markdown on the left (spec 7.4): code and paths bright, bold, footnote refs, links' text. Pure.
import type { Part } from '../../shared/parts'
import { TOKEN } from '../../shared/look/palette'

/**
 * Inline markdown as parts (7.4): `code` and paths bright with their backticks dropped, `**bold**` bold, a footnote
 * ref `[1]` in `machine`, a link's text with its URL dropped.
 */
export function inline(text: string, color: string): Part[] {
  const out: Part[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[(\d+)\]|\[([^\]]+)\]\([^)]+\)/g
  let at = 0

  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push({ t: text.slice(at, m.index), color })

    if (m[1] !== undefined) out.push({ t: m[1], color: TOKEN.textBright })
    else if (m[2] !== undefined) out.push({ t: m[2], color, bold: true })
    else if (m[3] !== undefined) out.push({ t: `[${m[3]}]`, color: TOKEN.machine })
    else out.push({ t: m[4] ?? '', color })

    at = m.index + m[0].length
  }

  if (at < text.length) out.push({ t: text.slice(at), color })

  return out
}

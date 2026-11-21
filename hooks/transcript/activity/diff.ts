import { num, obj, s } from '../../shared/calls/fields'
import type { Tone } from '../../shared/calls/results'
import { vw } from '../../shared/text'
import { clipPath } from '../../shared/url'

// ─── Diff card (§5.5) ────────────────────────────────────────────────────────

/**
 * Top edge `+┄┄ [ title · +a −r ] ┄…┄ meta +` in exactly `width` cells:
 * fixed parts take 12 (15 with the ` · ` before counts), the path clips at
 * folder boundaries, the ┄ run takes the rest.
 */
export function diffTop(width: number, path: string, parts: Tone[], meta: string) {
  const counts = parts.length > 0 ? 3 + vw(parts.map(p => p.text).join(' ')) : 0
  const fixed = 12 + counts + vw(meta)
  const title = clipPath(path, Math.max(4, width - fixed - 2))
  const fill = Math.max(2, width - fixed - vw(title))

  return { title, fill, total: fixed + vw(title) + fill }
}
export type DiffRow = { kind: 'add' | 'del' | 'ctx' | 'gap'; no: number | undefined; text: string }

export function diffRows(output: unknown): { path: string; rows: DiffRow[]; adds: number; dels: number } | undefined {
  const o = obj(output)
  const path = s(o?.['filePath'])
  const patch = o?.['structuredPatch']

  if (o === undefined || path === undefined || !Array.isArray(patch)) return undefined

  const rows: DiffRow[] = []

  if (patch.length === 0) {
    // A created file: every line is new.
    const content = s(o['content'])

    if (content === undefined) return undefined

    content
      .replace(/\n$/, '')
      .split('\n')
      .forEach((t, k) => rows.push({ kind: 'add', no: k + 1, text: t }))

    return { path, rows, adds: rows.length, dels: 0 }
  }

  let adds = 0
  let dels = 0

  patch.forEach((h, hi) => {
    const hunk = obj(h)
    const lines = hunk?.['lines']
    let oldNo = num(hunk?.['oldStart']) ?? 0
    let newNo = num(hunk?.['newStart']) ?? 0

    if (!Array.isArray(lines)) return
    if (hi > 0) rows.push({ kind: 'gap', no: undefined, text: '' })

    for (const l of lines) {
      if (typeof l !== 'string') continue

      const body = l.slice(1)

      if (l.startsWith('+')) {
        rows.push({ kind: 'add', no: newNo++, text: body })
        adds++
      } else if (l.startsWith('-')) {
        rows.push({ kind: 'del', no: oldNo++, text: body })
        dels++
      } else if (l.startsWith('\\')) {
        continue
      } else {
        rows.push({ kind: 'ctx', no: newNo++, text: body })
        oldNo++
      }
    }
  })

  return rows.length > 0 ? { path, rows, adds, dels } : undefined
}

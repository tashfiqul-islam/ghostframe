import { splitBlocks } from '../../hooks/transcript/blocks/split'
import type { FigureBlock } from '../../hooks/transcript/figure/fence'
import type { Part } from '../../hooks/shared/parts'

export const DIM = '#4e4e5a'

/** An mdxcn fence: the official 50-cell frame around `rows`. */
export const frame = (title: string, rows: string[]) => {
  const t = ` [ ${title} ] `
  const l = Math.floor((50 - t.length) / 2)
  const row = (r: string) => `|${` ${r}`.padEnd(50)}|`

  return [`+${'-'.repeat(l)}${t}${'-'.repeat(50 - l - t.length)}+`, row(''), ...rows.map(row), row(''), `+${'-'.repeat(50)}+`].join('\n')
}

export const STEPS = [
  ['SessionStart', 'inject context'],
  ['UserPromptSubmit', 'add context or block the prompt'],
  ['PreToolUse', 'allow, deny, or rewrite tool input'],
  ['PermissionRequest', undefined],
  ['PostToolUse', 'read result, feed notes back'],
  ['Stop', 'end turn, or block and continue'],
  ['SessionEnd', 'cleanup']
] as const

export const stepRows = STEPS.flatMap(([title, desc], i) => [
  `${i + 1}  ${title}`,
  ...(desc === undefined ? [] : [`   ${desc}`]),
  ...(i < STEPS.length - 1 ? ['│'] : [])
])

export const LOOPS = ['repeat: 3-5 per tool call', 'back: 6->3 continue', '']

export const HOOKS = frame('HOOKS', [...LOOPS, ...stepRows])

export const fig = (body: string): FigureBlock => {
  const f = splitBlocks('```\n' + body + '\n```\n').find(b => b.kind === 'figure')
  if (f?.kind !== 'figure') throw new Error('not a figure')
  return f
}

export const text = (l: Part[]) => l.map(p => p.t).join('')

/** A frame's body rows (top and bottom rules dropped, notes under the frame dropped). */
export const body = (lines: Part[][]) => {
  const bottom = lines.findIndex((l, i) => i > 0 && text(l).startsWith('+'))
  return lines.slice(1, bottom)
}

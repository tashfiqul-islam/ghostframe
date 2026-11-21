// A new file's diff card: its framed, numbered rows.
import type { RenderChildren } from 'claude-code'

import { changeParts } from '../../shared/calls/results'
import { G } from '../../shared/layout'
import type { Ui } from '../../shared/rule'
import { pad, vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { relPath } from '../../shared/url'
import { diffTop } from '../activity/diff'
import type { diffRows } from '../activity/diff'
import { frameLabel } from '../frame'
import { sessionCwd } from '../ledger/session'

// `+┄┄ [ path · +18 −4 ] ┄┄┄…┄┄ 22 lines +`, numbered rows, folded past 12 (§5.5).
export const drawDiff = (ui: Ui, diff: NonNullable<ReturnType<typeof diffRows>>, width: number) => {
  const { Box, Text } = ui
  const inner = width - 4
  const MAX = 12
  const shown = diff.rows.length > MAX ? diff.rows.slice(0, MAX - 1) : diff.rows
  const more = diff.rows.length - shown.length
  const noW = Math.max(2, ...diff.rows.map(r => String(r.no ?? '').length))
  const meta = `${diff.rows.filter(r => r.kind !== 'gap').length} lines`
  const parts = changeParts(diff.adds, diff.dels)
  const { title, fill } = diffTop(width, relPath(diff.path, sessionCwd()), parts, meta)

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- captures `Text` from `ui` through JSX (`<Text>`), which the rule does not see
  const edge = (body: RenderChildren, k: string) => (
    <Text key={k} wrap="truncate">
      <Text color={C.hairline}>{`${G.vEdge} `}</Text>
      {body}
      <Text color={C.hairline}>{` ${G.vEdge}`}</Text>
    </Text>
  )

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text wrap="truncate">
        <Text color={C.ruleStrong}>{G.cross}</Text>
        <Text color={C.hairline}>{`${G.hEdge.repeat(2)} `}</Text>
        {frameLabel(title, [
          ...(parts.length > 0 ? [{ t: ' · ', color: C.muted }] : []),
          ...parts.flatMap((p, i) => [...(i > 0 ? [{ t: ' ', color: C.text }] : []), { t: p.text, color: p.color }])
        ]).map((p, i) => (
          <Text key={`l${i}`} color={p.color}>
            {p.t}
          </Text>
        ))}
        <Text color={C.hairline}>{` ${G.hEdge.repeat(fill)} `}</Text>
        <Text color={C.muted}>{meta}</Text>
        <Text color={C.hairline}> </Text>
        <Text color={C.ruleStrong}>{G.cross}</Text>
      </Text>
      {shown.map((r, i) => {
        if (r.kind === 'gap') {
          return edge(<Text color={C.dim}>{pad(`${' '.repeat(noW)}   ⋯`, inner)}</Text>, `d${i}`)
        }

        const sign = r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '
        const color = r.kind === 'add' ? C.add : r.kind === 'del' ? C.del : C.text
        const body = pad(r.text.replace(/\t/g, '  '), inner - noW - 3)

        return edge(
          [
            <Text key="n" color={C.muted}>
              {pad(String(r.no ?? ''), noW, 'right')}
            </Text>,
            <Text key="s" color={color}>{` ${sign} `}</Text>,
            <Text key="b" color={color}>
              {body}
            </Text>
          ],
          `d${i}`
        )
      })}
      {more > 0 &&
        edge(
          [
            <Text key="m" color={C.dim}>{`${G.hEdge.repeat(2)} ${more} more lines ${G.hEdge.repeat(2)}  `}</Text>,
            <Text key="k" color={C.muted}>
              {pad('ctrl+o', inner - vw(`${G.hEdge.repeat(2)} ${more} more lines ${G.hEdge.repeat(2)}  `))}
            </Text>
          ],
          'more'
        )}
      <Text wrap="truncate">
        <Text color={C.ruleStrong}>{G.cross}</Text>
        <Text color={C.hairline}>{G.hEdge.repeat(width - 2)}</Text>
        <Text color={C.ruleStrong}>{G.cross}</Text>
      </Text>
    </Box>
  )
}

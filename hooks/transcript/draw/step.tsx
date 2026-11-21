// A step row and the activity rule over a turn's first step, and a step's time.
import type { StepStamp } from '../../../types'
import { G } from '../../shared/layout'
import type { Ui } from '../../shared/rule'
import { fmtDuration } from '../../shared/time'
import { C } from '../../shared/tokens'
import { layoutStep } from '../activity/row'
import { VERB_W } from '../activity/steps'
import type { Step } from '../activity/steps'

// One step row in the content column: `● verb    target ……… result   time`, then `╰─ detail`.
export const drawStep = (ui: Ui, step: Step, time: string, width: number, key: string) => {
  const { Box, Text } = ui
  const l = layoutStep(step, time, width)

  return (
    <Box key={key} flexDirection="column">
      <Text wrap="truncate">
        <Text color={step.dot.color}>{`${step.dot.text} `}</Text>
        <Text color={C.muted}>{l.verb}</Text>
        <Text color={step.targetColor ?? C.textBright}>{l.target}</Text>
        <Text>{l.gap}</Text>
        {step.result.flatMap((r, i) => [
          ...(i > 0 ? [<Text key={`rs${i}`}> </Text>] : []),
          <Text key={`r${i}`} color={r.color}>
            {r.text}
          </Text>
        ])}
        <Text color={C.muted}>{l.timeCell}</Text>
      </Text>
      {l.detail !== undefined && (
        <Text wrap="truncate">
          <Text color={C.dim}>{G.hang}</Text>
          <Text color={C.dim}>{`${' '.repeat(VERB_W)}${l.detail}`}</Text>
        </Text>
      )}
    </Box>
  )
}

// `activity ┄┄┄┄┄┄┄┄┄┄┄┄┄ 6 steps · 41s`, the mini rule over a turn's first step.
export const drawActivityRule = (ui: Ui, label: string) => {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" flexWrap="nowrap" width="100%" height={1} marginBottom={1}>
      <Box flexShrink={0}>
        <Text color={C.muted}>{'activity '}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
        <Text color={C.hairline} wrap="wrap">
          {G.hEdge.repeat(600)}
        </Text>
      </Box>
      {label.length > 0 && (
        <Box flexShrink={0}>
          <Text color={C.muted}>{` ${label}`}</Text>
        </Box>
      )}
    </Box>
  )
}

export const stepTime = (list: readonly StepStamp[], id: string | undefined) => {
  const ms = list.find(s => s.id === id)?.ms

  return ms === null || ms === undefined ? '' : fmtDuration(ms)
}

import { expect, test } from 'claude-code/testing'

import { capped } from '../../../hooks/cockpit/keys/details'
import type { StepDetail } from '../../../types'

const detail = (id: string, agent?: string): StepDetail => ({
  id,
  tool: 'Read',
  command: id,
  startAt: 0,
  ms: 1,
  isFailed: false,
  lines: 0,
  excerpt: [],
  patch: [],
  ...(agent === undefined ? {} : { agent })
})

test('agents` details never push the main loop`s out: each keeps its newest 300', () => {
  const main = Array.from({ length: 250 }, (_, i) => detail(`m${i}`))
  const agents = Array.from({ length: 400 }, (_, i) => detail(`a${i}`, 'ag'))
  const kept = capped([...main.slice(0, 100), ...agents, ...main.slice(100)])
  expect(kept.filter(d => d.agent === undefined)).toHaveLength(250)
  expect(kept.filter(d => d.agent !== undefined).map(d => d.id)).toEqual(Array.from({ length: 300 }, (_, i) => `a${i + 100}`))
})

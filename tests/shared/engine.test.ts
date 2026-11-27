import { expect, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import { dormantFor } from '../../hooks/shared/engine'

// Each engine call takes a moment, as the real ones do, so three first draws overlap.
const tick = async (): Promise<void> => {
  await Promise.resolve()
}

test('three first draws at once on an engine outside the range: every one hands its row back', async () => {
  const said: string[] = []
  const $ = {
    env: { get: async () => (await tick(), undefined) },
    fs: { read: async () => (await tick(), JSON.stringify({ version: '1.0.0', engines: { 'claude-code': '>=2.1.329 <2.2.0' } })) },
    plugin: { root: '.' },
    session: { version: async () => (await tick(), { version: '2.3.0', base: '2.3.0' }) },
    ui: {
      log: (text: string, opts?: { to?: string }) => {
        if (opts?.to !== 'debug') said.push(text)
      }
    }
  } as unknown as EngineInterface

  expect(await Promise.all([dormantFor($), dormantFor($), dormantFor($)])).toEqual([true, true, true])
  expect(said).toHaveLength(1)
})

import { expect, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import { dormantFor } from '../../hooks/shared/engine'

// Its own file: the check runs once per copy of the module, so it must be this file's first and only check.
test('a check whose read and whose debug log both throw still lets every first draw go ahead, awake', async () => {
  const $ = {
    env: {
      get: () => Promise.reject(new Error('env is gone'))
    },
    plugin: { root: '.' },
    ui: {
      log: () => {
        throw new Error('the log is gone')
      }
    }
  } as unknown as EngineInterface

  expect(await Promise.all([dormantFor($), dormantFor($), dormantFor($)])).toEqual([false, false, false])
})

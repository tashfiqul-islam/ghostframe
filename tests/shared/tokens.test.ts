import { expect, test } from 'claude-code/testing'

import { C } from '../../hooks/shared/tokens'

test('tokens: one small set, the names the design uses; add/del share ok/err', async () => {
  expect(Object.keys(C).toSorted()).toEqual(
    [
      'accent',
      'add',
      'agent',
      'bg',
      'del',
      'dim',
      'err',
      'hairline',
      'link',
      'muted',
      'ok',
      'rule',
      'ruleStrong',
      'surface',
      'text',
      'textBright',
      'warn',
      'web'
    ].toSorted()
  )
  expect(C.add).toBe(C.ok)
  expect(C.del).toBe(C.err)
  for (const v of Object.values(C)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  // Every value is distinct apart from the two diff aliases.
  expect(new Set(Object.values(C)).size).toBe(Object.keys(C).length - 2)
})

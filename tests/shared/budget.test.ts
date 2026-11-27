import { expect, test } from 'claude-code/testing'

import { ownTimeLine } from '../../hooks/shared/budget'

// The engine skips a hook past 10 s of its own work; past 1 s, the hook says so in the debug log first.
test('a hook whose own work passes 1 s is named in one debug line; under it, nothing', () => {
  expect(ownTimeLine('turn.step', { ms: 10_000, remainingMs: 8_700 })).toBe('hook turn.step ran 1300 ms of its own work, over the 1000 ms guard')
  expect(ownTimeLine('turn.step', { ms: 10_000, remainingMs: 9_400 })).toBeUndefined()
  // Nothing meters it: no line.
  expect(ownTimeLine('session.end', { ms: 0, remainingMs: Number.POSITIVE_INFINITY })).toBeUndefined()
})

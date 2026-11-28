import type { On } from './engine'

/** A wait that never comes due: it stays pending until its dispatch aborts. */
const never = (signal: AbortSignal): Promise<{ value: undefined }> =>
  new Promise(resolve => signal.addEventListener('abort', () => resolve({ value: undefined })))

// The tests' `on`s already holding: a test whose helpers each hold the timers registers them once.
const holding = new WeakSet<On>()

/**
 * Answers `$.clock.after` and `$.clock.every` with waits that never come due, so no timer fires while a test runs. An
 * answer would fire the timer at once (and run `every` round again); a test that needs a timer to fire moves time
 * with `mock.clock` instead.
 * @param on the test's `on`
 */
export function holdTimers(on: On): void {
  if (holding.has(on)) return
  holding.add(on)
  on('clock.after', (_$, _e, next) => never(next.signal))
  on('clock.every', (_$, _e, next) => never(next.signal))
}

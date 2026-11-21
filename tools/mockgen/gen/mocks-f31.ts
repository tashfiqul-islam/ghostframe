import { flat, turn6, turn7, M8, P8, liveDock, liveNow, dock, fall } from './data'
import type { Mode } from './data'
import type { Line, Transcript } from './lib'

const left =
  (mode: Mode) =>
  (T: Transcript): Line[] =>
    flat(
      T,
      turn6(T, mode),
      '',
      '',
      turn7(T, mode),
      '',
      '',
      T.turn(8, '10:31'),
      '',
      T.prompt(P8),
      ...(mode === 'dock' ? [] : (['', T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s')] as const))
    )
dock('f31-dock', {
  R: 36,
  left: T => flat(T, left('dock')(T), '', T.exc('↗', 't', '', 'pushed fix/ci-bun-pin · 1 commit · origin', '3s')),
  M: M8,
  live: T => [liveDock(T, '14s')],
  hero: true
})
fall('f31-100', { C: 100, R: 36, left: left('fall'), live: [liveNow(100, 'shell', 'gh pr create --fill', 'step 2 · 11s · 14s')], hero: true })
fall('f31-60', { C: 60, R: 36, left: left('fall'), live: [liveNow(60, 'shell', 'gh pr create --fill', 'step 2 · 14s')], hero: true })

import type { Outcome } from '../../hooks/cockpit/steps/log'
import type { On } from './engine'

export const ON = { options: { cockpit: true } }

/** Cockpit off by its option: the transcript as it is without Cockpit. */
export const OFF = { options: { cockpit: false } }

/** Cockpit on, for a test that drives many draws: it runs near the default 5 s on a busy machine. */
export const SLOW = { ...ON, timeoutMs: 15_000 }

export const VIEW = { columns: 127, rows: 50, isFullscreen: true }

export const PANE = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'cockpit',
  props: { title: 'cockpit', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 42, contentRows: 42 }, view: {} },
  viewport: VIEW
} as const

export const T0 = new Date(2026, 10, 21, 10, 26, 45).getTime() // the prompt's submit time (local); the turn clock starts here

export const W = 72

export const failed = (said: string): Outcome => ({ isError: true, text: said })

/**
 * A disk with no links: every path lands where it is spelled (`$.fs.stat`), so a file of the project is read and
 * diffed. Cockpit asks where a file lands before it reads it (SEC-T3). The disk answers as POSIX does, as a test's
 * Git spells its root (`/repo`): the engine hands the hook the path made absolute, on Windows with its drive.
 */
export function statAsSpelled(on: On): void {
  on('fs.stat', (_, e) => ({ value: { kind: 'file', size: 0, mtimeMs: 0, isLink: false, realPath: posixPath(e.path) } }))
}

/** A path as POSIX spells it: no drive, forward slashes (`D:\repo\x` is `/repo/x`). */
export const posixPath = (path: string): string => path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/') || '/'

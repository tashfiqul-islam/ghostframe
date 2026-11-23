import type { Outcome } from '../../hooks/cockpit/steps/log'

export const ON = { options: { cockpit: true } }

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

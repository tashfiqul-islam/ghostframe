// ─── Formats (DESIGN.md §6, r10) ─────────────────────────────────────────────
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return ''
  }

  if (ms < 10_000) {
    const s = ms / 1000

    return s < 1 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
  }

  const s = Math.round(ms / 1000)

  if (s < 60) {
    return `${s}s`
  }

  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return ''
  }

  const v = n < 1000 ? `${Math.round(n)}` : n < 1_000_000 ? `${trim1(n / 1000)}k` : `${trim1(n / 1_000_000)}M`

  return `${v} tokens`
}

const trim1 = (x: number) => x.toFixed(1).replace(/\.0$/, '')

/** 24-hour `HH:MM`, as the turn rule shows it. */
export function fmtClock(ms: number): string {
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const two = (n: number) => String(n).padStart(2, '0')

/**
 * One duration, as spec H.5 writes it everywhere: `0.4s`, `12s`, `4m 03s`, `1h 12m`, `1d 02h`.
 * @param ms the duration
 * @returns the string, at most 7 cells
 */
export function formatSpan(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1_000) return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`

  const s = Math.floor(ms / 1_000)

  if (s < 60) return `${s}s`
  if (s < 3_600) return `${Math.floor(s / 60)}m ${two(s % 60)}s`
  if (s < 86_400) return `${Math.floor(s / 3_600)}h ${two(Math.floor((s % 3_600) / 60))}m`

  return `${Math.floor(s / 86_400)}d ${two(Math.floor((s % 86_400) / 3_600))}h`
}

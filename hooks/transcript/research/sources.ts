import { G } from '../../shared/layout'
import type { Part } from '../../shared/parts'
import { pad, vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { sourceLabel } from '../../shared/url'
import { frameLines } from '../frame'
import type { Cite } from './cites'
import { clipLabel, sourceTitles } from './labels'

/**
 * `[ SOURCES ]`: `n  title  address` for each cited source, by its marker's number, then
 * any source a Sources list named but no marker cites (`listed`), with a dim `·` for its
 * number: every number in the frame is a marker on screen. Meta `N cited` (`· M listed`).
 */
export function sourcesFrame(cites: readonly Cite[], width: number, listed: readonly { url: string; title: string }[] = []): Part[][] {
  const inner = width - 4
  const all: Cite[] = [...cites, ...listed.map(l => ({ n: 0, url: l.url, title: l.title }))]
  // Reduced, not spread: `Math.max(...xs)` overflows the stack on a long list.
  const noW = cites.reduce((w, c) => Math.max(w, String(c.n).length), 1)
  const titles = sourceTitles(all)
  const titleW = Math.min(
    titles.reduce((w, t) => Math.max(w, vw(t)), 8),
    Math.floor(inner * 0.4)
  )
  const urlW = Math.max(6, inner - noW - 2 - titleW - 2)
  const rows: Part[][] = all.map((c, i) => [
    c.n > 0 ? { t: `${pad(String(c.n), noW, 'right')}  `, color: C.link } : { t: `${pad('·', noW, 'right')}  `, color: C.dim },
    { t: `${pad(titles[i] ?? c.title, titleW)}  `, color: c.n > 0 ? C.textBright : C.muted },
    { t: clipLabel(sourceLabel(c.url), urlW), color: C.muted, href: c.url }
  ])
  const meta = [cites.length > 0 ? `${cites.length} cited` : '', listed.length > 0 ? `${listed.length} listed` : ''].filter(x => x.length > 0).join(G.sep)

  return frameLines(width, 'SOURCES', { t: meta, color: C.muted }, rows)
}

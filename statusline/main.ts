// ghostframe's status line: Claude Code runs this on each update with the session's JSON on stdin and draws what it
// prints. Installed by `/ghostframe-statusline install`, which bundles it to ~/.claude/ghostframe/statusline.js.
// It never throws and never prints an error: on any failure it draws what it has.
import { readFileSync } from 'node:fs'

import { ansi, depthOf } from './ansi.ts'
import { factsOf, limitsOf, overlay } from './facts.ts'
import type { Facts } from './render.ts'
import { fallback, render } from './render.ts'
import { debug, gitOf, iconsOn, readLimits, widthOf, writeLimits } from './io.ts'

function main(): string {
  const env = process.env
  let raw = ''

  try {
    // Synchronous on purpose: async stdin printed nothing under Git Bash on Windows.
    raw = readFileSync(0, 'utf8')
  } catch (e) {
    debug(`stdin not read: ${String(e)}`)
  }

  let json: unknown = {}

  try {
    json = JSON.parse(raw.replace(/^﻿/, '') || '{}')
  } catch (e) {
    debug(`bad json: ${String(e)}`)
  }

  // For the live checks only: GF_FIXTURE names a JSON file laid over Claude Code's, to force a state (under pressure)
  // in a real session.
  const fixture = env['GF_FIXTURE']

  if (fixture !== undefined) {
    try {
      json = overlay(json, JSON.parse(readFileSync(fixture, 'utf8')))
    } catch (e) {
      debug(`fixture not read: ${String(e)}`)
    }
  }

  const now = Date.now()
  const w = widthOf(env)
  const j = (typeof json === 'object' && json !== null ? json : {}) as { workspace?: { current_dir?: unknown }; cwd?: unknown; rate_limits?: unknown }
  const dir = [j.workspace?.current_dir, j.cwd].find((d): d is string => typeof d === 'string') ?? process.cwd()
  const live = limitsOf(j.rate_limits, null, now)

  if (live.five_hour || live.seven_day) writeLimits(live)

  let facts: Facts | null = null

  try {
    facts = factsOf(json, gitOf(dir, now), live.five_hour || live.seven_day ? live : limitsOf(null, readLimits(), now), now)
    debug(`COLUMNS=${env['COLUMNS']} W=${w}`)

    return render(facts, w, { icons: iconsOn(env), slab: env['GF_SLAB'] === '1' })
      .map(r => ansi(r, depthOf(env)))
      .join('\n')
  } catch (e) {
    debug(`fallback: ${String(e)}`)

    return facts !== null ? fallback(facts, Math.max(1, w)) : 'ghostframe'
  }
}

let out = 'ghostframe'

try {
  out = main()
} catch (e) {
  debug(`failed: ${String(e)}`)
}
process.stdout.write(`${out}\n`)

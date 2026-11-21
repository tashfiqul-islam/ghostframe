// What a turn used beside its tool calls, observed: skills it loaded (`skill.prompt`) and settings hooks that
// decided something (`classic.*`). Both go on the capability line and in the tally.
import type { EngineInterface, On } from 'claude-code'

import { hookOutcome, skillName, withHook, withSkill } from '../live'
import { updateCaps, updateTally } from './state'

// Settings hooks that decided something (allowed, blocked, added context): the engine
// names the event, not the hook, so the line says `hook PreToolUse allowed`. Observes
// only; never re-runs a hook (no .catch: a failure here keeps the answer heard).
async function noteHook($: EngineInterface, event: string, result: unknown, agentId: unknown) {
  const said = agentId === undefined ? hookOutcome(event, result) : undefined

  if (said === undefined) return

  await updateCaps($, c => withHook(c, said))
  await updateTally($, t => ({ ...t, hooks: t.hooks + 1 }))
}

/**
 * Adds the capability observe hooks: `skill.prompt` and the three `classic.*` hooks.
 * @param on the `on` that `register` receives
 */
export function registerCapabilities(on: On): void {
  // A skill loaded for the turn: on the capability line, and in the tally.
  on('skill.prompt', async ($, e, next) => {
    const r = await next(e)

    try {
      await updateCaps($, c => withSkill(c, e.skill))
      await updateTally($, t => (t.skills.includes(skillName(e.skill)) ? t : { ...t, skills: [...t.skills, skillName(e.skill)] }))
    } catch {
      // observing only
    }

    return r
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)

    try {
      await noteHook($, 'UserPromptSubmit', r, undefined)
    } catch {
      // observing only
    }

    return r
  })

  on('classic.PreToolUse', async ($, e, next) => {
    const r = await next(e)

    try {
      await noteHook($, 'PreToolUse', r, 'agentId' in e ? e['agentId'] : undefined)
    } catch {
      // observing only
    }

    return r
  })

  on('classic.PostToolUse', async ($, e, next) => {
    const r = await next(e)

    try {
      await noteHook($, 'PostToolUse', r, (e as { agent_id?: unknown }).agent_id)
    } catch {
      // observing only
    }

    return r
  })
}

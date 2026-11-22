// The main loop's tool calls, observed: each call's time (`tool.call`), and a check that asked the person
// (`tool.check`). What a finished call adds to the turn: the tally, test counts, what shipped.
import type { EngineInterface, On } from 'claude-code'

import { logAgentStep, logAgentStepEnd, logAsk, logStepEnd, logStepStart } from '../../cockpit/log'
import { runnerOf } from '../../shared/calls/describe'
import { isShipCommand, parseShip, shellText } from '../../shared/calls/ships'
import { parseTests } from '../../shared/calls/tests'
import { capTurns } from '../../shared/held'
import { browserTool } from '../browser'
import { skillName } from '../live'
import { sessionCwd } from './session'
import { readAsked, readTurn, updateAsked, updateShips, updateSteps, updateTally, updateTestRuns } from './state'

const STEPS_MAX = 400

// What a finished main-loop call adds to the turn: the tally, test counts, what shipped.
async function afterCall(
  $: EngineInterface,
  e: { tool: string; tool_use_id: string },
  ran: { result?: unknown; text?: string | undefined; deny?: string | undefined }
) {
  if (ran.deny !== undefined) return

  const tool = e.tool
  const str = (k: string) => {
    const v: unknown = Reflect.get(e, k)

    return typeof v === 'string' ? v : undefined
  }
  const path = str('file_path') ?? str('notebook_path')
  const isShell = tool === 'Bash' || tool === 'PowerShell'
  const command = isShell ? (str('command') ?? '') : ''
  const out = shellText(ran.result)
  const text = out.trim().length > 0 ? out : (ran.text ?? '')
  const runner = isShell ? runnerOf(command) : undefined
  const counts = runner === undefined ? undefined : parseTests(text)
  const ship = isShell && isShipCommand(command) ? parseShip(e.tool_use_id, command, text) : undefined
  const skill = tool === 'Skill' ? str('skill') : undefined

  await updateTally($, t => ({
    ...t,
    agents: t.agents + (tool === 'Agent' || tool === 'Task' ? 1 : 0),
    browser: t.browser + (browserTool(tool) !== undefined ? 1 : 0),
    files: ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool) && path !== undefined && !t.files.includes(path) ? [...t.files, path] : t.files,
    skills: skill !== undefined && !t.skills.includes(skillName(skill)) ? [...t.skills, skillName(skill)] : t.skills,
    tests: t.tests + (counts !== undefined ? 1 : 0),
    shipped: t.shipped + (ship !== undefined ? 1 : 0)
  }))

  const turn = runner !== undefined || ship !== undefined ? await readTurn($) : null

  if (runner !== undefined && counts !== undefined) {
    await updateTestRuns($, list => [...list, { id: e.tool_use_id, turn, runner, ...counts }].slice(-100))
  }

  if (ship !== undefined) {
    await updateShips($, list => [...list, { ...ship, turn }].slice(-100))
  }
}

/**
 * Adds the tool-call observe hooks: `tool.call` and `tool.check`.
 * @param on the `on` that `register` receives
 */
export function registerCalls(on: On): void {
  // Time every main-loop call. Observes only: the call runs exactly as it would.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agentId = e.agentId

      try {
        // A subagent's call is its own: its `[ AGENTS ]` row says what it does now, and its own log gets the step.
        await logAgentStep($, agentId, e, sessionCwd())
      } catch (error: unknown) {
        $.ui.log(`cockpit: agent step failed: ${String(error)}`)
      }

      let done: Awaited<ReturnType<typeof next>> | undefined

      try {
        done = await next(e)

        return done
      } finally {
        try {
          await logAgentStepEnd($, agentId, e, done)
        } catch (error: unknown) {
          $.ui.log(`cockpit: agent step failed: ${String(error)}`)
        }
      }
    }

    const id = e.tool_use_id
    const now = async () => {
      try {
        return await $.clock.now()
      } catch {
        return undefined // a clock that fails costs the step its time; the step still settles
      }
    }
    const at = await now()

    try {
      const turn = await readTurn($)
      await updateSteps($, list => capTurns([...list, { id, turn, at: at ?? 0, ms: null, tool: e.tool }], STEPS_MAX, turn))
    } catch {
      // A stamp that fails costs the row its time, nothing more.
    }

    try {
      await logStepStart($, e, at ?? 0, sessionCwd())
    } catch {
      // A pane row that fails costs the pane that row; the call runs as it would.
    }

    let ran: Awaited<ReturnType<typeof next>> | undefined

    try {
      ran = await next(e)

      try {
        await afterCall($, e, ran)
      } catch {
        // A card that can't be read costs the row its card; the activity output stays.
      }

      return ran
    } finally {
      // Always settled. A start or end the clock couldn't give: 0ms at the known end, so the
      // step never counts toward its turn's time; neither known: the step is dropped.
      const end = await now()
      const when = at ?? end
      const ms = at !== undefined && end !== undefined ? end - at : 0
      const ok = ran !== undefined && ran.isError !== true && ran.deny === undefined

      try {
        await updateSteps($, list => (when === undefined ? list.filter(s => s.id !== id) : list.map(s => (s.id === id ? { ...s, at: when, ms, ok } : s))))

        if ((await readAsked($)).includes(id)) {
          await updateAsked($, list => list.filter(x => x !== id))
        }
      } catch {
        // as above
      }

      try {
        await logStepEnd($, e, ran, end ?? when ?? 0, sessionCwd())
      } catch {
        // as above
      }
    }
  }).catch((_$, e, next) => next(e))

  // Permission: note a main-loop call whose check asks the person, so its row can say it
  // waits on you. Observes only: the verdict is handed up exactly as heard.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)

    try {
      const id = e.tool_use_id

      if (e.agentId === undefined && id !== undefined && e.approver === 'person' && verdict.decision === 'ask') {
        await updateAsked($, list => [...list.filter(x => x !== id), id].slice(-100))
        await logAsk($, id)
      }
    } catch {
      // A note that fails costs the row its `needs you`, nothing more.
    }

    return verdict
  }).catch((_$, e, next) => next(e)) // never decides: the verdict beneath stands
}

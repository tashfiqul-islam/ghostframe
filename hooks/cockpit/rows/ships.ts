// What left the machine (spec 7.10, E.5): a call's `↗` rows, drawn the moment it returns: a commit, a push, a pull
// request opened or merged. Pure: the left draws what this returns.
import { commandOf, wholeCommand } from '../../shared/look/words'
import type { Part } from '../../shared/parts'
import { isShipCommand, parseShip, shellText } from '../../shared/calls/ships'
import { shippedRow } from './events'

/** One call as a site carries it. */
export type ShipCall = { tool_use_id?: string | undefined; tool: string; input: unknown; output?: unknown; isErrored: boolean }

const MERGE = /\bgh\s+pr\s+merge\b(?:\s+(\d+))?/

/**
 * The `↗` rows of a site's calls (7.10): `committed   a1f3c2e subject`, `pushed   branch · origin`, `opened   PR #23`,
 * `merged   PR #23`.
 * @param calls the site's calls
 * @param clockOf the time into the turn at which a call ended, when the step log has it
 * @param width the text column's cells
 * @param commitOf the commit a step made as the step log read it from Git, for a commit whose output named none
 * @returns the rows, top to bottom
 */
export function shipEventRows(
  calls: readonly ShipCall[],
  clockOf: (id: string) => number | undefined,
  width: number,
  commitOf: (id: string) => { sha: string; subject: string } | undefined = () => undefined
): Part[][] {
  return calls.flatMap(c => {
    if (c.isErrored || (c.tool !== 'Bash' && c.tool !== 'PowerShell')) return []

    const command = commandOf(c.input)
    const at = c.tool_use_id === undefined ? undefined : clockOf(c.tool_use_id)
    const merged = MERGE.exec(command)

    // The whole command, every line: `git add x; git commit -q -m @'…'@` commits on its second statement.
    const whole = wholeCommand(c.input)

    if (merged !== null) return [shippedRow(at, 'merged', merged[1] === undefined ? 'PR' : `PR #${merged[1]}`, '', width)]
    if (!isShipCommand(whole)) return []

    const ship = parseShip(c.tool_use_id ?? '', whole, shellText(c.output))
    const commit = ship?.commit ?? (c.tool_use_id === undefined ? undefined : commitOf(c.tool_use_id))
    const rows: Part[][] = []

    if (commit !== undefined) rows.push(shippedRow(at, 'committed', commit.sha, commit.subject, width))
    if (ship?.push !== undefined) rows.push(shippedRow(at, 'pushed', '', `${ship.push.to} · origin`, width))
    if (ship?.pr !== undefined) rows.push(shippedRow(at, 'opened', `PR #${ship.pr.n}`, '', width))

    return rows
  })
}

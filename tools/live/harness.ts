// What a check script is made of: a step that records what each check saw, and the turn helpers that send a prompt
// and wait for the turn to settle (its receipt drawn, or a dialog up, and the screen still for 1.5 s).
import { headers, hasReceipt, isDialogUp } from './checks.ts'
import type { Capture } from './screen.ts'
import type { Session } from './session.ts'

/** One check's outcome: pass, fail, or a note (`pass: null`) that records what was seen without judging it. */
export type Result = { step: string; check: string; pass: boolean | null; saw: string }

/** A step of the live checks, collecting its results. */
export class Step {
  readonly id: string
  readonly results: Result[] = []
  readonly captures: string[] = []
  /** The captures themselves, for the checks every screen gets (`screenChecks`). */
  readonly caps: Capture[] = []

  constructor(id: string) {
    this.id = id
  }

  /**
   * Records a check.
   * @param check what must hold
   * @param pass whether it held
   * @param saw what the screen showed, quoted
   */
  expect(check: string, pass: boolean, saw: string): void {
    this.results.push({ step: this.id, check, pass, saw })
  }

  /**
   * Records what was seen without passing or failing it.
   * @param check what was looked at
   * @param saw what the screen showed
   */
  note(check: string, saw: string): void {
    this.results.push({ step: this.id, check, pass: null, saw })
  }

  /** Keeps a capture's page for the report. */
  keep(cap: Capture & { html: string }): Capture {
    this.captures.push(cap.html)
    this.caps.push(cap)

    return cap
  }
}

let sent = 0

/** How many prompts this run has sent: the turns it used. */
export const turnsSent = (): number => sent

/** How long a turn may take before the check gives up. */
export const TURN_MS: number = 12 * 60_000

const headerSignature = (cap: Capture): string => {
  const last = headers(cap).at(-1)

  return last === undefined ? '' : `${last.turn}@${last.y}`
}

/**
 * Waits for the turn on screen to settle: its receipt drawn below its header, or a dialog up, and the screen still
 * for 1.5 s. With `approve`, a dialog is answered Yes (Enter) and the wait goes on.
 * @param s the session
 * @param step the step, for the record of each dialog approved
 * @param approve whether to approve dialogs
 * @returns the settled screen
 */
export async function waitIdle(s: Session, step: Step, approve = true): Promise<Capture> {
  for (;;) {
    const cap = await s.waitSettled(c => hasReceipt(c) || isDialogUp(c), TURN_MS, 'the turn to settle')

    if (!isDialogUp(cap) || !approve) return cap
    step.note('a dialog came up and was approved', (await s.capture(`${step.id}-dialog`)).html)
    await s.key('enter')
    await s.waitFor(c => !isDialogUp(c), 30_000, 'the dialog to close')
  }
}

/**
 * Sends a prompt and waits for its turn to start (a new turn header, or a dialog).
 * @param s the session
 * @param prompt what to type
 * @returns once the turn has started
 */
export async function startTurn(s: Session, prompt: string): Promise<void> {
  const before = headerSignature(await s.screen())

  sent++
  await s.send(prompt)
  await s.waitFor(c => headerSignature(c) !== before || isDialogUp(c), 90_000, 'the turn header')
}

/**
 * Sends a prompt and waits for the turn to settle.
 * @param s the session
 * @param step the step
 * @param prompt what to type
 * @param approve whether to approve dialogs
 * @returns the settled screen
 */
export async function turn(s: Session, step: Step, prompt: string, approve = true): Promise<Capture> {
  await startTurn(s, prompt)

  return waitIdle(s, step, approve)
}

/**
 * Types a slash command and waits for the screen to settle on a row that matches.
 * @param s the session
 * @param command the command as typed
 * @param shown what its output row matches
 * @returns the settled screen
 */
export async function slash(s: Session, command: string, shown: RegExp): Promise<Capture> {
  await s.send(command)

  return s.waitSettled(c => shown.test(c.cells.map(r => r.map(x => x.ch).join('')).join('\n')), 60_000, command)
}

/**
 * Focuses the pane: ctrl+x, then tab.
 * @param s the session
 * @returns the screen with the pane focused
 */
export async function focusPane(s: Session): Promise<Capture> {
  await s.key('ctrl+x')
  await s.key('tab')

  return s.waitSettled(() => true, 30_000, 'the pane to take the keyboard')
}

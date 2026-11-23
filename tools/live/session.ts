// The driver: the real Claude Code in a pseudo-terminal of a given size (node-pty on ConPTY), with a headless xterm
// as its screen. A script types, presses keys, waits for the screen and captures it; each capture is saved under
// tools/live/out/<run>/ as a .txt of the rows and an .html of the cells in colour.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { Unicode11Addon } from '@xterm/addon-unicode11'
import { Terminal } from '@xterm/headless'
import { spawn, type IPty } from 'node-pty'

import { CLAUDE, LIVE_REPO, SETTINGS } from './config.ts'
import { captureOf, htmlOf, textOf, type Capture } from './screen.ts'

/** The keys a script can press, as the bytes a terminal sends for them. Digits and single letters are sent as typed. */
const KEYS: Record<string, string> = {
  enter: '\r',
  tab: '\t',
  'shift+tab': '\x1b[Z',
  esc: '\x1b',
  'ctrl+x': '\x18',
  'ctrl+o': '\x0f',
  'ctrl+c': '\x03',
  down: '\x1b[B',
  up: '\x1b[A',
  left: '\x1b[D',
  right: '\x1b[C',
  backspace: '\x7f'
}

/** The bytes for a key name: a named key, or one digit or letter. */
export function keyBytes(name: string): string {
  const named = KEYS[name]

  if (named !== undefined) return named
  if (/^[0-9a-z]$/i.test(name)) return name
  throw new Error(`Unknown key "${name}": use ${Object.keys(KEYS).join(', ')}, a digit or a letter`)
}

/** How a session starts. */
export type Start = { cols: number; rows: number; out: string; cwd?: string; settings?: string }

// The variables a parent Claude Code session sets for its children; a child that inherits them thinks it is nested.
const PARENT_ENV = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_(CHILD_|ENTRYPOINT|MESSAGING_|SESSION_|SSE_PORT|PLUGIN_DIRS))/

// What must hold still for a screen to be settled: its text, without the digits and braille that tick.
const stillOf = (cap: Capture): string => textOf(cap).replace(/[\d⠀-⣿]/g, '#')

const settle = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms))

/** One running Claude Code and the screen it draws. */
export class Session {
  /** When the screen last changed, in ms since the epoch. */
  changedAt: number = Date.now()
  private readonly term: Terminal
  private readonly proc: IPty
  private readonly out: string
  private exited: number | undefined
  private shot = 0

  private constructor(start: Start) {
    this.out = resolve(start.out)
    mkdirSync(this.out, { recursive: true })
    this.term = new Terminal({ cols: start.cols, rows: start.rows, scrollback: 0, allowProposedApi: true })
    // Unicode 11 widths, as Windows Terminal draws them: the default (Unicode 6) makes an emoji one cell, not two.
    this.term.loadAddon(new Unicode11Addon())
    this.term.unicode.activeVersion = '11'
    const env: Record<string, string> = { TERM: 'xterm-256color', COLORTERM: 'truecolor' }

    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !PARENT_ENV.test(k) && k !== 'NO_COLOR') env[k] = v
    // Each session writes the engine's debug log (Cockpit's `{ to: 'debug' }` notes among it) beside its captures.
    const args = ['--settings', start.settings ?? SETTINGS, '--debug-file', join(this.out, 'debug.log')]

    this.proc = spawn(CLAUDE, args, {
      name: 'xterm-256color',
      cols: start.cols,
      rows: start.rows,
      cwd: start.cwd ?? LIVE_REPO,
      env
    })
    this.proc.onData(data => {
      this.changedAt = Date.now()
      this.term.write(data)
    })
    // The terminal's answers to the app's queries (cursor position, device attributes) go back as input.
    this.term.onData(data => this.proc.write(data))
    this.proc.onExit(e => {
      this.exited = e.exitCode
    })
  }

  /**
   * Starts Claude Code and waits for its first prompt.
   * @param start the size, the folder the captures go to, and optionally the project folder and settings file
   * @returns the session
   */
  static async start(start: Start): Promise<Session> {
    const s = new Session(start)

    await s.waitFor(cap => /❯|>\s/.test(textOf(cap)) && Date.now() - s.changedAt > 1500, 60_000, 'the first prompt')

    return s
  }

  /** Types text as keystrokes, a few at a time so the engine reads them as typing, not a paste. */
  async type(text: string): Promise<void> {
    for (const ch of text) {
      this.proc.write(ch)
      await settle(4)
    }
    await settle(150)
  }

  /** Presses one key (see `keyBytes`). */
  async key(name: string): Promise<void> {
    this.proc.write(keyBytes(name))
    await settle(250)
  }

  /** Types a prompt and sends it. */
  async send(text: string): Promise<void> {
    await this.type(text)
    await this.key('enter')
  }

  /** The screen now, not saved. */
  async screen(name = 'now'): Promise<Capture> {
    await new Promise<void>(done => this.term.write('', done))

    return captureOf(this.term, name)
  }

  /**
   * Waits until the screen satisfies a predicate.
   * @param predicate what to wait for
   * @param timeoutMs how long before it fails
   * @param what what it waits for, for the error
   * @returns the screen that satisfied it
   */
  async waitFor(predicate: (cap: Capture) => boolean, timeoutMs: number, what: string): Promise<Capture> {
    const until = Date.now() + timeoutMs

    for (;;) {
      if (this.exited !== undefined) throw new Error(`Claude Code exited (${this.exited}) while waiting for ${what}`)
      const cap = await this.screen(what)

      if (predicate(cap)) return cap
      if (Date.now() > until) {
        await this.capture(`timeout-${what.replace(/[^a-z0-9]+/gi, '-')}`)
        throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for ${what}`)
      }
      await settle(250)
    }
  }

  /**
   * Waits until a predicate holds and the screen has not changed for 1.5 s. Clocks, elapsed times and the spinner
   * tick every second while a turn runs or waits, so digits and braille are left out of the comparison.
   * @param predicate what must hold
   * @param timeoutMs how long before it fails
   * @param what what it waits for
   * @returns the settled screen
   */
  async waitSettled(predicate: (cap: Capture) => boolean, timeoutMs: number, what: string): Promise<Capture> {
    let seen = ''
    let since = Date.now()

    return this.waitFor(
      cap => {
        const now = stillOf(cap)

        if (now !== seen) {
          seen = now
          since = Date.now()
        }

        return predicate(cap) && Date.now() - since >= 1500
      },
      timeoutMs,
      what
    )
  }

  /**
   * Captures the screen and saves it as `<n>-<name>.txt` and `.html` in the run's folder.
   * @param name what the capture shows
   * @returns the capture
   */
  async capture(name: string): Promise<Capture & { html: string }> {
    const cap = await this.screen(name)
    const file = join(this.out, `${String(++this.shot).padStart(2, '0')}-${name}`)

    writeFileSync(`${file}.txt`, `${textOf(cap)}\n`)
    writeFileSync(`${file}.html`, htmlOf(cap))

    return { ...cap, html: `${file}.html` }
  }

  /** Ends the session. */
  async close(): Promise<void> {
    // Quit the way a person does (ctrl+c twice): a killed process leaves the engine thinking its fullscreen renderer
    // failed to start, and the next launch falls back to the classic one.
    for (let i = 0; i < 3 && this.exited === undefined; i++) {
      this.proc.write(KEYS['ctrl+c'] ?? '')
      await settle(300)
      this.proc.write(KEYS['ctrl+c'] ?? '')
      for (let t = 0; t < 20 && this.exited === undefined; t++) await settle(250)
    }
    if (this.exited === undefined) this.proc.kill()
    this.term.dispose()
  }
}

// The live benchmark's driver: the real Claude Code in a pseudo-terminal (node-pty), a headless xterm as its screen,
// as tools/live/session.ts does, plus what a benchmark needs: the process id (for CPU and memory), and the time of
// every write the program makes, so the time from a key to the screen's answer can be read.
import { createRequire } from 'node:module'

import type * as Addon from '@xterm/addon-unicode11'
import type * as Headless from '@xterm/headless'
import type * as NodePty from 'node-pty'
import type { IPty } from 'node-pty'

import { captureOf, textOf } from '../live/screen.ts'

const require = createRequire(import.meta.url)
const { Unicode11Addon }: typeof Addon = require('../live/node_modules/@xterm/addon-unicode11')
const { Terminal }: typeof Headless = require('../live/node_modules/@xterm/headless')
// node-pty is a native module the live checks install (tools/live: bun install); the bench reuses that copy.
const { spawn }: typeof NodePty = require('../live/node_modules/node-pty')

// The variables a parent Claude Code session sets for its children; a child that inherits them thinks it is nested.
const PARENT_ENV = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_(CHILD_|ENTRYPOINT|MESSAGING_|SESSION_|SSE_PORT|PLUGIN_DIRS))/

export const sleep = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms))

/** How to start one session. */
export type Launch = { claude: string; args: string[]; cwd: string; cols: number; rows: number; env: Record<string, string> }

/** One running Claude Code and its screen. */
export class Pty {
  /** When the program last wrote to the terminal, `performance.now()`. */
  lastWrite = 0
  /** When the program started, `performance.now()`. */
  readonly startedAt: number = performance.now()
  readonly pid: number
  private readonly term: Headless.Terminal
  private readonly proc: IPty
  private exited: number | undefined
  private readonly writes: number[] = []

  constructor(launch: Launch) {
    this.term = new Terminal({ cols: launch.cols, rows: launch.rows, scrollback: 0, allowProposedApi: true })
    this.term.loadAddon(new Unicode11Addon())
    this.term.unicode.activeVersion = '11'
    const env: Record<string, string> = { TERM: 'xterm-256color', COLORTERM: 'truecolor' }

    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !PARENT_ENV.test(k) && k !== 'NO_COLOR') env[k] = v
    Object.assign(env, launch.env)
    this.proc = spawn(launch.claude, launch.args, { name: 'xterm-256color', cols: launch.cols, rows: launch.rows, cwd: launch.cwd, env })
    this.pid = this.proc.pid
    this.proc.onData(data => {
      this.lastWrite = performance.now()
      this.writes.push(this.lastWrite)
      if (this.writes.length > 10_000) this.writes.splice(0, 5_000)
      this.term.write(data)
    })
    this.term.onData(data => this.proc.write(data))
    this.proc.onExit(e => {
      this.exited = e.exitCode
    })
  }

  /** The screen's text now. */
  async text(): Promise<string> {
    await new Promise<void>(done => this.term.write('', done))

    return textOf(captureOf(this.term, 'now'))
  }

  /** Sends bytes as typed. */
  write(bytes: string): void {
    this.proc.write(bytes)
  }

  /**
   * Waits for the screen's text to satisfy a predicate.
   * @returns the time it first did, `performance.now()`
   */
  async waitFor(predicate: (text: string) => boolean, timeoutMs: number, what: string): Promise<number> {
    const until = performance.now() + timeoutMs

    for (;;) {
      if (this.exited !== undefined) throw new Error(`Claude Code exited (${this.exited}) while waiting for ${what}`)
      if (predicate(await this.text())) return performance.now()
      if (performance.now() > until) throw new Error(`timed out after ${timeoutMs / 1000}s waiting for ${what}:\n${await this.text()}`)
      await sleep(20)
    }
  }

  /** Waits until the program has written nothing for `quietMs`. */
  async waitQuiet(quietMs: number, timeoutMs: number): Promise<void> {
    const until = performance.now() + timeoutMs

    while (performance.now() - this.lastWrite < quietMs) {
      if (performance.now() > until) return
      await sleep(25)
    }
  }

  /**
   * Sends bytes and times the program's answer: from the write to its first write back, and to the last write of
   * that burst (the next `settleMs` with nothing written).
   */
  async timed(bytes: string, settleMs = 50, timeoutMs = 2_000): Promise<{ first: number; done: number }> {
    const sent = performance.now()
    const before = this.writes.length

    this.proc.write(bytes)
    while (this.writes.length === before) {
      if (performance.now() - sent > timeoutMs) return { first: timeoutMs, done: timeoutMs }
      await sleep(1)
    }
    const first = (this.writes[before] ?? sent) - sent

    while (performance.now() - this.lastWrite < settleMs) await sleep(2)

    return { first, done: this.lastWrite - sent }
  }

  /** Ends the session as a person does (ctrl+c twice), else kills it. */
  async close(): Promise<void> {
    for (let i = 0; i < 3 && this.exited === undefined; i++) {
      this.proc.write('\x03')
      await sleep(300)
      this.proc.write('\x03')
      for (let t = 0; t < 20 && this.exited === undefined; t++) await sleep(250)
    }
    if (this.exited === undefined) this.proc.kill()
    this.term.dispose()
  }
}

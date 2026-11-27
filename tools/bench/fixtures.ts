// The live benchmark's fixtures (docs/development/performance.md): a repo with 40,000 untracked files and 20 large
// binaries, and the long session (tests/fixtures/long-session.ts) written as a Claude Code transcript in that repo's
// project folder, so `claude --resume <id>` draws its 1,000 rows with no model call. Both are built once and reused
// while their version matches.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import * as long from '../../tests/fixtures/long-session.ts'

/** Bump when what the fixtures hold changes, so an old copy is built again. */
const VERSION = '1'

export const UNTRACKED = 40_000
export const BINARIES = 20
const BINARY_BYTES = 8 * 1024 * 1024
const DIRS = 200

/** The session's id: fixed, so a resume finds it. */
export const SESSION_ID = '9f1c2b7e-5a43-4d1e-8c6b-000000001000'

const git = (root: string, ...args: string[]): void => {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${root}: ${r.stderr}`)
}

/**
 * Builds the repo fixture: a committed project, 20 committed binaries of 8 MiB each changed since, and 40,000
 * untracked files in 200 folders; fewer of each when asked (the small repo the steady-state measures run in).
 * @param root where it goes (created; reused when already built at this version and size)
 * @param size how many untracked files and binaries
 */
export function buildRepo(root: string, size: { untracked: number; binaries: number } = { untracked: UNTRACKED, binaries: BINARIES }): void {
  const marker = join(root, '.bench-fixture')
  const stamp = `${VERSION} ${size.untracked} ${size.binaries}`

  if (existsSync(marker) && readFileSync(marker, 'utf8') === stamp) return
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'assets'), { recursive: true })
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.name', 'bench')
  git(root, 'config', 'user.email', 'bench@example.invalid')
  git(root, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(root, 'package.json'), '{ "name": "ghostframe-perf-repo", "private": true }\n')
  for (let n = 1; n <= long.TURN_COUNT; n++) writeFileSync(join(root, 'src', `module-${n}.ts`), `export const x = ${n}\n`)

  // A binary is noise in a fixed pattern: compressible enough for Git, too big for anything to read per frame.
  const chunk = Buffer.alloc(BINARY_BYTES)

  for (let b = 0; b < size.binaries; b++) {
    for (let i = 0; i < BINARY_BYTES; i += 4) chunk.writeUInt32LE((i * 2654435761 + b) >>> 0, i)
    writeFileSync(join(root, 'assets', `blob-${b}.bin`), chunk)
  }
  writeFileSync(join(root, '.gitignore'), '.bench-fixture\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'fixture')
  for (let b = 0; b < size.binaries; b++) {
    for (let i = 0; i < BINARY_BYTES; i += 4) chunk.writeUInt32LE((i * 40503 + b + 1) >>> 0, i)
    writeFileSync(join(root, 'assets', `blob-${b}.bin`), chunk)
  }
  for (let d = 0; d < (size.untracked === 0 ? 0 : DIRS); d++) {
    const dir = join(root, 'untracked', `d${d}`)

    mkdirSync(dir, { recursive: true })
    for (let f = 0; f < size.untracked / DIRS; f++) writeFileSync(join(dir, `f${f}.txt`), `${d}/${f}\n`)
  }
  writeFileSync(marker, stamp)
}

/** The folder Claude Code keeps a project's transcripts in: its path with every other character a dash. */
export const projectDir = (repo: string, config: string): string => join(config, 'projects', repo.replace(/[^A-Za-z0-9]/g, '-'))

/**
 * Writes the long session as a transcript in the repo's project folder.
 * @param repo the repo the session ran in
 * @param config the config folder the session's Claude Code reads (CLAUDE_CONFIG_DIR)
 * @returns the transcript's path
 */
export function writeSession(repo: string, config: string): string {
  const dir = projectDir(repo, config)
  const file = join(dir, `${SESSION_ID}.jsonl`)
  const t0 = Date.parse('2026-11-20T09:00:00.000Z')
  const lines: string[] = []
  let parent: string | null = null
  let seq = 0

  const add = (type: 'user' | 'assistant', message: unknown, at: number, extra: Record<string, unknown> = {}): void => {
    const uuid = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

    lines.push(
      JSON.stringify({
        parentUuid: parent,
        isSidechain: false,
        type,
        message,
        uuid,
        timestamp: new Date(t0 + at).toISOString(),
        userType: 'external',
        entrypoint: 'cli',
        cwd: repo,
        sessionId: SESSION_ID,
        version: '2.1.332',
        gitBranch: 'main',
        ...extra
      })
    )
    parent = uuid
  }
  const said = (content: unknown[]) => ({
    model: 'claude-opus-5-5',
    id: `msg_${seq}`,
    type: 'message',
    role: 'assistant',
    content,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 100 }
  })

  for (const t of Object.values(long.TURNS)) {
    add('user', { role: 'user', content: t.prompt }, t.at, { promptSource: 'typed', origin: { kind: 'human' } })
    for (const e of t.events) {
      if (e.k === 'text') add('assistant', said([{ type: 'text', text: String(e['text']) }]), e.at ?? t.at)
      if (e.k === 'call') {
        const id = String(e['id'])
        add('assistant', said([{ type: 'tool_use', id, name: String(e['tool']), input: e['input'] }]), e.at ?? t.at)
        add(
          'user',
          { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: typeof e['text'] === 'string' ? e['text'] : '', is_error: false }] },
          (e.at ?? t.at) + Number(e['ms'] ?? 0),
          {
            toolUseResult: e['result'] ?? { stdout: typeof e['text'] === 'string' ? e['text'] : '', stderr: '', interrupted: false, isImage: false }
          }
        )
      }
    }
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `${lines.join('\n')}\n`)

  return file
}

if (import.meta.main) {
  const repo = process.argv[2] ?? 'D:\\Projects\\ghostframe-perf-repo'

  buildRepo(repo, process.argv[3] === 'small' ? { untracked: 0, binaries: 0 } : undefined)
  console.log(`repo: ${repo}`)
}

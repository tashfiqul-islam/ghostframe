// Where the live checks run: the Claude Code binary, the settings that load this worktree's plugin with Cockpit on,
// and the throwaway repo the checks work in (repo.ts rebuilds it). Each can be overridden from the
// environment; the defaults are the machine the checks were written on.
import { join } from 'node:path'

const env = (name: string, fallback: string): string => process.env[name] ?? fallback

/** The Claude Code binary. */
export const CLAUDE: string = env('LIVE_CLAUDE', 'claude.exe')

/** The settings file: `CLAUDE_CODE_PLUGIN_DIRS` pointing at the plugin, `GHOSTFRAME_COCKPIT=1`. */
export const SETTINGS: string = env('LIVE_SETTINGS', 'D:\\Projects\\cockpit-test-settings.json')

/** The throwaway repo the checks work in. */
export const LIVE_REPO: string = env('LIVE_REPO', 'D:\\Projects\\cockpit-live')

/** Where runs are saved, one folder per run: outside any worktree, so removing one cannot take its runs. */
export const OUT: string = env('LIVE_OUT', join(import.meta.dirname, 'out'))

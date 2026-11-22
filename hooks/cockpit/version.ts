// The plugin's version for the pane's wordmark (spec 8.12): read once from the plugin manifest, `dev` before a
// release (a manifest that states none) or when the manifest cannot be read.
import type { EngineInterface } from 'claude-code'

let version = 'dev'

/** The version the wordmark shows. */
export const pluginVersion = (): string => version

/**
 * Reads the manifest's `version` (the engine's documented way: `$.fs.read` of `.claude-plugin/plugin.json` under
 * `$.plugin.root`). A manifest that cannot be read keeps `dev` and says why in the debug log.
 * @param $ the engine interface
 */
export async function readVersion($: EngineInterface): Promise<void> {
  try {
    const manifest: unknown = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
    const v = typeof manifest === 'object' && manifest !== null && 'version' in manifest ? manifest.version : undefined

    version = typeof v === 'string' && v.length > 0 ? v : 'dev'
  } catch (error: unknown) {
    $.ui.log(`cockpit: plugin manifest not read for the wordmark: ${String(error)}`, { to: 'debug' })
  }
}

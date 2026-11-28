import { Launcher } from 'chrome-launcher'

// chrome-launcher's own `--disable-features=...` switch, which Lighthouse adds to every launch.
const launcherDisabled = Launcher.defaultFlags().filter(f => f.startsWith('--disable-features='))
if (launcherDisabled.length !== 1) throw new Error(`expected one --disable-features in chrome-launcher's defaults, got ${launcherDisabled.length}`)

/**
 * The Chrome flags for a Lighthouse run, space-delimited as `--chrome-flags` takes them.
 * Chrome 154+ pre-starts a spare renderer that races trace startup and drops navigationStart (NO_NAVSTART). Chrome
 * honours only the last `--disable-features`, so the new switch repeats chrome-launcher's own list.
 */
export function chromeFlags(): string {
  return ['--headless=new', '--enable-features=WebMCP', `${launcherDisabled[0]},SpareRendererForSitePerProcess`].join(' ')
}

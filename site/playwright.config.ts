import { defineConfig, devices } from '@playwright/test'

// Browser-level tests run against the built site, served the way the host serves it.
export default defineConfig({
  // Each piece's browser test sits beside it in src/; whole-site tests live in tests/.
  testDir: '.',
  testMatch: ['src/**/*.e2e.ts', 'tests/**/*.e2e.ts'],
  use: { baseURL: 'http://localhost:4400', channel: 'chrome' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: { command: 'bun tests/serve.ts dist 4400', url: 'http://localhost:4400/__health', reuseExistingServer: false }
})

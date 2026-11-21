import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))

// Builds the production bundle and serves it under the host's real policy.
export default defineConfig({
  testDir: '.',
  testMatch: ['strict-style-policy.browser.ts'],
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5207', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    cwd: root,
    command:
      'pnpm exec vite build --outDir node_modules/.cache/strict-style-dist && node e2e/fixtures/strict-style/serve.mjs',
    url: 'http://127.0.0.1:5207',
    reuseExistingServer: false,
    timeout: 240_000,
  },
})

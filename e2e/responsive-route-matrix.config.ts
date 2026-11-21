import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))

// The production bundle, served on its own port so it can run beside the style probe.
export default defineConfig({
  testDir: '.',
  testMatch: ['responsive-route-matrix.browser.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:5208', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    cwd: root,
    command:
      'pnpm exec vite build --outDir node_modules/.cache/route-matrix-dist && node e2e/fixtures/strict-style/serve.mjs',
    env: { STRICT_STYLE_DIST: 'node_modules/.cache/route-matrix-dist', STRICT_STYLE_PORT: '5208' },
    url: 'http://127.0.0.1:5208',
    reuseExistingServer: false,
    timeout: 240_000,
  },
})

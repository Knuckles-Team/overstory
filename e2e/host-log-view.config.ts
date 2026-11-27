import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// Real arbora host and real log files behind the production host-log view, in a real
// browser. Set ARBORA_PYTHON to a Python that can import arbora and ARBORA_CHECKOUT to
// an arbora source tree whose host-log routes serve version 2. The host is a test-only
// sandbox on loopback; no deployed identity gate is touched.
const arboraPython = process.env.ARBORA_PYTHON || 'python3'
const arboraCheckout = process.env.ARBORA_CHECKOUT || ''
const root = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  testDir: '.',
  testMatch: 'host-log-view.browser.ts',
  workers: 1,
  reporter: 'list',
  outputDir: process.env.HOST_LOG_RESULTS_DIR || 'test-results/host-log-view',
  use: { baseURL: 'http://127.0.0.1:5207', browserName: 'chromium' },
  webServer: [
    {
      cwd: root,
      command: `${arboraPython} e2e/fixtures/host-log-view/host.py`,
      env: { ARBORA_CHECKOUT: arboraCheckout },
      url: 'http://127.0.0.1:5208/',
      reuseExistingServer: false,
    },
    {
      cwd: root,
      command: 'pnpm exec vite --config e2e/fixtures/host-log-view/vite.config.ts',
      url: 'http://127.0.0.1:5207',
      reuseExistingServer: false,
    },
  ],
})

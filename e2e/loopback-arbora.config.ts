import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const pin = JSON.parse(readFileSync(new URL('./fixtures/loopback-arbora/pin.json', import.meta.url), 'utf8'))
const arboraPort = Number(process.env.LOOPBACK_ARBORA_PORT ?? pin.arboraPort)
const cwd = fileURLToPath(new URL('..', import.meta.url))

// The real arbora no-auth sandbox (arbora and its engine as local processes,
// from the pinned commit) behind the app's own vite proxy. One shared fixture
// for every journey that names a live loopback arbora.
export default defineConfig({
  testDir: '.',
  testMatch: ['loopback-*.browser.ts'],
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results/loopback-arbora',
  use: {
    baseURL: 'http://127.0.0.1:5207',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      cwd,
      command: 'node e2e/fixtures/loopback-arbora/run.mjs',
      url: `http://127.0.0.1:${arboraPort}/health`,
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      cwd,
      command:
        'pnpm exec vite --config e2e/fixtures/loopback-arbora/vite.config.ts --host 127.0.0.1 --port 5207 --strictPort',
      env: { BACKEND_PORT: String(arboraPort) },
      url: 'http://127.0.0.1:5207',
      reuseExistingServer: false,
    },
  ],
})

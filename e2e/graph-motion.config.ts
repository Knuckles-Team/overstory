import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// Offline browser tests of the animated graph view. The fixture engine answers Arbora operations at the
// network layer; nothing here reaches an account or a live engine. Own port so a parallel lane never collides.
export const graphBaseURL = 'http://127.0.0.1:5231'

export default defineConfig({
  testDir: '.',
  testMatch: ['graph-motion.browser.ts'],
  outputDir: '../test-results/graph-motion',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: graphBaseURL,
    browserName: 'chromium',
    serviceWorkers: 'block',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] },
  },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'pnpm exec vite --host 127.0.0.1 --port 5231 --strictPort',
    url: graphBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

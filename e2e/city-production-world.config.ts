import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// A developer may point the release probe at the already-open anonymous
// sandbox.  In that mode it must not start a second Vite process merely to
// measure the same city; the default remains a short-lived isolated server
// for CI.
const liveBaseURL = process.env.PLAYWRIGHT_BASE_URL
const baseURL = liveBaseURL || 'http://127.0.0.1:5207'

/** A short-lived, anonymous-only evidence server; never a persistent demo. */
export default defineConfig({
  testDir: '.',
  testMatch: 'city-production-world.browser.ts',
  outputDir: '../test-results/city-production-world',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL,
    browserName: 'chromium',
    serviceWorkers: 'block',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
  },
  webServer: liveBaseURL
    ? undefined
    : {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        command: 'VITE_CITY_SANDBOX=1 pnpm exec vite --host 127.0.0.1 --port 5207 --strictPort',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
})

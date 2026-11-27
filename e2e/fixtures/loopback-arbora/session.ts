import type { Page } from '@playwright/test'

/**
 * The browser session of the no-auth sandbox. The Overstory host owns
 * `/auth/session`; this fixture answers only that one route so the app can
 * start. Every operation call goes through the vite proxy to the real arbora
 * process started by `run.mjs`, unmodified.
 */
export async function signInToSandbox(
  page: Page,
  webuiRole: 'user' | 'maintainer' = 'maintainer',
  csrfToken: string = crypto.randomUUID(),
) {
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        subject: 'anonymous',
        tenant: 'local',
        webui_role: webuiRole,
        roles: ['kg:read'],
        csrf_token: csrfToken,
      },
    }),
  )
}

/** Operation calls the page made, in order, as the real arbora saw them. */
export function recordOperations(page: Page) {
  const calls: { op: string; status: number; body: Record<string, unknown> }[] = []
  page.on('response', async (response) => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith('/api/v1/ops/')) return
    calls.push({
      op: url.pathname.replace('/api/v1/ops/', ''),
      status: response.status(),
      body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    })
  })
  return calls
}

import type { Page } from '@playwright/test'

/**
 * Synthetic identity and API for browser journeys that run with no live stack
 * (the no-auth sandbox). Every unmodelled API path answers 501 so a view that
 * needs real data shows its own unavailable state instead of hanging.
 */
export async function useSyntheticWorkspace(page: Page, options: { theme?: string } = {}) {
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        subject: 'workspace-reader',
        tenant: 'synthetic',
        webui_role: 'admin',
        roles: ['kg:read', 'kg:admin'],
        csrf_token: 'synthetic-csrf',
      },
    }),
  )
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const result = (value: unknown) =>
      route.fulfill({
        json: { ok: true, result: { value }, meta: { registry_digest: 'synthetic', api_version: '1' } },
      })
    if (path === '/api/v1/ops/fleet.status') return result({ children: { catalog: { state: 'up' } } })
    if (path === '/api/v1/ops/fleet.catalog.list') return result({ items: [], next_cursor: null })
    if (path.startsWith('/api/configure'))
      return route.fulfill({
        json: {
          models: [
            { id: 'synthetic-a', name: 'Synthetic A' },
            { id: 'synthetic-b', name: 'Synthetic B' },
          ],
          builtinTools: [],
        },
      })
    if (path === '/api/enhanced/models') return route.fulfill({ json: { models: [], default_id: '' } })
    if (path === '/api/chats') return route.fulfill({ json: [] })
    if (path.startsWith('/api/chats/')) return route.fulfill({ json: { messages: [] } })
    return route.fulfill({ status: 501, json: { detail: 'Unavailable in the synthetic workspace fixture' } })
  })
  await page.addInitScript(() => localStorage.setItem('overstory.consent-dismissed', 'overstory-consent-v1'))
  if (options.theme) {
    await page.addInitScript((value) => localStorage.setItem('pydantic-chat-ui-theme', value), options.theme)
  }
}

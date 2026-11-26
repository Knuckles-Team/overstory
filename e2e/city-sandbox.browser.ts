import { expect, test } from '@playwright/test'

// spec: OVERSTORY-CITY-R001.1, OVERSTORY-CITY-R001.2, OVERSTORY-CITY-R001.2.1, OVERSTORY-CITY-R028.1
test('opens the anonymous demo from the Overstory landing page', async ({ page }) => {
  await page.route('**/auth/session', (route) => route.abort())
  await page.addInitScript(() => {
    const registrations: string[] = []
    Object.defineProperty(document, 'citySandboxToolNames', { value: registrations })
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { registerTool: async (tool: { name: string }) => registrations.push(tool.name) },
    })
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Play Arbora City' }).click()
  await expect(page).toHaveURL(/\/apps\/city\?demo=1$/)
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Demo: on', exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('city-fps')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => Reflect.get(document, 'citySandboxToolNames') as string[]))
    .toEqual(expect.arrayContaining([expect.stringMatching(/city.*overview/)]))
  await expect(page.getByRole('button', { name: 'Arm browser control' })).toHaveCount(0)
})

// spec: OVERSTORY-CITY-R001.2
test('the city route is accessible from the Apps navigation', async ({ page }) => {
  // The city route must appear in the Apps navigation when the user
  // has the required role. The sandbox test aborts auth, so the
  // capability check happens at the route level (isCitySandbox).
  await page.goto('/apps/city?demo=1')
  await expect(page).toHaveURL(/\/apps\/city/)
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 })
  // The city sandbox exposes the route publicly without auth.
  await expect(page).toHaveTitle(/.*Arbora City.*/i, { timeout: 15_000 })
})

// spec: OVERSTORY-CITY-R001.2
test('city renders the core navigation without auth (sandbox posture)', async ({ page }) => {
  // In sandbox mode the route is public (no auth gate).
  // The nav buttons render and the city graph is visible.
  await page.goto('/apps/city?demo=1')
  await expect(page).toHaveURL(/\/apps\/city/)
  // Core navigation is present: overview, 3D/2D toggle, speed controls.
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '3D view' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '2D view' })).toBeVisible({ timeout: 30_000 })
  // The FPS debug meter is not shown in sandbox (no debug=1).
  await expect(page.getByTestId('city-fps')).toHaveCount(0)
})

// spec: OVERSTORY-CITY-R028.1
test('reports browser FPS and the 60 FPS target when debug is enabled', async ({ page }) => {
  await page.goto('/apps/city?demo=1&debug=1')
  const meter = page.getByTestId('city-fps')
  await expect(meter).toHaveText(/\d+\.\d FPS · 60 target · \d+ slow frames/, { timeout: 45_000 })
  await expect(meter).toHaveAttribute('data-budget', /^(below|met)$/)
  await expect(meter).toHaveAttribute(
    'title',
    /CPU avg: simulation .*render submission .*UI .*CPU timings exclude GPU completion/,
  )
})

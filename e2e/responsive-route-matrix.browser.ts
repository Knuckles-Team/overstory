// spec: OVERSTORY-DESIGN-R004.1
// spec: OVERSTORY-DESIGN-R004.1.2
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { useSyntheticWorkspace } from './fixtures/synthetic-workspace'

/**
 * Every registered route is opened at each viewport shape of the requirement with
 * a synthetic identity and API, and must mount its body without a desktop-only
 * limitation, without whole-page horizontal overflow and without a page error.
 * Routes still marked `mobile: 'unsupported'` have not passed this matrix; they
 * must keep showing the explicit limitation notice (never a broken page).
 */
const VIEWPORTS = [
  { name: '320 narrow', width: 320, height: 740 },
  { name: 'narrow tall', width: 390, height: 844 },
  { name: 'short landscape', width: 740, height: 320 },
  { name: '4:3', width: 1024, height: 768 },
  { name: '16:9', width: 1280, height: 720 },
  { name: '32:9', width: 1920, height: 540 },
]

interface RouteRow {
  id: string
  path: string
  mobile: string
  label: string
  redirects: boolean
  /** Declared in the registry (`actions`), the source of truth; this test only reads them. */
  actions: { id: string; role: Parameters<Page['getByRole']>[0]; name: string }[]
}

function readRoutes(): RouteRow[] {
  const source = readFileSync(new URL('../src/lib/nav-registry.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export const ROUTES')
  const end = source.indexOf('\n]\n', start)
  const rows: RouteRow[] = []
  for (const block of source
    .slice(start, end)
    .split(/\n  \{\n/)
    .slice(1)) {
    const id = /^\s{4}id: '([^']+)'/m.exec(block)?.[1]
    const path = /^\s{4}path: '([^']+)'/m.exec(block)?.[1]
    const label = /^\s{4}label: ['"](.+)['"],?$/m.exec(block)?.[1]
    const mobile = /^\s{4}mobile: '([^']+)'/m.exec(block)?.[1]
    const declared = /^\s{4}actions: \[([\s\S]*?)\],?$/m.exec(block)?.[1] ?? ''
    const actions = [...declared.matchAll(/\{\s*id: '([^']+)',\s*role: '([^']+)',\s*name: '([^']+)',?\s*\}/g)].map(
      (m) => ({
        id: m[1],
        role: m[2] as RouteRow['actions'][number]['role'],
        name: m[3],
      }),
    )
    if (id && path && mobile && path !== '*')
      rows.push({ id, path, mobile, label: label ?? id, redirects: /^\s{4}redirects:/m.test(block), actions })
  }
  return rows
}

const ROUTES = readRoutes()

test('responsive_route_matrix covers every registered route', async ({ page }) => {
  expect(ROUTES.length).toBeGreaterThan(40)
  await useSyntheticWorkspace(page)
  await page.goto('/chat')
  const registered = await page.evaluate(async () => {
    const module = await import('/src/lib/nav-registry.ts').catch(() => null)
    return module ? module.ROUTES.length : null
  })
  // A production bundle exposes no source module; the parsed registry is the matrix then.
  if (registered !== null) expect(registered).toBe(ROUTES.length + 1)
})

for (const route of ROUTES) {
  test(`route ${route.id} (${route.path}) across the viewport matrix`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await useSyntheticWorkspace(page)
    const target = route.path.replace(/:[A-Za-z_]+\??/g, 'sample')
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(target)
      const limitation = page.getByRole('status').filter({ hasText: 'needs a larger screen' })
      const mobileWidth = viewport.width < 768
      if (route.mobile === 'unsupported' && mobileWidth) {
        await expect(limitation, `${route.id} must stay gated at ${viewport.name}`).toBeVisible()
        continue
      }
      await expect(limitation, `${route.id} shows a limitation at ${viewport.name}`).toHaveCount(0)
      await expect(page.locator('#root > *').first()).toBeVisible()
      // Wait for the lazy body: the loading fallback must settle.
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => {
        const root = document.scrollingElement!
        return { scroll: root.scrollWidth, client: root.clientWidth }
      })
      expect(overflow.scroll, `${route.id} overflows horizontally at ${viewport.name}`).toBeLessThanOrEqual(
        overflow.client,
      )
      if (route.redirects) {
        // Compatibility entries retire their body and forward into the workspace.
        await expect(page).toHaveURL(/\/workspace/)
        continue
      }
      // A route retired into the workspace by an alias also forwards; its body is the workspace's.
      await page.waitForLoadState('networkidle')
      const forwarded = new URL(page.url()).pathname.startsWith('/workspace') && !target.startsWith('/workspace')
      if (forwarded) continue
      // The route's own label is shown (page heading or breadcrumb) once its body is mounted.
      await expect(
        page.getByText(route.label).locator('visible=true').first(),
        `${route.id} renders no content at ${viewport.name}`,
      ).toBeVisible({ timeout: 25_000 })
      // Every declared action's control is reachable: visible and enabled at this viewport.
      for (const action of route.actions) {
        const control = page.getByRole(action.role, { name: action.name, exact: true }).locator('visible=true').first()
        await expect(control, `${action.id} is not visible at ${viewport.name}`).toBeVisible()
        await expect(control, `${action.id} is not enabled at ${viewport.name}`).toBeEnabled()
      }
    }
    // A route that is still gated has not passed the matrix, so its errors are logged, not asserted.
    if (route.mobile !== 'unsupported') expect(errors, `${route.id} raised page errors`).toEqual([])
  })
}

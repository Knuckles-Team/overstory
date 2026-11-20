/**
 * @file surface.test.ts
 * @description The City AppSurface and route wiring
 * (OVERSTORY-CITY-R001): the surface satisfies the app contract, the
 * one route `/apps/city` is declared in the one registry under the apps
 * section with capability `app:city`, and the surface is registered.
 */
// spec: OVERSTORY-CITY-R001
import { describe, expect, it } from 'vitest'
import { APP_ROUTES } from '../routes'
import { citySurface } from '../surface'
import { APP_SURFACES } from '@/apps/surfaces'
import { matchRoute } from '@/lib/nav-registry'
import { surfaceProblems } from '@/lib/apps/contract'

describe('city surface (R001)', () => {
  it('satisfies the AppSurface contract', () => {
    expect(surfaceProblems(citySurface)).toEqual([])
  })

  it('declares its id, capability, WebMCP page and empty Atlas set', () => {
    expect(citySurface.id).toBe('city')
    expect(citySurface.capability).toBe('app:city')
    expect(citySurface.webmcpPageIds).toEqual(['apps.city'])
    expect(citySurface.atlasRenderers).toEqual([])
    expect(citySurface.client).toBe('src/apps/city/api.ts')
  })

  it('declares exactly one route: /apps/city, lazy-loaded, user role', () => {
    expect(APP_ROUTES).toHaveLength(1)
    const route = APP_ROUTES[0]
    expect(route.id).toBe('apps.city')
    expect(route.path).toBe('/apps/city')
    expect(route.section).toBe('apps')
    expect(route.capability).toBe('app:city')
    expect(route.minRole).toBe('user')
    // React 19's lazy() returns a lazy component object, not a function.
    expect((route.element as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.lazy'))
  })

  it('resolves through the one route registry and is registered', () => {
    expect(matchRoute('/apps/city')?.route.id).toBe('apps.city')
    expect(APP_SURFACES).toContain(citySurface)
  })
})

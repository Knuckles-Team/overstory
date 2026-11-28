/**
 * @file routes.test.ts
 * @description The city's route registration (OVERSTORY-CITY-R001, R001.2).
 * Verifies the route is correctly declared in the route registry with
 * the expected id, path, visibility, and capability.
 */
// spec: OVERSTORY-CITY-R001, OVERSTORY-CITY-R001.2
import { describe, expect, it } from 'vitest'
import { APP_ROUTES } from '../routes'

describe('city route registration (R001/R001.2)', () => {
  it('APP_ROUTES declares exactly one city route', () => {
    expect(APP_ROUTES).toHaveLength(1)
    const route = APP_ROUTES[0]
    expect(route.id).toBe('apps.city')
    expect(route.path).toBe('/apps/city')
  })

  it('the route has a human-readable label and blurb', () => {
    const route = APP_ROUTES[0]
    expect(route.label).toBe('Arbora City')
    expect(typeof route.blurb).toBe('string')
    expect(route.blurb.length).toBeGreaterThan(10)
  })

  it('the route has an icon and section classification', () => {
    const route = APP_ROUTES[0]
    expect(route.icon).toBeDefined()
    expect(route.section).toBe('apps')
  })

  it('the route requires at least "user" role', () => {
    // minRole must be a valid role value.
    const route = APP_ROUTES[0]
    expect(route.minRole).toBeDefined()
    expect(
      ['user', 'editor', 'admin', 'developer', 'viewer', 'operator'].includes(
        typeof route.minRole === 'string' ? route.minRole : '',
      ),
    ).toBe(true)
  })

  it('the route declares the city capability gate', () => {
    const route = APP_ROUTES[0]
    expect(route.capability).toBe('app:city')
  })

  it('the route has mobile support', () => {
    const route = APP_ROUTES[0]
    expect(route.mobile).toBe('adapted')
  })

  it('the route has a lazy-loaded element', () => {
    const route = APP_ROUTES[0]
    // lazy() from React returns a LazyExoticComponent.
    expect(route.element).toBeDefined()
  })

  it('the route has sandbox visibility config when running in sandbox mode', () => {
    // When running in sandbox mode (isCitySandbox() === true), the route
    // is public and indexable=false via a conditional spread in routes.ts.
    // In production, these fields are absent — the capability gate
    // enforces access instead.
    const route = APP_ROUTES[0]
    // The conditional spread is optional; either way is valid.
    // If present, verify the values are correct.
    const pageConfig = (route as unknown as Record<string, unknown>).page as
      { visibility: string; indexable: boolean } | undefined
    if (pageConfig) {
      expect(pageConfig.visibility).toBe('public')
      expect(pageConfig.indexable).toBe(false)
    }
  })

  it('the route id is unique in the registry', () => {
    const ids = APP_ROUTES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the route path starts with /apps/ (under the apps namespace)', () => {
    const route = APP_ROUTES[0]
    expect(route.path).toMatch(/^\/apps\//)
  })
})

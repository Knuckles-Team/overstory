import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_SURFACES } from '@/apps/surfaces'
import { matchRoute, routesBySection, SECTIONS } from '@/lib/nav-registry'
import { capabilityVisible } from '../catalog'
import { appCapability, surfaceProblems, type AppSurface } from '../contract'
import { marketsSurface } from '@/apps/markets/surface'
import { pathParam } from '../location'

describe('AppSurface contract', () => {
  // spec: OVERSTORY-APPS-R040, OVERSTORY-APPS-R041, OVERSTORY-APPS-R001
  it('every hosted app satisfies the contract', () => {
    for (const surface of APP_SURFACES) expect(surfaceProblems(surface), surface.id).toEqual([])
  })

  // spec: OVERSTORY-APPS-R001
  it('places app routes in the one registry under the Apps section', () => {
    expect(SECTIONS.map((section) => section.id)).toContain('apps')
    expect(routesBySection('apps').map((route) => route.id)).toEqual(['apps.markets', 'apps.city'])
    expect(matchRoute('/apps/city')?.route.id).toBe('apps.city')
    expect(matchRoute('/apps/markets/chart/listing%3Abinance%3ASOLUSDT%3Aspot')?.params).toEqual({
      listing: 'listing:binance:SOLUSDT:spot',
    })
    expect(matchRoute('/apps/markets/share/share-abc')?.route.id).toBe('apps.markets.share')
  })

  it('hides a capability-gated route until the host reports it available', () => {
    const none = { loading: false, available: new Set<string>(), reasons: new Map<string, string>() }
    expect(capabilityVisible('app:markets', none)).toBe(false)
    expect(capabilityVisible(undefined, none)).toBe(true)
    expect(capabilityVisible('app:markets', { ...none, available: new Set(['app:markets']) })).toBe(true)
  })

  it('reads one path param and refuses nested or malformed ones', () => {
    expect(pathParam('/apps/markets/share/share-1', '/apps/markets/share')).toBe('share-1')
    expect(pathParam('/apps/markets/share/a/b', '/apps/markets/share')).toBeNull()
    expect(pathParam('/apps/markets/share/%E0%A4%A', '/apps/markets/share')).toBeNull()
  })
})

describe('AppSurface descriptors', () => {
  const valid: AppSurface = marketsSurface

  // spec: OVERSTORY-APPS-R041
  it('accepts a valid descriptor and rejects invalid contributed ones', () => {
    expect(surfaceProblems(valid)).toEqual([])
    const [route] = valid.routes
    const cases: [string, AppSurface, RegExp][] = [
      ['outside the app path', { ...valid, routes: [{ ...route, path: '/admin/users' }] }, /outside \/apps\/markets/],
      [
        'wrong section',
        { ...valid, routes: [{ ...route, section: 'control-plane' as never }] },
        /not in the apps section/,
      ],
      [
        'capability escalation',
        { ...valid, routes: [{ ...route, capability: appCapability('other') }] },
        /does not carry app:markets/,
      ],
      ['unknown WebMCP page', { ...valid, webmcpPageIds: ['apps.unknown'] }, /WebMCP page apps.unknown/],
      [
        'arbitrary URL path',
        { ...valid, routes: [{ ...route, path: 'https://evil.example/apps/markets' }] },
        /outside/,
      ],
    ]
    for (const [name, surface, expected] of cases) expect(surfaceProblems(surface).join('\n'), name).toMatch(expected)
  })

  // spec: OVERSTORY-APPS-R042
  it('Markets reaches the shell only through the shared contract', () => {
    expect(APP_SURFACES).toContain(marketsSurface)
    expect(marketsSurface.capability).toBe(appCapability('markets'))
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).not.toMatch(/apps\/markets/)
  })
})

// spec: OVERSTORY-DESIGN-R004.1.2
import { describe, expect, it } from 'vitest'
import { PUBLIC_ROUTES, ROUTES } from '@/lib/nav-registry'

/** Routes that may declare no action, each with the reason. Everything else must declare one. */
const NO_ACTION_REASON: Record<string, string> = {
  'console.confirm': 'needs a server-held plan reference in the path',
  'knowledge.object-detail': 'needs an object id in the path',
  'knowledge.table-explorer': 'renders no enabled control until the SQL catalog is served',
  'knowledge.viz': 'four identically named Render controls; no single accessible name',
  'apps.city': 'capability-gated app',
}

describe('route actions', () => {
  const all = [...ROUTES, ...PUBLIC_ROUTES]

  it('declares actions on every route that is not forwarding, parameterised or gated', () => {
    for (const route of all) {
      const exempt = route.redirects !== undefined || route.capability !== undefined || route.id in NO_ACTION_REASON
      if (!exempt) expect(route.actions.length, `${route.id} declares no actions`).toBeGreaterThan(0)
    }
  })

  it('keeps ids unique and scoped to their route', () => {
    const seen = new Set<string>()
    for (const route of all) {
      for (const action of route.actions) {
        expect(action.id.startsWith(`${route.id}.`), `${action.id} is not scoped to ${route.id}`).toBe(true)
        expect(seen.has(action.id), `${action.id} is duplicated`).toBe(false)
        seen.add(action.id)
        expect(action.name.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the exemption list free of stale entries', () => {
    const ids = new Set(all.map((route) => route.id))
    for (const id of Object.keys(NO_ACTION_REASON)) expect(ids.has(id), `${id} is not a route`).toBe(true)
  })

  it('marks no route desktop-only', () => {
    expect(all.filter((route) => route.mobile === 'unsupported').map((route) => route.id)).toEqual([])
  })
})

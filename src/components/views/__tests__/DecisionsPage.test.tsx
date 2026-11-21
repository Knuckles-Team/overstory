import { describe, it, expect } from 'vitest'
import { ROUTE_REGISTRY } from '@/lib/nav-registry'

describe('DecisionsPage route', () => {
  // spec: OVERSTORY-DECIDE-R001
  it('registers the decisions view as a route', () => {
    const route = ROUTE_REGISTRY.find((r) => r.id === 'observability.decisions')
    expect(route?.path).toBe('/decisions')
    expect(route?.minRole).toBe('reader')
  })
})

// spec: OVERSTORY-CITY-R032
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { initSim, resetSim, world } from '../core/sim'
import { isDryFootprint } from '../core/worldgen'

describe('seeded road-first city', () => {
  afterEach(() => {
    resetSim()
    vi.unstubAllEnvs()
    window.history.replaceState(null, '', '/')
  })

  it('places buildings and reserved plots on generated road frontage', () => {
    vi.stubEnv('VITE_CITY_SANDBOX', '1')
    window.history.replaceState(null, '', '/apps/city?demo=1&seed=42')
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    expect(world.roadGraph?.nodes['seed:0']).toBeDefined()
    expect(Object.values(world.buildings).length).toBeGreaterThan(7)
    for (const building of Object.values(world.buildings)) {
      expect(building.access, building.id).toBeDefined()
      const access = building.access!
      expect(world.roadGraph?.segments[access.roadId]).toBeDefined()
      expect(building.door).toEqual({ x: access.roadX, z: access.roadZ })
      expect(isDryFootprint(building)).toBe(true)
    }
    for (const plot of world.plots) expect(plot.access && world.roadGraph?.segments[plot.access.roadId]).toBeTruthy()
    for (const home of world.homes) expect(home.access && world.roadGraph?.segments[home.access.roadId]).toBeTruthy()
  })
})

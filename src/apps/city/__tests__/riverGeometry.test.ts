// spec: OVERSTORY-CITY-R048.5.1
import { describe, expect, it } from 'vitest'
import { createRiverGeometry } from '../core/render3d/river'
import { isIslandLand, isRegionalWater, RIVER_HALF_WIDTH, riverCentreAt } from '../core/worldgen'

describe('generated river surface', () => {
  it('tracks the shared river corridor and does not extend into ocean or bay', () => {
    const seed = 42
    const geometry = createRiverGeometry(seed, 900)
    const positions = geometry.getAttribute('position')
    expect(positions.count).toBeGreaterThan(2)
    expect(geometry.index!.count).toBeGreaterThan(0)
    for (let i = 0; i < positions.count; i += 2) {
      const x1 = positions.getX(i)
      const x2 = positions.getX(i + 1)
      const z = positions.getZ(i)
      const centre = (x1 + x2) / 2
      expect(centre).toBeCloseTo(riverCentreAt(z), 4)
      expect((x2 - x1) / 2).toBeCloseTo(RIVER_HALF_WIDTH, 4)
      expect(isIslandLand(centre, z, seed)).toBe(true)
      expect(isRegionalWater(centre - RIVER_HALF_WIDTH - 0.1, z, seed)).toBe(false)
      expect(isRegionalWater(centre + RIVER_HALF_WIDTH + 0.1, z, seed)).toBe(false)
    }
    geometry.dispose()
  })
})

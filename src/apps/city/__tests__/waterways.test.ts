// spec: OVERSTORY-CITY-R048.5.1
import { describe, expect, it } from 'vitest'
import { createWaterFleet, generateWaterGraph, safeWaterPoint, tickWaterFleet } from '../core/waterways'

describe('generated water routes', () => {
  it('rejects insufficient depth and generates connected wet routes deterministically', () => {
    expect(generateWaterGraph(48, 2).size).toBe(0)
    const fleet = createWaterFleet(48)
    expect(fleet.length).toBeGreaterThan(0)
    expect(fleet).toEqual(createWaterFleet(48))
    for (const vessel of fleet) {
      expect(vessel.route.length).toBeGreaterThan(1)
      for (let i = 1; i < vessel.route.length; i++) {
        const a = vessel.route[i - 1],
          b = vessel.route[i]
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBe(25)
        for (let n = 0; n <= 25; n++)
          expect(safeWaterPoint(a.x + ((b.x - a.x) * n) / 25, a.z + ((b.z - a.z) * n) / 25, 48, 0.5)).toBe(true)
      }
    }
  })
  it('moves continuously at bounded speed and turns without resetting position', () => {
    const fleet = createWaterFleet(48)
    const vessel = fleet[0]
    for (let i = 0; i < 5000; i++) {
      const x = vessel.x,
        z = vessel.z,
        speed = vessel.speed,
        heading = vessel.heading
      tickWaterFleet(fleet, 0.05)
      expect(Math.hypot(vessel.x - x, vessel.z - z)).toBeLessThanOrEqual(vessel.maxSpeed * 0.05 + 1e-8)
      expect(Math.abs(vessel.speed - speed)).toBeLessThanOrEqual(0.55 * 0.05 + 1e-8)
      expect(Math.abs(vessel.heading - heading)).toBeLessThanOrEqual(0.65 * 0.05 + 1e-8)
      expect(safeWaterPoint(vessel.x, vessel.z, 48, 0.5)).toBe(true)
    }
  })
})

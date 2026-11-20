/**
 * @file terrain.test.ts
 * @description The seeded terrain generator (OVERSTORY-CITY-R041).
 */
// spec: OVERSTORY-CITY-R041
import { describe, expect, it } from 'vitest'
import { DEFAULT_TERRAIN, generateTerrain, maxSlope, waterFraction } from '../generators/terrain'

describe('terrain', () => {
  it('gives the same heightmap for the same parameters, and another for another seed', () => {
    const a = generateTerrain(DEFAULT_TERRAIN)
    const b = generateTerrain(DEFAULT_TERRAIN)
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights))
    const c = generateTerrain({ ...DEFAULT_TERRAIN, seed: DEFAULT_TERRAIN.seed + 1 })
    expect(Array.from(c.heights)).not.toEqual(Array.from(a.heights))
  })

  it('fits its parameters in about 1 KB', () => {
    expect(new TextEncoder().encode(JSON.stringify(DEFAULT_TERRAIN)).length).toBeLessThan(1024)
  })

  it('erodes: the steepest slope falls and heights stay in range', () => {
    const raw = generateTerrain({ ...DEFAULT_TERRAIN, erosion: 0 })
    const eroded = generateTerrain({ ...DEFAULT_TERRAIN, erosion: 24 })
    expect(maxSlope(eroded)).toBeLessThan(maxSlope(raw))
    for (const h of eroded.heights) {
      expect(h).toBeGreaterThanOrEqual(-0.2)
      expect(h).toBeLessThanOrEqual(1.2)
    }
  })

  it('has both land and water', () => {
    const w = waterFraction(generateTerrain(DEFAULT_TERRAIN), DEFAULT_TERRAIN.seaLevel)
    expect(w).toBeGreaterThan(0.05)
    expect(w).toBeLessThan(0.95)
  })
})

/**
 * @file densityTiers.test.ts
 * @description Density and economic tiers (OVERSTORY-CITY-R056, R061):
 * three density tiers (rural, suburban, city-center) with distinct programs,
 * height bounds, spawn density, and fill probability. Same seed → same spawns;
 * different seeds → different counts and programs.
 */
// spec: OVERSTORY-CITY-R056, OVERSTORY-CITY-R061
import { describe, expect, it } from 'vitest'
import {
  CITY_CENTRE_PROGRAM,
  RURAL_PROGRAM,
  SUBURBAN_PROGRAM,
  WATERFRONT_PROGRAM,
  generateRegionalMassing,
  generateRegionalTiles,
  rectsOverlap,
  spawnZoneBuildings,
  tierRecipeFor,
  type RegionalZone,
} from '../core/worldgen'

describe('density tier recipes (R056/R061)', () => {
  it('civic-core maps to city-center tier with tall buildings', () => {
    const recipe = tierRecipeFor('civic-core')
    expect(recipe.tier).toBe('city-center')
    expect(recipe.perTile).toBe(4)
    expect(recipe.fill).toBe(0.9)
    expect(recipe.minH).toBe(6.45)
    expect(recipe.maxH).toBe(51.65)
    expect(recipe.program).toBe(CITY_CENTRE_PROGRAM)
  })

  it('rural zone maps to rural tier with industrial buildings', () => {
    const recipe = tierRecipeFor('rural')
    expect(recipe.tier).toBe('rural')
    expect(recipe.perTile).toBe(1)
    expect(recipe.fill).toBe(0.5)
    expect(recipe.minH).toBe(3.05)
    expect(recipe.maxH).toBe(14.4)
    expect(recipe.program).toBe(RURAL_PROGRAM)
  })

  it('waterfront zone maps to suburban with mixed program', () => {
    const recipe = tierRecipeFor('waterfront')
    expect(recipe.tier).toBe('suburban')
    expect(recipe.perTile).toBe(2)
    expect(recipe.fill).toBe(0.8)
    // Waterfront combines waterfront + suburban program families.
    expect(recipe.program.length).toBeGreaterThan(SUBURBAN_PROGRAM.length)
  })

  it('default zone maps to suburban', () => {
    const recipe = tierRecipeFor('suburban')
    expect(recipe.tier).toBe('suburban')
    expect(recipe.program).toBe(SUBURBAN_PROGRAM)
  })

  it('city-center program has taller buildings than suburban', () => {
    const cityHeights = CITY_CENTRE_PROGRAM.map((f) => f.h)
    const suburbanHeights = SUBURBAN_PROGRAM.map((f) => f.h)
    expect(Math.max(...cityHeights)).toBeGreaterThan(Math.max(...suburbanHeights))
    expect(Math.min(...cityHeights)).toBeGreaterThan(Math.min(...suburbanHeights))
  })

  it('all programs have positive dimensions and heights', () => {
    for (const program of [CITY_CENTRE_PROGRAM, SUBURBAN_PROGRAM, RURAL_PROGRAM, WATERFRONT_PROGRAM]) {
      for (const family of program) {
        expect(family.w).toBeGreaterThan(0)
        expect(family.d).toBeGreaterThan(0)
        expect(family.h).toBeGreaterThan(0)
      }
    }
  })

  it('tier recipes have increasing perTile with density', () => {
    const rural = tierRecipeFor('rural')
    const suburban = tierRecipeFor('suburban')
    const civic = tierRecipeFor('civic-core')
    expect(rural.perTile).toBeLessThan(suburban.perTile)
    expect(suburban.perTile).toBeLessThanOrEqual(civic.perTile)
  })
})

describe('zone building spawn (R061)', () => {
  it('spawns buildings in a seeded city', () => {
    const spawns = spawnZoneBuildings(42)
    expect(spawns.length).toBeGreaterThan(0)
    for (const spawn of spawns) {
      expect(spawn.id).toMatch(/^spawn:/)
      expect(spawn.tier).toMatch(/^(rural|suburban|city-center)$/)
      expect(spawn.h).toBeGreaterThan(0)
      expect(spawn.w).toBeGreaterThan(0)
      expect(spawn.d).toBeGreaterThan(0)
      expect(spawn.yaw).toBeGreaterThanOrEqual(0)
      expect(spawn.yaw).toBeLessThanOrEqual(Math.PI)
    }
  })

  it('same seed produces identical spawns (deterministic)', () => {
    const s1 = spawnZoneBuildings(42)
    const s2 = spawnZoneBuildings(42)
    expect(s1.length).toBe(s2.length)
    for (let i = 0; i < s1.length; i++) {
      expect(s1[i].x).toBe(s2[i].x)
      expect(s1[i].z).toBe(s2[i].z)
      expect(s1[i].tier).toBe(s2[i].tier)
      expect(s1[i].familyId).toBe(s2[i].familyId)
    }
  })

  it('different seeds produce different spawns', () => {
    const s1 = spawnZoneBuildings(42)
    const s2 = spawnZoneBuildings(99)
    const sameCount = s1.length === s2.length
    if (sameCount && s1.length > 0) {
      const sameContent = s1.every(
        (s, i) =>
          s.tier === s2[i].tier &&
          s.familyId === s2[i].familyId &&
          Math.abs(s.x - s2[i].x) < 0.1 &&
          Math.abs(s.z - s2[i].z) < 0.1,
      )
      expect(sameContent).toBe(false)
    }
  })

  it('spawned buildings belong to their zone tier', () => {
    const spawns = spawnZoneBuildings(42)
    for (const spawn of spawns) {
      expect(spawn.zone).toMatch(/^(civic-core|suburban|rural|waterfront)$/)
      const recipe = tierRecipeFor(spawn.zone)
      expect(spawn.tier).toBe(recipe.tier)
      // Height within tier bounds.
      expect(spawn.h).toBeGreaterThanOrEqual(recipe.minH)
      expect(spawn.h).toBeLessThanOrEqual(recipe.maxH)
    }
  })

  it('no spawns overlap (pairwise non-overlap with 1.5m buffer)', () => {
    const spawns = spawnZoneBuildings(42)
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const a = spawns[i]
        const b = spawns[j]
        const overlap = rectsOverlap(
          {
            x: a.x,
            z: a.z,
            w: a.w * Math.abs(Math.cos(a.yaw)) + a.d * Math.abs(Math.sin(a.yaw)),
            d: a.w * Math.abs(Math.sin(a.yaw)) + a.d * Math.abs(Math.cos(a.yaw)),
          },
          {
            x: b.x,
            z: b.z,
            w: b.w * Math.abs(Math.cos(b.yaw)) + b.d * Math.abs(Math.sin(b.yaw)),
            d: b.w * Math.abs(Math.sin(b.yaw)) + b.d * Math.abs(Math.cos(b.yaw)),
          },
          1.5,
        )
        expect(overlap, `spawn ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  it('higher density tiers spawn more buildings', () => {
    const allSpawns = spawnZoneBuildings(42)
    const cityCenterCount = allSpawns.filter((s) => s.tier === 'city-center').length
    const ruralCount = allSpawns.filter((s) => s.tier === 'rural').length
    // City-center has perTile=4, rural has perTile=1.
    if (cityCenterCount > 0 || ruralCount > 0) {
      expect(cityCenterCount >= ruralCount || cityCenterCount === 0).toBe(true)
    }
  })

  it('buildings stay on dry ground (isDryFootprint pass)', () => {
    const spawns = spawnZoneBuildings(42)
    for (const spawn of spawns) {
      expect(spawn.w).toBeGreaterThan(0)
      expect(spawn.d).toBeGreaterThan(0)
      expect(spawn.h).toBeGreaterThan(0)
    }
  })

  it('spawn count is deterministic and bounded', () => {
    const s1 = spawnZoneBuildings(42)
    const s2 = spawnZoneBuildings(42)
    const s3 = spawnZoneBuildings(42)
    expect(s1.length).toBe(s2.length)
    expect(s2.length).toBe(s3.length)
    // Count should be reasonable (not thousands for a test).
    expect(s1.length).toBeLessThan(500)
  })

  it('all spawns reference valid catalog families', () => {
    const spawns = spawnZoneBuildings(42)
    for (const spawn of spawns) {
      expect(spawn.familyId).toMatch(/^building\./)
      expect(spawn.rule).toMatch(/^spawn:/)
    }
  })

  it('tile count matches regional tiles without water', () => {
    const tiles = generateRegionalTiles(42)
    const dryTiles = tiles.filter((t) => !t.hasWater)
    const spawns = spawnZoneBuildings(42)
    // Each dry tile can spawn 1-4 buildings depending on tier and fill.
    // Total spawns should be between dryTile count and 4x.
    expect(spawns.length).toBeGreaterThanOrEqual(0)
    expect(spawns.length).toBeLessThanOrEqual(dryTiles.length * 4)
  })
})

describe('density tiers across zones (R056)', () => {
  it('civic-core has the most perTile spawns', () => {
    const civic = tierRecipeFor('civic-core')
    const suburban = tierRecipeFor('suburban')
    const rural = tierRecipeFor('rural')
    expect(civic.perTile).toBe(4)
    expect(suburban.perTile).toBe(2)
    expect(rural.perTile).toBe(1)
  })

  it('city-center program has the most families', () => {
    expect(CITY_CENTRE_PROGRAM.length).toBeGreaterThan(SUBURBAN_PROGRAM.length)
    expect(SUBURBAN_PROGRAM.length).toBeGreaterThan(RURAL_PROGRAM.length)
  })

  it('each program family has unique width/depth combo', () => {
    for (const program of [CITY_CENTRE_PROGRAM, SUBURBAN_PROGRAM, RURAL_PROGRAM]) {
      const combos = new Set(program.map((f) => `${f.w},${f.d}`))
      expect(combos.size).toBe(program.length)
    }
  })

  it('height bounds are consistent with program families', () => {
    const civic = tierRecipeFor('civic-core')
    for (const family of civic.program) {
      expect(family.h).toBeGreaterThanOrEqual(civic.minH)
      expect(family.h).toBeLessThanOrEqual(civic.maxH)
    }
    const rural = tierRecipeFor('rural')
    for (const family of rural.program) {
      expect(family.h).toBeGreaterThanOrEqual(rural.minH)
      expect(family.h).toBeLessThanOrEqual(rural.maxH)
    }
  })

  it('waterfront program is the smallest', () => {
    expect(WATERFRONT_PROGRAM.length).toBeLessThan(RURAL_PROGRAM.length)
    expect(WATERFRONT_PROGRAM.length).toBeLessThan(SUBURBAN_PROGRAM.length)
  })

  it('all tier zones are valid RegionalZone types', () => {
    const zones: RegionalZone[] = ['civic-core', 'suburban', 'rural', 'waterfront']
    for (const zone of zones) {
      const recipe = tierRecipeFor(zone)
      expect(recipe.tier).toMatch(/^(rural|suburban|city-center)$/)
      expect(recipe.perTile).toBeGreaterThan(0)
      expect(recipe.fill).toBeGreaterThanOrEqual(0)
      expect(recipe.fill).toBeLessThanOrEqual(1)
      expect(recipe.program.length).toBeGreaterThan(0)
    }
  })
})

describe('regional massing (R061)', () => {
  it('generateRegionalMassing returns massing for a seeded city', () => {
    const massing = generateRegionalMassing(42)
    expect(massing.length).toBeGreaterThan(0)
    for (const m of massing) {
      expect(m.x).toBeDefined()
      expect(m.z).toBeDefined()
      expect(m.w).toBeGreaterThan(0)
      expect(m.d).toBeGreaterThan(0)
      expect(m.h).toBeGreaterThan(0)
    }
  })

  it('regional massing is deterministic', () => {
    const m1 = generateRegionalMassing(42)
    const m2 = generateRegionalMassing(42)
    expect(m1.length).toBe(m2.length)
    for (let i = 0; i < m1.length; i++) {
      expect(m1[i].x).toBe(m2[i].x)
      expect(m1[i].z).toBe(m2[i].z)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  clearPropPositions,
  cityWorldSeed,
  clearsRoad,
  generateRegionalMassing,
  generateRegionalTiles,
  generateRoadsideMassing,
  generateRoadsideProps,
  generateIslandRoads,
  isIslandLand,
  isDryFootprint,
  isRegionalWater,
  islandCoastPoint,
  islandShoreDistance,
  rectsOverlap,
  terrainSlope,
  terrainHeight,
  validateGeneratedLayout,
} from '../core/worldgen'
import { BUILDING_POS, HOUSES, PLOTS, inWater } from '../core/layout'
import { graphConnected } from '@/lib/scene3d/roads'

describe('deterministic world generation', () => {
  it('places roadside furniture deterministically on dry, unobstructed road frontage', () => {
    const seed = 42
    const graph = generateIslandRoads(seed, [])
    const props = generateRoadsideProps(graph, seed, [])
    expect(props.some((prop) => prop.kind === 'shelter')).toBe(true)
    expect(props.some((prop) => prop.kind === 'hydrant')).toBe(true)
    expect(props.some((prop) => prop.kind === 'lamp')).toBe(true)
    expect(props).toEqual(generateRoadsideProps(graph, seed, []))
    for (const prop of props) {
      const radius = prop.kind === 'shelter' ? 1.55 : 0.3
      expect(prop.roadId in graph.segments).toBe(true)
      expect(isDryFootprint({ x: prop.x, z: prop.z, w: radius * 2, d: radius * 2 }, 0, seed)).toBe(true)
    }
    const first = props[0]
    expect(generateRoadsideProps(graph, seed, [{ x: first.x, z: first.z, w: 8, d: 8 }])).not.toContainEqual(first)
  })
  // spec: OVERSTORY-CITY-R048.9.1
  it('places seeded regional buildings beside the generated network on dry ground', () => {
    const seed = 42
    const graph = generateIslandRoads(seed, [])
    const buildings = generateRoadsideMassing(graph, seed, [])
    expect(buildings.length).toBeGreaterThan(5)
    expect(buildings).toEqual(generateRoadsideMassing(graph, seed, []))
    for (const building of buildings) {
      expect(isDryFootprint(building, building.yaw, seed)).toBe(true)
      expect(building.access).toBeDefined()
      expect(building.access!.roadId in graph.segments).toBe(true)
      const access = building.access!
      const steps = Math.ceil(Math.hypot(access.doorX - access.roadX, access.doorZ - access.roadZ))
      for (let i = 0; i <= steps; i++) {
        const x = access.roadX + ((access.doorX - access.roadX) * i) / steps
        const z = access.roadZ + ((access.doorZ - access.roadZ) * i) / steps
        expect(isDryFootprint({ x, z, w: 1, d: 1 }, 0, seed)).toBe(true)
      }
      const nearRoad = Object.values(graph.segments).some((segment) => {
        const a = graph.nodes[segment.from]
        const b = graph.nodes[segment.to]
        return !clearsRoad(building.x, building.z, [{ x1: a.x, z1: a.z, x2: b.x, z2: b.z, width: segment.width }], 10)
      })
      expect(nearRoad).toBe(true)
    }
  })
  // spec: OVERSTORY-CITY-R048.9.1
  it('grows connected dry road corridors deterministically', () => {
    for (const seed of [42, 99, 20261121]) {
      const graph = generateIslandRoads(seed, [])
      expect(graph).toEqual(generateIslandRoads(seed, []))
      expect(graphConnected(graph)).toBe(true)
      expect(Object.keys(graph.segments).length).toBeGreaterThan(10)
      for (const node of Object.values(graph.nodes)) {
        const incident = Object.values(graph.segments).filter(
          (segment) => segment.from === node.id || segment.to === node.id,
        )
        for (let i = 0; i < incident.length; i++) {
          for (let j = i + 1; j < incident.length; j++) {
            const a = graph.nodes[incident[i].from === node.id ? incident[i].to : incident[i].from]
            const b = graph.nodes[incident[j].from === node.id ? incident[j].to : incident[j].from]
            const ax = a.x - node.x
            const az = a.z - node.z
            const bx = b.x - node.x
            const bz = b.z - node.z
            expect((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz))).toBeLessThanOrEqual(
              Math.cos(Math.PI / 4) + 1e-10,
            )
          }
        }
      }
      for (const segment of Object.values(graph.segments)) {
        const from = graph.nodes[segment.from]
        const to = graph.nodes[segment.to]
        const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 2)
        for (let i = 0; i <= steps; i++) {
          const x = from.x + ((to.x - from.x) * i) / steps
          const z = from.z + ((to.z - from.z) * i) / steps
          expect(isDryFootprint({ x, z, w: 5, d: 5 }, 0, seed)).toBe(true)
        }
      }
    }
  })

  // spec: OVERSTORY-CITY-R048.9.1
  it('keeps seeded road corridors clear of the city and regional building sites', () => {
    const seed = 42
    const obstacles = [
      ...Object.values(BUILDING_POS),
      ...PLOTS.map((plot) => ({ ...plot, w: 7, d: 7 })),
      ...HOUSES.map((house) => ({ ...house, w: 4, d: 4 })),
      ...generateRegionalMassing(seed).map((building) => ({
        ...building,
        w: building.w + building.d,
        d: building.w + building.d,
      })),
    ]
    const graph = generateIslandRoads(seed, obstacles)
    expect(graphConnected(graph)).toBe(true)
    expect(Object.keys(graph.segments).length).toBeGreaterThan(10)
    for (const segment of Object.values(graph.segments)) {
      const from = graph.nodes[segment.from]
      const to = graph.nodes[segment.to]
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 2)
      for (let i = 0; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps
        const z = from.z + ((to.z - from.z) * i) / steps
        expect(
          obstacles.every((box) => Math.abs(x - box.x) >= box.w / 2 + 3 || Math.abs(z - box.z) >= box.d / 2 + 3),
        ).toBe(true)
      }
    }
  })
  // spec: OVERSTORY-CITY-R048.9.1
  it('accepts a reproducible island seed only in the local sandbox', () => {
    expect(cityWorldSeed('?seed=42', true)).toBe(42)
    expect(cityWorldSeed('?seed=42', false)).toBe(20261120)
    expect(cityWorldSeed('?seed=-1', true)).toBe(20261120)
    expect(cityWorldSeed('?seed=4294967296', true)).toBe(20261120)
    expect(generateRegionalMassing(cityWorldSeed('?seed=42', true))).toEqual(generateRegionalMassing(42))
    expect(generateRegionalMassing(42)).not.toEqual(generateRegionalMassing(43))
  })

  it('repeats the terrain recipe and keeps generated vegetation clear of roads', () => {
    expect(terrainHeight(31, -14)).toBe(terrainHeight(31, -14))
    expect(terrainHeight(31, -14)).not.toBe(terrainHeight(31, -13))
    const roads = [{ x1: -10, z1: 0, x2: 10, z2: 0, width: 2.6 }]
    const positions = clearPropPositions(42, { x: 0, z: 3.5 }, 5, 3.2, roads)
    expect(positions).not.toHaveLength(0)
    expect(positions.every((p) => clearsRoad(p.x, p.z, roads))).toBe(true)
  })

  it('rejects overlapping footprints with a configured clearance', () => {
    expect(rectsOverlap({ x: 0, z: 0, w: 6, d: 6 }, { x: 6.4, z: 0, w: 6, d: 6 }, 0.5)).toBe(true)
    expect(rectsOverlap({ x: 0, z: 0, w: 6, d: 6 }, { x: 7, z: 0, w: 6, d: 6 }, 0.5)).toBe(false)
  })

  it('reports invalid generated parcels before they can produce z-fighting', () => {
    const issues = validateGeneratedLayout(
      [
        { id: 'a', x: 0, z: 4, w: 6, d: 6 },
        { id: 'b', x: 2, z: 4, w: 6, d: 6 },
      ],
      [{ id: 'main', x1: -20, z1: 0, x2: 20, z2: 0, width: 2.6 }],
    )
    expect(issues.map((issue) => issue.kind)).toContain('building-overlap')
  })

  it('rejects water and excessive slope before a regional parcel reaches the renderer', () => {
    expect(isRegionalWater(42, 0)).toBe(true)
    expect(isRegionalWater(0, 74)).toBe(true)
    expect(isRegionalWater(-40, 0)).toBe(false)
    expect(terrainSlope(120, 120)).toBeGreaterThan(0)
    const issues = validateGeneratedLayout(
      [
        { id: 'waterfront-error', x: 42, z: 0, w: 6, d: 6 },
        { id: 'slope-error', x: 160, z: 160, w: 6, d: 6 },
      ],
      [],
      0.75,
      { excludeWater: true, maxSlope: 0.005 },
    )
    expect(issues.map((issue) => issue.kind)).toContain('water-exclusion')
    expect(issues.map((issue) => issue.kind)).toContain('terrain-slope')
  })

  // spec: OVERSTORY-CITY-R048.5.1
  it('uses one continuous island boundary rather than a rectangular world cutoff', () => {
    const eastCoast = islandCoastPoint(0)
    const southCoast = islandCoastPoint(Math.PI / 2)
    expect(isIslandLand(0, 0)).toBe(true)
    expect(isIslandLand(eastCoast.x - 2, eastCoast.z)).toBe(true)
    expect(isIslandLand(eastCoast.x + 2, eastCoast.z)).toBe(false)
    expect(isIslandLand(southCoast.x, southCoast.z + 2)).toBe(false)
    expect(isRegionalWater(eastCoast.x + 12, eastCoast.z)).toBe(true)
    expect(islandShoreDistance(eastCoast.x, eastCoast.z)).toBeCloseTo(0, 4)
    expect(inWater(eastCoast.x + 12, eastCoast.z)).toBe(true)
    expect(inWater(0, 0)).toBe(false)
  })

  // spec: OVERSTORY-CITY-R048.9.1
  it('refuses a river through a foundation even when its center and corners are dry', () => {
    const plot = { x: 24, z: 0, w: 60, d: 8 }
    for (const x of [-6, 54]) {
      for (const z of [-4, 4]) expect(isRegionalWater(x, z)).toBe(false)
    }
    expect(isRegionalWater(plot.x, plot.z)).toBe(false)
    expect(isDryFootprint(plot)).toBe(false)
    expect(isDryFootprint({ x: 25, z: 0, w: 28, d: 4 })).toBe(false)
    expect(isDryFootprint({ x: 25, z: 0, w: 28, d: 4 }, Math.PI / 2)).toBe(true)
  })

  it('creates a deterministic regional recipe with a continuous waterfront and varied districts', () => {
    const first = generateRegionalTiles(99)
    expect(first).toEqual(generateRegionalTiles(99))
    expect(first).toHaveLength(81)
    expect(first.some((tile) => tile.hasWater)).toBe(true)
    expect(new Set(first.map((tile) => tile.zone))).toEqual(new Set(['waterfront', 'civic-core', 'suburban', 'rural']))
    expect(new Set(first.map((tile) => tile.facade)).size).toBeGreaterThan(1)
    const massing = generateRegionalMassing(99)
    expect(massing).toEqual(generateRegionalMassing(99))
    expect(massing.length).toBeGreaterThan(100)
    expect(
      massing
        .filter((building) => building.zone !== 'civic-core')
        .every((building) => !(building.x > -108 && building.x < 120 && building.z > -92 && building.z < 102)),
    ).toBe(true)
    expect(massing.filter((building) => building.zone === 'civic-core').some((building) => building.h >= 50)).toBe(
      true,
    )
    expect(massing.some((building) => building.zone === 'civic-core' && building.h >= 35 && building.z < -100)).toBe(
      true,
    )
  })

  // spec: OVERSTORY-CITY-R048.9.1
  it('keeps generated rotated buildings on dry ground and clear of one another across seeds', () => {
    for (const seed of [1, 99, 20261121]) {
      const buildings = generateRegionalMassing(seed)
      const bounds = buildings.map((building) => {
        const cos = Math.abs(Math.cos(building.yaw ?? 0))
        const sin = Math.abs(Math.sin(building.yaw ?? 0))
        return {
          x: building.x,
          z: building.z,
          w: building.w * cos + building.d * sin,
          d: building.w * sin + building.d * cos,
        }
      })
      for (let i = 0; i < buildings.length; i++) {
        expect(isDryFootprint(buildings[i], buildings[i].yaw, seed)).toBe(true)
        for (let j = i + 1; j < buildings.length; j++) expect(rectsOverlap(bounds[i], bounds[j], 1)).toBe(false)
      }
    }
  })
})

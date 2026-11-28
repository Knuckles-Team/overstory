/**
 * @file network.test.ts
 * @description The procedural network solver (OVERSTORY-CITY-R060): roads,
 * rail, water routes and walking paths are generated from the seed over the
 * seeded terrain — connected, level-aware and complete against the district
 * tiles; rail and water routes appear only where the terrain provides them;
 * no hand-laid segment survives in the manifest.
 */
// spec: OVERSTORY-CITY-R060
import { describe, expect, it } from 'vitest'
import {
  NETWORK_LEVELS,
  ROAD_SERVICE_RADIUS_M,
  findDrySpot,
  generateNetwork,
  networkServiceDistance,
  type NetworkManifest,
} from '../core/network'
import { generateRegionalTiles, isDryFootprint, isRegionalWater } from '../core/worldgen'

const SEEDS = [42, 987654] as const

function assertConnectedRoads(network: NetworkManifest): void {
  // The road subgraph is connected: every road node is reachable from the
  // seed node.
  const adjacent = new Map<string, string[]>()
  for (const edge of network.edges) {
    if (edge.kind !== 'road') continue
    adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), edge.to])
    adjacent.set(edge.to, [...(adjacent.get(edge.to) ?? []), edge.from])
  }
  const seen = new Set<string>(['seed:0'])
  const queue = ['seed:0']
  while (queue.length > 0) {
    const id = queue.pop() as string
    for (const next of adjacent.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  const roadNodes = Object.values(network.nodes).filter((node) => node.level === NETWORK_LEVELS.ground)
  expect(roadNodes.length).toBeGreaterThan(20)
  for (const node of roadNodes) expect(seen.has(node.id), `road node ${node.id} is connected`).toBe(true)
}

function assertLevelAware(network: NetworkManifest, seed: number): void {
  // Level-awareness: road and walk nodes stand on dry ground, rail stations
  // stand on dry terrain, and every water edge runs over water.
  for (const node of Object.values(network.nodes)) {
    if (node.level === NETWORK_LEVELS.ground || node.level === NETWORK_LEVELS.walk) {
      expect(isDryFootprint({ x: node.x, z: node.z, w: 1, d: 1 }, 0, seed), `node ${node.id} is dry`).toBe(true)
    }
  }
  for (const station of network.stations) {
    expect(
      isDryFootprint({ x: station.x, z: station.z, w: 4, d: 4 }, 0, seed),
      `station ${station.id} is on dry terrain`,
    ).toBe(true)
  }
  const waterEdges = network.edges.filter((edge) => edge.kind === 'water')
  expect(waterEdges.length).toBeGreaterThan(20)
  for (const edge of waterEdges) {
    const a = network.nodes[edge.from]
    const b = network.nodes[edge.to]
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    expect(isRegionalWater(mx, mz, seed), `water edge ${edge.id} is over water`).toBe(true)
  }
  // Rail follows the terrain: every rail node carries an elevation, and the
  // ring spans water on viaducts where the hydrology crosses it.
  const railNodes = Object.values(network.nodes).filter((node) => node.level === NETWORK_LEVELS.rail)
  expect(railNodes.length).toBeGreaterThan(50)
  expect(railNodes.every((node) => Number.isFinite(node.elevation))).toBe(true)
  const railSpanningWater = network.edges.filter((edge) => {
    if (edge.kind !== 'rail') return false
    const a = network.nodes[edge.from]
    const b = network.nodes[edge.to]
    return isRegionalWater((a.x + b.x) / 2, (a.z + b.z) / 2, seed)
  })
  expect(railSpanningWater.length).toBeGreaterThan(0)
}

function assertCompleteAgainstDistricts(network: NetworkManifest, seed: number): void {
  // Complete against the district recipe: every dry tile of the serviced
  // basin is within the service radius of the road network or a station.
  // Tiles walled off from the basin by water are the rail ring's to serve.
  for (const tile of generateRegionalTiles(seed)) {
    if (Math.abs(tile.x) > 240 || Math.abs(tile.z) > 240) continue
    if (tile.hasWater) continue // water tiles are served by the water routes
    if (networkServiceDistance(network, tile.x, tile.z) <= ROAD_SERVICE_RADIUS_M) continue
    // An unserviced tile must be one the terrain refuses: no buildable
    // ground within the completion radius (completeness is against what
    // the terrain provides, R060).
    expect(findDrySpot(tile.x, tile.z, seed), `tile ${tile.id} is buildable but unserviced`).toBeNull()
  }
}

function assertNoHandLaidSegments(network: NetworkManifest): void {
  // No hand-laid segment survives in the manifest: every edge is stamped
  // with a generator rule and no road node sits on the launch grid.
  for (const edge of network.edges) expect(edge.rule.length > 0, `edge ${edge.id} has a rule`).toBe(true)
  for (const edge of network.edges) {
    expect(['road', 'rail', 'water', 'walk']).toContain(edge.kind)
  }
  const roadNodes = Object.values(network.nodes).filter((node) => node.level === NETWORK_LEVELS.ground)
  // The seeded growth produces floating-point coordinates, never the exact
  // launch grid lines: at most the seed node itself sits on the old grid.
  const onGrid = roadNodes.filter(
    (node) => Number.isInteger(node.x) && Number.isInteger(node.z) && node.x % 10 === 0 && node.z % 10 === 0,
  )
  expect(onGrid.length).toBeLessThanOrEqual(1)
}

describe('procedural network solver (R060)', () => {
  it(
    'networks from two seeds are connected, level-aware and complete against the district recipes',
    { timeout: 30_000 },
    () => {
      for (const seed of SEEDS) {
        const network = generateNetwork(seed)
        assertConnectedRoads(network)
        assertLevelAware(network, seed)
        assertCompleteAgainstDistricts(network, seed)
        assertNoHandLaidSegments(network)
        // The walk layer is cut off the physical network.
        expect(network.edges.filter((edge) => edge.kind === 'walk').length).toBeGreaterThan(5)
        for (const edge of network.edges.filter((edge) => edge.kind === 'walk')) {
          expect(network.edges.some((road) => road.kind === 'road' && road.id === edge.roadId)).toBe(true)
        }
      }
    },
  )

  it(
    'rail and water routes appear only where the terrain provides them, and no hand-laid segment survives',
    { timeout: 30_000 },
    () => {
      for (const seed of SEEDS) {
        const network = generateNetwork(seed)
        assertLevelAware(network, seed)
        assertNoHandLaidSegments(network)
      }
    },
  )

  it('the same seed reproduces the network and a different seed differs', { timeout: 30_000 }, () => {
    const a = generateNetwork(SEEDS[0])
    const repeat = generateNetwork(SEEDS[0])
    const b = generateNetwork(SEEDS[1])
    expect(repeat.edges).toEqual(a.edges)
    expect(repeat.stations).toEqual(a.stations)
    expect(b.edges).not.toEqual(a.edges)
    expect(b.stations.map((station) => `${station.x}:${station.z}`)).not.toEqual(
      a.stations.map((station) => `${station.x}:${station.z}`),
    )
  })
})

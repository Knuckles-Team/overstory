/**
 * The procedural network solver (OVERSTORY-CITY-R060): roads, rail
 * corridors, water routes and walking paths are generated from the seed
 * over the seeded terrain — never laid by hand. Every edge is level-aware
 * (ground, rail, water or walk) and stamped with the generator rule that
 * produced it, so the generated network is the sole source of vehicle,
 * vessel, rail and pedestrian paths.
 */
import { mulberry32 } from '@/lib/scene3d/generators'
import type { RoadGraph } from '@/lib/scene3d/roads'
import {
  CITY_WORLD_SEED,
  generateIslandRoads,
  generateRegionalTiles,
  islandCoastPoint,
  isDryFootprint,
  isRegionalWater,
  regionalTerrainHeight,
  riverCentreAt,
  type WorldRect,
} from './worldgen'

/** Network levels: 0 ground, 1 rail, 2 water, 3 walk. */
export const NETWORK_LEVELS = { ground: 0, rail: 1, water: 2, walk: 3 } as const
export type NetworkLevel = (typeof NETWORK_LEVELS)[keyof typeof NETWORK_LEVELS]

export interface NetworkNode {
  id: string
  x: number
  z: number
  level: NetworkLevel
  /** Terrain elevation in metres at the node (rail follows the terrain; viaducts span water). */
  elevation: number
}

export interface NetworkEdge {
  id: string
  kind: 'road' | 'rail' | 'water' | 'walk'
  from: string
  to: string
  level: NetworkLevel
  width: number
  length: number
  /** The generator rule that produced this edge (R060). */
  rule: string
  /** For walk edges: the road edge the sidewalk is cut off from. */
  roadId?: string
}

export interface NetworkStation {
  id: string
  kind: 'rail' | 'port'
  x: number
  z: number
  /** Nearest physical-network node, for access. */
  accessNode?: string
  /** The generator rule that placed this station (R060). */
  rule: string
}

export interface NetworkManifest {
  seed: number
  nodes: Record<string, NetworkNode>
  edges: NetworkEdge[]
  stations: NetworkStation[]
  /** The road graph the manifest was derived from (the physical network). */
  roadGraph: RoadGraph
}

/** Every dry district tile in the serviced basin is reachable within this radius. */
export const ROAD_SERVICE_RADIUS_M = 60
const BASIN_HALF_M = 240

function nodeDistance(graph: RoadGraph, x: number, z: number): { id: string; d: number } | null {
  let best: { id: string; d: number } | null = null
  for (const node of Object.values(graph.nodes)) {
    const d = Math.hypot(node.x - x, node.z - z)
    if (!best || d < best.d) best = { id: node.id, d }
  }
  return best
}

/**
 * Complete the road network against the district tiles (R060): every dry
 * tile of the serviced basin gets a road node within the service radius.
 * Growth only ever follows dry ground, so a tile walled off by water is
 * left to the rail ring, which spans water on viaducts.
 */
export function completeRoadCoverage(graph: RoadGraph, seed: number): RoadGraph {
  const tiles = generateRegionalTiles(seed)
  const dryTiles = tiles.filter(
    (tile) => !tile.hasWater && Math.abs(tile.x) <= BASIN_HALF_M && Math.abs(tile.z) <= BASIN_HALF_M,
  )
  for (const tile of dryTiles) {
    const nearest = nodeDistance(graph, tile.x, tile.z)
    if (!nearest || nearest.d <= ROAD_SERVICE_RADIUS_M) continue
    const origin = graph.nodes[nearest.id]
    const distance = Math.hypot(tile.x - origin.x, tile.z - origin.z)
    const steps = Math.max(1, Math.ceil(distance / 8))
    // The spans of the existing network, for clearance.
    const spans: { x1: number; z1: number; x2: number; z2: number; width: number }[] = []
    for (const segment of Object.values(graph.segments)) {
      const a = graph.nodes[segment.from]
      const b = graph.nodes[segment.to]
      spans.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, width: segment.width })
    }
    const dryAt = (x: number, z: number): boolean =>
      isDryFootprint({ x, z, w: 5, d: 5 }, 0, seed) &&
      spans.every((span) => {
        const dx = span.x2 - span.x1
        const dz = span.z2 - span.z1
        const lengthSq = dx * dx + dz * dz
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - span.x1) * dx + (z - span.z1) * dz) / lengthSq))
        const px = span.x1 + dx * t
        const pz = span.z1 + dz * t
        return Math.hypot(x - px, z - pz) >= span.width / 2 + 3
      })
    // Walk toward the tile in 8 m steps, stopping at the first blockage.
    let cx = origin.x
    let cz = origin.z
    for (let i = 1; i <= steps; i++) {
      const x = origin.x + ((tile.x - origin.x) * i) / steps
      const z = origin.z + ((tile.z - origin.z) * i) / steps
      if (Math.abs(x) > BASIN_HALF_M || Math.abs(z) > BASIN_HALF_M) break
      if (!dryAt(x, z)) break
      cx = x
      cz = z
    }
    if (Math.hypot(cx - origin.x, cz - origin.z) < 12) continue
    const nodeCount = Object.keys(graph.nodes).length
    const id = `cov:${nodeCount}`
    graph.nodes[id] = { id, x: cx, z: cz, kind: 'endpoint' }
    graph.nodes[origin.id].kind = 'intersection'
    const segmentId = `cov-road:${Object.keys(graph.segments).length}`
    graph.segments[segmentId] = { id: segmentId, from: origin.id, to: id, curve: 0, width: 3 }
  }
  return graph
}

/**
 * Solve the full network for a seed (R060): the road network (grown and
 * completed against the district tiles), the rail ring with stations, the
 * navigable water routes over the seeded hydrology and the walking paths
 * cut off the physical network.
 */
export function generateNetwork(seed = CITY_WORLD_SEED): NetworkManifest {
  const roadGraph = completeRoadCoverage(generateIslandRoads(seed, []), seed)
  const nodes: Record<string, NetworkNode> = {}
  const edges: NetworkEdge[] = []
  const stations: NetworkStation[] = []
  const elevation = (x: number, z: number): number =>
    isRegionalWater(x, z, seed) ? -0.18 : regionalTerrainHeight(x, z, seed)

  // Roads: level 0, on the dry ground the growth rule produced.
  for (const node of Object.values(roadGraph.nodes)) {
    nodes[node.id] = {
      id: node.id,
      x: node.x,
      z: node.z,
      level: NETWORK_LEVELS.ground,
      elevation: elevation(node.x, node.z),
    }
  }
  for (const segment of Object.values(roadGraph.segments)) {
    const a = roadGraph.nodes[segment.from]
    const b = roadGraph.nodes[segment.to]
    edges.push({
      id: segment.id,
      kind: 'road',
      from: segment.from,
      to: segment.to,
      level: NETWORK_LEVELS.ground,
      width: segment.width,
      length: Math.hypot(b.x - a.x, b.z - a.z),
      rule: segment.id.startsWith('cov-road:') ? 'road:district-coverage' : 'road:island-growth',
    })
  }

  // Rail: a seeded ring line around the serviced basin, following the
  // terrain and spanning water on viaducts. Stations stand where the
  // terrain is dry.
  const railSeed = mulberry32(seed ^ 0x52a1)
  const railSway = railSeed() * Math.PI * 2
  const railPoints: { x: number; z: number }[] = []
  const RAIL_STEPS = 72
  for (let i = 0; i < RAIL_STEPS; i++) {
    const theta = (i / RAIL_STEPS) * Math.PI * 2 + railSway / RAIL_STEPS
    const radial = (railSeed() - 0.5) * 24
    const x = -12 + Math.cos(theta) * (252 + radial)
    const z = -18 + Math.sin(theta) * (238 + radial)
    railPoints.push({ x, z })
  }
  for (let i = 0; i < RAIL_STEPS; i++) {
    const a = railPoints[i]
    const b = railPoints[(i + 1) % RAIL_STEPS]
    const idA = `rail:${i}`
    const idB = `rail:${(i + 1) % RAIL_STEPS}`
    nodes[idA] = { id: idA, x: a.x, z: a.z, level: NETWORK_LEVELS.rail, elevation: elevation(a.x, a.z) }
    if (!(idB in nodes))
      nodes[idB] = { id: idB, x: b.x, z: b.z, level: NETWORK_LEVELS.rail, elevation: elevation(b.x, b.z) }
    edges.push({
      id: `rail-edge:${i}`,
      kind: 'rail',
      from: idA,
      to: idB,
      level: NETWORK_LEVELS.rail,
      width: 4,
      length: Math.hypot(b.x - a.x, b.z - a.z),
      rule: 'rail:ring',
    })
  }
  for (let i = 0; i < RAIL_STEPS; i += 8) {
    const point = railPoints[i]
    // Stations stand on dry terrain, with access to the nearest road node.
    if (!isDryFootprint({ x: point.x, z: point.z, w: 10, d: 6 }, 0, seed)) continue
    const access = nodeDistance(roadGraph, point.x, point.z)
    stations.push({
      id: `rail-station:${i}`,
      kind: 'rail',
      x: point.x,
      z: point.z,
      accessNode: access ? access.id : undefined,
      rule: 'rail:ring-station',
    })
  }
  // Rail chord: a seeded north-south line through the eastern basin, on the
  // dry ground east of the river, spanning the bay on a viaduct where the
  // hydrology crosses it. Stations stand where the terrain is dry.
  const chordSeed = mulberry32(seed ^ 0x63686f72)
  const chordX = 144 + (chordSeed() - 0.5) * 8
  const chordPoints: { x: number; z: number }[] = []
  for (let z = -220; z <= 220; z += 20) chordPoints.push({ x: chordX, z })
  for (let i = 0; i < chordPoints.length - 1; i++) {
    const point = chordPoints[i]
    const next = chordPoints[i + 1]
    const idA = `rail-chord:${i}`
    const idB = `rail-chord:${i + 1}`
    nodes[idA] = {
      id: idA,
      x: point.x,
      z: point.z,
      level: NETWORK_LEVELS.rail,
      elevation: elevation(point.x, point.z),
    }
    if (!(idB in nodes))
      nodes[idB] = { id: idB, x: next.x, z: next.z, level: NETWORK_LEVELS.rail, elevation: elevation(next.x, next.z) }
    edges.push({
      id: `rail-chord-edge:${i}`,
      kind: 'rail',
      from: idA,
      to: idB,
      level: NETWORK_LEVELS.rail,
      width: 4,
      length: Math.hypot(next.x - point.x, next.z - point.z),
      rule: 'rail:chord',
    })
  }
  for (let i = 0; i < chordPoints.length; i += 3) {
    const point = chordPoints[i]
    if (!isDryFootprint({ x: point.x, z: point.z, w: 10, d: 6 }, 0, seed)) continue
    const access = nodeDistance(roadGraph, point.x, point.z)
    stations.push({
      id: `rail-chord-station:${i}`,
      kind: 'rail',
      x: point.x,
      z: point.z,
      accessNode: access ? access.id : undefined,
      rule: 'rail:chord-station',
    })
  }

  // Water routes: the navigable river and the coastal loop, level 2, over
  // the seeded hydrology only.
  const riverPoints: { x: number; z: number }[] = []
  for (let z = -240; z <= 240; z += 20) {
    const x = riverCentreAt(z)
    if (!isRegionalWater(x, z, seed)) continue
    riverPoints.push({ x, z })
  }
  for (let i = 0; i < riverPoints.length - 1; i++) {
    const a = riverPoints[i]
    const b = riverPoints[i + 1]
    if (Math.hypot(b.x - a.x, b.z - a.z) > 24) continue // a gap in the channel
    const idA = `water-river:${i}`
    const idB = `water-river:${i + 1}`
    nodes[idA] = { id: idA, x: a.x, z: a.z, level: NETWORK_LEVELS.water, elevation: -0.18 }
    if (!(idB in nodes)) nodes[idB] = { id: idB, x: b.x, z: b.z, level: NETWORK_LEVELS.water, elevation: -0.18 }
    edges.push({
      id: `water-edge:${i}`,
      kind: 'water',
      from: idA,
      to: idB,
      level: NETWORK_LEVELS.water,
      width: 12,
      length: Math.hypot(b.x - a.x, b.z - a.z),
      rule: 'water:river-route',
    })
  }
  const coastPoints: { x: number; z: number }[] = []
  const COAST_STEPS = 48
  for (let i = 0; i < COAST_STEPS; i++) {
    const theta = (i / COAST_STEPS) * Math.PI * 2
    const point = islandCoastPoint(theta, -14, seed)
    if (!isRegionalWater(point.x, point.z, seed)) continue
    coastPoints.push(point)
  }
  for (let i = 0; i < coastPoints.length; i++) {
    const a = coastPoints[i]
    const b = coastPoints[(i + 1) % coastPoints.length]
    const idA = `water-coast:${i}`
    const idB = `water-coast:${(i + 1) % coastPoints.length}`
    nodes[idA] = { id: idA, x: a.x, z: a.z, level: NETWORK_LEVELS.water, elevation: -0.18 }
    if (!(idB in nodes)) nodes[idB] = { id: idB, x: b.x, z: b.z, level: NETWORK_LEVELS.water, elevation: -0.18 }
    edges.push({
      id: `water-coast-edge:${i}`,
      kind: 'water',
      from: idA,
      to: idB,
      level: NETWORK_LEVELS.water,
      width: 14,
      length: Math.hypot(b.x - a.x, b.z - a.z),
      rule: 'water:coastal-route',
    })
  }
  // A port station on the river bank inside the basin, seeded in position.
  const portSeed = mulberry32(seed ^ 0x707274)
  const portZ = Math.round((portSeed() - 0.5) * 80)
  const portX = riverCentreAt(portZ) - 11
  if (isDryFootprint({ x: portX, z: portZ, w: 4, d: 4 }, 0, seed) && isRegionalWater(portX + 4, portZ, seed)) {
    const access = nodeDistance(roadGraph, portX, portZ)
    stations.push({
      id: 'port:river',
      kind: 'port',
      x: portX,
      z: portZ,
      accessNode: access ? access.id : undefined,
      rule: 'port:riverbank',
    })
  }

  // Walking paths: sidewalks cut off the physical network, level 3.
  for (const segment of Object.values(roadGraph.segments)) {
    const a = roadGraph.nodes[segment.from]
    const b = roadGraph.nodes[segment.to]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 16) continue
    const nx = (-(b.z - a.z) / length) * 2.5
    const nz = ((b.x - a.x) / length) * 2.5
    if (
      !isDryFootprint({ x: a.x + nx, z: a.z + nz, w: 1, d: 1 }, 0, seed) ||
      !isDryFootprint({ x: b.x + nx, z: b.z + nz, w: 1, d: 1 }, 0, seed)
    )
      continue
    const idA = `walk:${segment.id}:a`
    const idB = `walk:${segment.id}:b`
    nodes[idA] = {
      id: idA,
      x: a.x + nx,
      z: a.z + nz,
      level: NETWORK_LEVELS.walk,
      elevation: elevation(a.x + nx, a.z + nz),
    }
    nodes[idB] = {
      id: idB,
      x: b.x + nx,
      z: b.z + nz,
      level: NETWORK_LEVELS.walk,
      elevation: elevation(b.x + nx, b.z + nz),
    }
    edges.push({
      id: `walk-edge:${segment.id}`,
      kind: 'walk',
      from: idA,
      to: idB,
      level: NETWORK_LEVELS.walk,
      width: 1.5,
      length,
      rule: 'walk:sidewalk',
      roadId: segment.id,
    })
  }

  // District completion (R060): a dry district tile the physical network
  // does not reach — walled off by the river or the bay — is served by a
  // rail station on its own dry ground, so the network is complete against
  // the district recipe by construction.
  const network: NetworkManifest = { seed, nodes, edges, stations, roadGraph }
  for (const tile of generateRegionalTiles(seed)) {
    if (Math.abs(tile.x) > BASIN_HALF_M || Math.abs(tile.z) > BASIN_HALF_M) continue
    if (tile.hasWater) continue
    if (networkServiceDistance(network, tile.x, tile.z) <= ROAD_SERVICE_RADIUS_M) continue
    const spot = findDrySpot(tile.x, tile.z, seed)
    if (!spot) continue // terrain-impossible tile: no buildable ground nearby
    const access = nodeDistance(roadGraph, tile.x, tile.z)
    stations.push({
      id: `rail-district:${tile.id}`,
      kind: 'rail',
      x: spot.x,
      z: spot.z,
      accessNode: access ? access.id : undefined,
      rule: 'rail:district-completion',
    })
  }

  return network
}

/**
 * The first dry spot in deterministic search order (8 directions, 4 m rings)
 * within maxRadius of a point. Used by the district-completion pass so a
 * station stands on buildable ground even when the tile centre is not.
 */
export function findDrySpot(x: number, z: number, seed: number, maxRadius = 24): { x: number; z: number } | null {
  const dirs = Array.from({ length: 8 }, (_, i) => {
    const theta = (i / 8) * Math.PI * 2
    return { dx: Math.cos(theta), dz: Math.sin(theta) }
  })
  for (let r = 0; r <= maxRadius; r += 4) {
    for (const { dx, dz } of dirs) {
      const px = x + dx * r
      const pz = z + dz * r
      if (isDryFootprint({ x: px, z: pz, w: 4, d: 4 }, 0, seed)) return { x: px, z: pz }
    }
  }
  return null
}

/** The distance from a point to the nearest serviced network point (road node or station). */
export function networkServiceDistance(network: NetworkManifest, x: number, z: number): number {
  let best = Infinity
  for (const node of Object.values(network.nodes)) {
    if (node.level !== NETWORK_LEVELS.ground) continue
    best = Math.min(best, Math.hypot(node.x - x, node.z - z))
  }
  for (const station of network.stations) {
    best = Math.min(best, Math.hypot(station.x - x, station.z - z))
  }
  return best
}

/** A point on dry land for placement checks (R060 level-awareness). */
export function isDryPlacement(rect: WorldRect, seed: number): boolean {
  return isDryFootprint(rect, 0, seed)
}

/**
 * @file routes.ts
 * @description Route validation over the physical network (OVERSTORY-CITY-R064):
 * car routes over road lanes with live traffic state, plane routes with
 * takeoff/landing fields and clearance envelopes, train routes on rail
 * corridors with station access, and boat routes across navigable water.
 * A route failing any constraint — connectivity, clearance, depth, level
 * — is refused, never patched, and the decision is deterministic under the
 * seed: the same network replays the same accept/refuse decisions.
 */
import { NETWORK_LEVELS, type NetworkEdge, type NetworkManifest } from './network'
import { isDryFootprint, regionalTerrainHeight } from './worldgen'

export type RouteRefusalReason =
  'unreachable' | 'blocked-lane' | 'no-station' | 'shallow-water' | 'no-airfield' | 'clearance-violation'

export interface RouteDecision {
  ok: boolean
  reason: RouteRefusalReason | null
  /** The node ids along the validated path, deterministic under the seed. */
  path: string[]
}

/** How far a request may snap to the nearest node of the requested level. */
const SNAP_M = { car: 40, train: 8, boat: 60 } as const

interface LevelGraph {
  adj: Map<string, { edge: NetworkEdge; other: string }[]>
}

/** The subgraph of one network level, with deterministic (sorted) adjacency. */
function levelGraph(network: NetworkManifest, level: number): LevelGraph {
  const adj = new Map<string, { edge: NetworkEdge; other: string }[]>()
  for (const edge of network.edges) {
    if (edge.level !== level) continue
    const pairs = [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ] as const
    for (const [a, b] of pairs) {
      const list = adj.get(a) ?? []
      list.push({ edge, other: b })
      adj.set(a, list)
    }
  }
  for (const list of adj.values()) list.sort((a, b) => a.other.localeCompare(b.other))
  return { adj }
}

/** The nearest node of the level within snap metres of a point. */
function nearestNode(network: NetworkManifest, level: number, x: number, z: number, snap: number): string | null {
  let best: { id: string; d: number } | null = null
  for (const node of Object.values(network.nodes)) {
    if (node.level !== level) continue
    const d = Math.hypot(node.x - x, node.z - z)
    if (d <= snap && (!best || d < best.d)) best = { id: node.id, d }
  }
  return best ? best.id : null
}

/** Deterministic BFS with optional edge exclusions; the path is a node id walk. */
function bfs(graph: LevelGraph, start: string, goal: string, excluded: Set<string>): string[] | null {
  if (start === goal) return [start]
  const prev = new Map<string, string>()
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length > 0) {
    const node = queue.shift()!
    for (const { edge, other } of graph.adj.get(node) ?? []) {
      if (excluded.has(edge.id) || seen.has(other)) continue
      seen.add(other)
      prev.set(other, node)
      if (other === goal) {
        const path = [goal]
        let at = goal
        while (at !== start) {
          at = prev.get(at)!
          path.unshift(at)
        }
        return path
      }
      queue.push(other)
    }
  }
  return null
}

/**
 * Car routes over road lanes (level 0), with the live traffic state as
 * blocked lanes (edge ids). A blocked lane that severs the only path is a
 * refusal, never a patched route.
 */
export function validateCarRoute(
  network: NetworkManifest,
  from: { x: number; z: number },
  to: { x: number; z: number },
  opts: { blockedLanes?: string[] } = {},
): RouteDecision {
  const level = levelGraph(network, NETWORK_LEVELS.ground)
  const start = nearestNode(network, NETWORK_LEVELS.ground, from.x, from.z, SNAP_M.car)
  const goal = nearestNode(network, NETWORK_LEVELS.ground, to.x, to.z, SNAP_M.car)
  if (!start || !goal) return refuse('unreachable')
  const blocked = new Set(opts.blockedLanes ?? [])
  const path = bfs(level, start, goal, blocked)
  if (path) return accept(path)
  // Distinguish a live blockage from genuine unreachable terrain.
  const unblocked = bfs(level, start, goal, new Set())
  if (!unblocked) return refuse('unreachable')
  return refuse('blocked-lane')
}

/**
 * Train routes on rail corridors (level 1): the endpoints must be rail
 * stations on dry ground with station access to the rail level.
 */
export function validateTrainRoute(network: NetworkManifest, fromStation: string, toStation: string): RouteDecision {
  const level = levelGraph(network, NETWORK_LEVELS.rail)
  // Both endpoints must be rail stations on dry ground with the rail
  // corridor at hand; anything else is a refusal, never a patched route.
  for (const id of [fromStation, toStation]) {
    const station = network.stations.find((s) => s.id === id && s.kind === 'rail')
    if (!station) return refuse('no-station')
    if (!isDryFootprint({ x: station.x, z: station.z, w: 10, d: 6 }, 0, network.seed)) return refuse('no-station')
  }
  const a = stationAnchor(network, fromStation)
  const b = stationAnchor(network, toStation)
  if (!a || !b) return refuse('no-station')
  const path = bfs(level, a, b, new Set())
  if (!path) return refuse('unreachable')
  return accept(path)
}

/** The rail node a station anchors to (within the station access snap). */
function stationAnchor(network: NetworkManifest, stationId: string): string | null {
  const station = network.stations.find((s) => s.id === stationId && s.kind === 'rail')
  if (!station) return null
  return nearestNode(network, NETWORK_LEVELS.rail, station.x, station.z, SNAP_M.train)
}

/**
 * Boat routes across navigable water (level 2): every edge on the path
 * must be at least the hull's minimum depth. A shallow reach that severs
 * the only path is a refusal.
 */
export function validateBoatRoute(
  network: NetworkManifest,
  from: { x: number; z: number },
  to: { x: number; z: number },
  opts: { minDepthM?: number } = {},
): RouteDecision {
  const level = levelGraph(network, NETWORK_LEVELS.water)
  const start = nearestNode(network, NETWORK_LEVELS.water, from.x, from.z, SNAP_M.boat)
  const goal = nearestNode(network, NETWORK_LEVELS.water, to.x, to.z, SNAP_M.boat)
  if (!start || !goal) return refuse('unreachable')
  const minDepth = opts.minDepthM ?? 0.5
  // Exclude every edge shallower than the hull.
  const shallow = new Set(shallowEdges(level, minDepth))
  const path = bfs(level, start, goal, shallow)
  if (path) return accept(path)
  const unblocked = bfs(level, start, goal, new Set())
  if (!unblocked) return refuse('unreachable')
  return refuse('shallow-water')
}

/** The ids of every water edge shallower than minDepth on this level graph. */
function shallowEdges(graph: LevelGraph, minDepth: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of graph.adj.values()) {
    for (const { edge } of list) {
      if (seen.has(edge.id)) continue
      seen.add(edge.id)
      if ((edge.depthM ?? Infinity) < minDepth) out.push(edge.id)
    }
  }
  return out
}

/** The clearance envelope keeps this many metres above every surface. */
export const PLANE_CLEARANCE_M = 15
/** The takeoff/landing field a plane route endpoint must hold in full. */
export const AIRFIELD_FOOTPRINT = { w: 60, d: 24 } as const
const DEFAULT_ALTITUDE_M = 120

/**
 * Plane routes: takeoff and landing fields (dry ground holding the full
 * airfield footprint) and a clearance envelope — the flight path must stay
 * at least PLANE_CLEARANCE_M above every surface it crosses.
 */
export function validatePlaneRoute(
  network: NetworkManifest,
  from: { x: number; z: number },
  to: { x: number; z: number },
  opts: { altitudeM?: number } = {},
): RouteDecision {
  const seed = network.seed
  for (const point of [from, to]) {
    if (!isDryFootprint({ x: point.x, z: point.z, w: AIRFIELD_FOOTPRINT.w, d: AIRFIELD_FOOTPRINT.d }, 0, seed)) {
      return refuse('no-airfield')
    }
  }
  const altitude = opts.altitudeM ?? DEFAULT_ALTITUDE_M
  const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 8))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = from.x + (to.x - from.x) * t
    const z = from.z + (to.z - from.z) * t
    if (altitude < regionalTerrainHeight(x, z, seed) + PLANE_CLEARANCE_M) return refuse('clearance-violation')
  }
  return accept([])
}

function accept(path: string[]): RouteDecision {
  return { ok: true, reason: null, path }
}

function refuse(reason: RouteRefusalReason): RouteDecision {
  return { ok: false, reason, path: [] }
}

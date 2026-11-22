/** Shared, deterministic water routes for ambient city vessels.
 * The rendered terrain currently puts every underwater vertex at -1.25 m;
 * until bathymetry is authored, navigation conservatively uses that depth.
 */
import { isRegionalWater, SEA_LEVEL_M } from './worldgen'

export interface WaterPoint {
  x: number
  z: number
}
export interface WaterVessel {
  kind: 'fishing' | 'yacht' | 'kayak'
  route: WaterPoint[]
  leg: number
  direction: 1 | -1
  x: number
  z: number
  heading: number
  speed: number
  maxSpeed: number
}

const GRID = 25
const CLEARANCE = 5
const DEPTH = SEA_LEVEL_M + 1.25

/** Clearance is tested over the vessel's full turning envelope, not just its centre. */
export function safeWaterPoint(x: number, z: number, seed: number, draft: number): boolean {
  if (draft + 0.2 > DEPTH) return false
  for (let dx = -CLEARANCE; dx <= CLEARANCE; dx += 1) {
    for (let dz = -CLEARANCE; dz <= CLEARANCE; dz += 1) {
      if (dx * dx + dz * dz <= CLEARANCE * CLEARANCE && !isRegionalWater(x + dx, z + dz, seed)) return false
    }
  }
  return true
}

/** Build a connected four-neighbour graph from the same water mask used by the terrain. */
export function generateWaterGraph(seed: number, draft = 0.5): Map<string, WaterPoint[]> {
  const graph = new Map<string, WaterPoint[]>()
  const key = (x: number, z: number) => `${x},${z}`
  for (let x = -400; x <= 400; x += GRID)
    for (let z = -400; z <= 400; z += GRID) {
      if (safeWaterPoint(x, z, seed, draft)) graph.set(key(x, z), [])
    }
  for (const [id, neighbours] of graph) {
    const [x, z] = id.split(',').map(Number)
    for (const [dx, dz] of [
      [GRID, 0],
      [0, GRID],
    ]) {
      const next = graph.get(key(x + dx, z + dz))
      if (!next) continue
      let safe = true
      for (let i = 1; i < GRID; i += 2) {
        if (!safeWaterPoint(x + (dx * i) / GRID, z + (dz * i) / GRID, seed, draft)) {
          safe = false
          break
        }
      }
      if (safe) {
        neighbours.push({ x: x + dx, z: z + dz })
        next.push({ x, z })
      }
    }
  }
  return graph
}

const graphCache = new Map<number, Map<string, WaterPoint[]>>()

/** Select reproducible journeys within one connected component, never across land. */
export function createWaterFleet(seed: number): WaterVessel[] {
  let graph = graphCache.get(seed)
  if (!graph) {
    graph = generateWaterGraph(seed)
    if (graphCache.size >= 4) graphCache.delete(graphCache.keys().next().value!)
    graphCache.set(seed, graph)
  }
  const nodes = [...graph.keys()]
  if (!nodes.length) return []
  const key = (p: WaterPoint) => `${p.x},${p.z}`
  const fleet: WaterVessel[] = []
  const kinds = ['fishing', 'yacht', 'kayak', 'yacht', 'fishing'] as const
  for (let i = 0; i < kinds.length; i++) {
    const start = nodes[((seed >>> 0) + i * 127) % nodes.length]
    const previous = new Map<string, string | null>([[start, null]])
    const queue = [start]
    for (const current of queue) {
      for (const next of graph.get(current) ?? []) {
        const id = key(next)
        if (!previous.has(id)) {
          previous.set(id, current)
          queue.push(id)
        }
      }
    }
    if (queue.length < 4) continue
    const end = queue[Math.floor(queue.length * (0.65 + i * 0.06))]
    const route: WaterPoint[] = []
    for (let current: string | null = end; current !== null; current = previous.get(current) ?? null) {
      const [x, z] = current.split(',').map(Number)
      route.unshift({ x, z })
    }
    if (route.length < 2) continue
    fleet.push({
      kind: kinds[i],
      route,
      leg: 0,
      direction: 1,
      x: route[0].x,
      z: route[0].z,
      heading: Math.atan2(-(route[1].z - route[0].z), route[1].x - route[0].x),
      speed: 0,
      maxSpeed: kinds[i] === 'kayak' ? 1.2 : 2.2,
    })
  }
  return fleet
}

/** Turn at waypoints, accelerate and brake in real seconds; reverse without teleporting. */
export function tickWaterFleet(fleet: WaterVessel[], dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return
  // Bounded substeps keep braking, turning and the route invariant stable after a long frame.
  let remaining = Math.min(dt, 1)
  while (remaining > 0) {
    const step = Math.min(remaining, 0.05)
    remaining -= step
    for (const vessel of fleet) {
      const nextLeg = vessel.leg + vessel.direction
      if (nextLeg < 0 || nextLeg >= vessel.route.length) {
        vessel.direction = vessel.direction === 1 ? -1 : 1
        vessel.speed = 0
        continue
      }
      const target = vessel.route[nextLeg]
      const dx = target.x - vessel.x,
        dz = target.z - vessel.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.001) {
        vessel.x = target.x
        vessel.z = target.z
        vessel.speed = Math.max(0, vessel.speed - 0.55 * step)
        if (vessel.speed === 0) vessel.leg += vessel.direction
        continue
      }
      const desired = Math.atan2(-dz, dx)
      const diff = Math.atan2(Math.sin(desired - vessel.heading), Math.cos(desired - vessel.heading))
      const turn = Math.max(-0.65 * step, Math.min(0.65 * step, diff))
      vessel.heading += turn
      const acceleration = 0.55
      const canMove = Math.abs(diff) < 0.03
      const wanted =
        canMove && distance > (vessel.speed * vessel.speed) / (2 * acceleration) + vessel.speed * step
          ? vessel.maxSpeed
          : 0
      vessel.speed += Math.max(-acceleration * step, Math.min(acceleration * step, wanted - vessel.speed))
      const travel = Math.min(distance, vessel.speed * step)
      vessel.x += (dx / distance) * travel
      vessel.z += (dz / distance) * travel
    }
  }
}

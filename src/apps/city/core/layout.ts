// City geometry shared by the 3D and 2D renderers and the simulation.
// Units are metres. +Z is "south" (the waterfront), +X is "east".
//
// The connector district grows with the fleet: six columns × thirteen rows
// (78 plots) west of the main grid hold the full registered fleet catalog
// (74 servers as of the 2026-11-15 capture) with room to spare. Plots are
// grouped by business domain (CONNECTOR_DISTRICT) so the district's
// geography carries meaning (OVERSTORY-CITY-R002).
import { CONNECTOR_DISTRICT } from './ecosystem'
import { isRegionalWater } from './worldgen'

export const X_ROADS = [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30]
export const Z_ROADS = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70]
export const ROAD_W = 2.6
export const WATER_Z = 74 // shoreline
/** Regional world extent; the serviced city occupies the central basin. */
export const GROUND_SIZE = 900

export interface Vec2 {
  x: number
  z: number
}

// Nearest road projection: a building door always lands on a road.
function project(x: number, z: number): Vec2 {
  const dx = Math.min(...X_ROADS.map((r) => Math.abs(x - r)))
  const dz = Math.min(...Z_ROADS.map((r) => Math.abs(z - r)))
  if (dx <= dz) {
    const rx = X_ROADS.reduce((a, c) => (Math.abs(c - x) < Math.abs(a - x) ? c : a))
    return { x: rx, z }
  }
  const rz = Z_ROADS.reduce((a, c) => (Math.abs(c - z) < Math.abs(a - z) ? c : a))
  return { x, z: rz }
}

export function buildingDoor(id: string): Vec2 | null {
  if (!(id in BUILDING_POS)) return null // unknown id: caller must supply its own door
  const b = BUILDING_POS[id]
  return project(b.x, b.z)
}

export function plotDoor(plot: Vec2): Vec2 {
  return project(plot.x, plot.z)
}

// Core landmark footprints (positions come from the layout; the ecosystem
// data carries names, roles and rooms).
export const BUILDING_POS: Record<string, Vec2 & { w: number; d: number }> = {
  arbora: { x: 0, z: 0, w: 14, d: 14 },
  medulla: { x: -15, z: -15, w: 9, d: 9 },
  meristem: { x: 15, z: -15, w: 10, d: 8 },
  overstory: { x: 15, z: 15, w: 7, d: 7 },
  tuig: { x: -15, z: 15, w: 5, d: 5 },
  axil: { x: 15, z: 5, w: 6, d: 6 },
  scion: { x: -5, z: 15, w: 8, d: 6 },
}

// Connector district: six columns × thirteen rows west of the main grid
// (78 plots — the full registered fleet fits; the westmost column's doors
// project onto the x=-80 road).
export const PLOTS: Vec2[] = (() => {
  const out: Vec2[] = []
  const cols = [-25, -35, -45, -55, -65, -75]
  for (let z = -55; z <= 65; z += 10) for (const x of cols) out.push({ x, z })
  return out
})()
export const PLOT_W = 7

/**
 * District plot ordering (R002 amendment). Plots are reserved in business-
 * domain order — the domains declared in `CONNECTOR_DISTRICT` (ecosystem.ts)
 * — so each domain is a contiguous block of the district, never a
 * catalog-order scatter: the sim's `initSim` places connectors through
 * `connectorsByDomain`, which orders by these bands. The core landmarks
 * (BUILDING_POS above) sit at the map's centre, east of the district.
 */
export const DISTRICT_DOMAINS: readonly string[] = CONNECTOR_DISTRICT.map((d) => d.id)

// Residential quarter (east) — agents and humans sleep here at night.
// Two columns × nine rows: a home for every character in the roster.
export const HOUSES: Vec2[] = (() => {
  const out: Vec2[] = []
  for (let z = -45; z <= 35; z += 10) out.push({ x: 24, z }, { x: 29, z })
  return out
})()

export interface Park {
  x: number
  z: number
  trees: number
}

export const PARKS: Park[] = [
  { x: 15, z: -5, trees: 5 },
  // Kept inside the block; the former z=20 position put this park directly
  // on an arterial intersection and let trees occupy the carriageway.
  { x: 5, z: 25, trees: 6 },
  { x: -5, z: -45, trees: 5 },
  { x: -45, z: 40, trees: 6 },
  { x: -65, z: -40, trees: 5 },
]

// Pier at the waterfront for the Scion dock.
export const PIER = { x: -5, z0: WATER_Z, z1: WATER_Z + 7, w: 2.4 }
export const SHIPS = [
  { x: -10, z: WATER_Z + 3.5 },
  { x: -0.5, z: WATER_Z + 4.5 },
]

// ---- Path graph -----------------------------------------------------------
// Nodes are road intersections; edges run along the roads.
const nodeKey = (xi: number, zi: number) => `${xi}:${zi}`
const NODES = new Map<string, { xi: number; zi: number; x: number; z: number }>()
for (let xi = 0; xi < X_ROADS.length; xi++)
  for (let zi = 0; zi < Z_ROADS.length; zi++) NODES.set(nodeKey(xi, zi), { xi, zi, x: X_ROADS[xi], z: Z_ROADS[zi] })

const ADJ = new Map<string, string[]>()
for (const [k, n] of NODES) {
  const list: string[] = []
  if (n.xi > 0) list.push(nodeKey(n.xi - 1, n.zi))
  if (n.xi < X_ROADS.length - 1) list.push(nodeKey(n.xi + 1, n.zi))
  if (n.zi > 0) list.push(nodeKey(n.xi, n.zi - 1))
  if (n.zi < Z_ROADS.length - 1) list.push(nodeKey(n.xi, n.zi + 1))
  ADJ.set(k, list)
}

export function nearestNode(x: number, z: number) {
  let best: { xi: number; zi: number; x: number; z: number } | null = null
  let bd = Infinity
  for (const [, n] of NODES) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2
    if (d < bd) {
      bd = d
      best = n
    }
  }
  return best
}

// BFS over the intersection graph. Returns an array of [x, z] waypoints.
export function findPath(fromX: number, fromZ: number, toX: number, toZ: number): number[][] {
  const start = nearestNode(fromX, fromZ)
  const end = nearestNode(toX, toZ)
  if (!start || !end) return [[toX, toZ]]
  const key = (n: { xi: number; zi: number }) => nodeKey(n.xi, n.zi)
  const prev = new Map<string, string | null>([[key(start), null]])
  const queue = [start]
  while (queue.length) {
    const n = queue.shift()
    if (!n) break
    if (n === end) break
    for (const nk of ADJ.get(key(n)) ?? []) {
      if (!prev.has(nk)) {
        prev.set(nk, key(n))
        const nn = NODES.get(nk)
        if (nn) queue.push(nn)
      }
    }
  }
  if (!prev.has(key(end))) return [[toX, toZ]] // fallback: straight line
  const chain = []
  for (let k: string | null = key(end); k; k = prev.get(k) ?? null) chain.unshift(NODES.get(k))
  const out: number[][] = []
  for (const n of chain) {
    if (!n) continue
    const last = out.length ? out[out.length - 1] : null
    if (!last || Math.hypot(last[0] - n.x, last[1] - n.z) > 0.5) out.push([n.x, n.z])
  }
  return out
}

// Walkable check: characters never enter water. This shares the procedural
// island/harbour mask used by terrain and placement, so the playable boundary
// follows the visible coastline rather than an invisible z-axis cutoff.
export function inWater(x: number, z: number): boolean {
  const onPier = Math.abs(x - PIER.x) < PIER.w / 2 && z >= PIER.z0 && z <= PIER.z1
  return isRegionalWater(x, z) && !onPier
}

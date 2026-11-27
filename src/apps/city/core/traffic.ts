/**
 * @file traffic.ts
 * @description Activity becomes traffic (OVERSTORY-CITY-R037). Runs, tool
 * calls and tasks are vehicles and pedestrians on the derived roads, so
 * density shows throughput. Health shows as signals on the building:
 * lit windows and smoke for normal operation, fire and siren for failure,
 * scaffolding while a deploy or migration runs. Each moving element carries
 * the provenance of the event that spawned it; simulated traffic is never
 * shown as live (R010).
 */
import type { DerivedCity } from './growth'
import type { CityEvent, EventProvenance } from './events'

/** The most moving elements one road carries at once. */
export const MAX_PER_ROAD = 8

export type Signal = 'windows' | 'smoke' | 'fire' | 'siren' | 'scaffold'

export interface Mover {
  id: string
  roadId: string
  kind: 'vehicle' | 'pedestrian'
  provenance: EventProvenance
}

export interface Traffic {
  movers: Mover[]
  signals: Map<string, Signal[]>
  /** Movers dropped by the per-road bound. */
  dropped: number
}

/**
 * Generate vehicles based on economic state (R104).
 * Returns vehicles with type info that get assigned to routes.
 */
export function vehiclesFromEconomy(): {
  id: string
  type: 'commuter' | 'freight' | 'construction'
  x: number
  z: number
}[] {
  const vehicles: {
    id: string
    type: 'commuter' | 'freight' | 'construction'
    x: number
    z: number
  }[] = []

  // Lazy import to avoid circular dependency (economy → sim → traffic).
  const Economy = require('./economy') as typeof import('./economy')
  const { world } = require('./sim') as typeof import('./sim')

  // Read economy state
  const districts = Economy.getDistricts()
  let commuterCount = 0
  let freightCount = 0
  let constructionCount = 0

  for (const d of districts) {
    // Commuters proportional to commercial/industrial employment
    commuterCount += Math.floor(d.population * 0.02)
    // Freight proportional to production
    freightCount += Math.floor(d.production * 0.1)
  }

  // Construction vehicles from active construction
  constructionCount = Economy.constructionStates.length

  // Generate vehicles at district centers
  let id = 0
  for (let i = 0; i < commuterCount; i++) {
    // Place at random commercial building
    const buildings = Object.values(world.buildings)
    if (buildings.length > 0) {
      const b = buildings[Math.floor(Math.random() * buildings.length)]
      if (b.kind.includes('store') || b.kind.includes('restaurant')) {
        vehicles.push({ id: `commuter-${id++}`, type: 'commuter', x: b.x, z: b.z })
      }
    }
  }
  for (let i = 0; i < freightCount; i++) {
    const buildings = Object.values(world.buildings)
    if (buildings.length > 0) {
      const b = buildings[Math.floor(Math.random() * buildings.length)]
      if (b.kind.includes('factory') || b.kind.includes('warehouse')) {
        vehicles.push({ id: `freight-${id++}`, type: 'freight', x: b.x, z: b.z })
      }
    }
  }
  for (let i = 0; i < constructionCount; i++) {
    const plots = world.plots.filter((p) => p.construction !== null)
    if (plots.length > 0) {
      const p = plots[Math.floor(Math.random() * plots.length)]
      vehicles.push({ id: `construction-${i}`, type: 'construction', x: p.x, z: p.z })
    }
  }

  return vehicles
}

/** Track vehicles on each road edge for congestion calculation (R105). */
export interface RoadEdgeCongestion {
  roadId: string
  vehicles: number
  capacity: number
  congestion: number
}

export let edgeCongestion: RoadEdgeCongestion[] = []

/**
 * Compute congestion from vehicle counts per road edge (R105).
 * Uses the traffic simulation's positions to distribute vehicles
 * across edges, then computes a congestion ratio per edge.
 */
export function computeEdgeCongestion(_graph: DerivedCity | { roads: { id: string }[] }): void {
  // Access the traffic positions through a dynamic lookup to avoid circular deps.
  const { world } = require('./sim') as typeof import('./sim')
  const positions = (world as { traffic?: { positions: { roadId?: string }[] } }).traffic?.positions ?? []

  // Group vehicles by road edge
  const perEdge = new Map<string, number>()
  for (const v of positions) {
    const roadId = (v as { roadId?: string }).roadId
    if (roadId) {
      perEdge.set(roadId, (perEdge.get(roadId) ?? 0) + 1)
    }
  }

  edgeCongestion = []
  for (const [roadId, count] of perEdge) {
    const capacity = 10 // lanes * throughput
    edgeCongestion.push({
      roadId,
      vehicles: count,
      capacity,
      congestion: Math.min(1, count / capacity),
    })
  }
}

const MOVING: Readonly<Record<string, Mover['kind'] | undefined>> = {
  'tool.call': 'vehicle',
  'tool.result': 'vehicle',
  'task.assigned': 'pedestrian',
  'character.traveling': 'pedestrian',
}

const FAILURES = new Set(['task.failed', 'asset.failed'])
const DEPLOYS = new Set(['construction.progress'])
const NORMAL = new Set(['tool.call', 'task.assigned', 'task.done'])

function addSignal(map: Map<string, Signal[]>, id: string, s: Signal): void {
  const list = map.get(id) ?? []
  if (!list.includes(s)) list.push(s)
  map.set(id, list)
}

/** Derive the traffic and the health signals from the recent events over the derived roads. */
export function trafficFrom(city: DerivedCity, events: CityEvent[]): Traffic {
  const byBuilding = new Map<string, string[]>()
  for (const r of city.roads) {
    for (const end of [r.from, r.to]) {
      const list = byBuilding.get(end) ?? []
      list.push(r.id)
      byBuilding.set(end, list)
    }
  }
  const perRoad = new Map<string, number>()
  const movers: Mover[] = []
  const signals = new Map<string, Signal[]>()
  let dropped = 0
  events.forEach((e, i) => {
    const b = e.building
    if (!b) return
    if (FAILURES.has(e.type)) {
      addSignal(signals, b, 'fire')
      addSignal(signals, b, 'siren')
    } else if (DEPLOYS.has(e.type)) addSignal(signals, b, 'scaffold')
    else if (NORMAL.has(e.type)) {
      addSignal(signals, b, 'windows')
      addSignal(signals, b, 'smoke')
    }
    const kind = MOVING[e.type]
    const roads = byBuilding.get(b)
    if (!kind || !roads?.length) return
    const road = roads[i % roads.length]
    const n = perRoad.get(road) ?? 0
    if (n >= MAX_PER_ROAD) {
      dropped++
      return
    }
    perRoad.set(road, n + 1)
    movers.push({ id: `${e.id ?? e.type}-${i}`, roadId: road, kind, provenance: e.provenance })
  })
  return { movers, signals, dropped }
}

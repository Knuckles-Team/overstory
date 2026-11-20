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

/** The event types that move along roads and what moves. */
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

/**
 * @file growth.ts
 * @description Deterministic seeded growth (OVERSTORY-CITY-R039, constitution
 * R-G3). The city is derived from graph facts: zoning by domain, road
 * attachment by edge, height by weight and degree, districts expanding
 * outward along their edges. The same facts and the same seed give the same
 * city. All randomness is the one seeded generator; the module never calls
 * `Math.random` and never reads the clock.
 */
import { archetypeFor, type Archetype } from './mapping'
import { roadFor, type RoadClass } from './roadClass'
import { hallFor, type Hall } from './hall'
import { mulberry32 } from './prng'
import type { GraphEdge, GraphFacts, GraphNode } from './graphFacts'

/** The declared growth rules (data, not code). */
export const GROWTH_RULES = {
  /** Grid pitch in metres between cell centres. */
  cellPitch: 10,
  /** Spacing in cells between district hubs on the district ring. */
  districtSpacing: 8,
  /** Floors = 1 + round(sqrt(degree + weight)), capped. */
  maxFloors: 12,
  /** Chunk edge in cells: the unit of the streamed neighbourhood (R041). */
  chunkCells: 8,
  /** How far, in cells, a node may be pushed from its attach point before growth gives up. */
  maxProbeRadius: 24,
} as const

export interface Cell {
  x: number
  z: number
}

export interface DerivedBuilding {
  id: string
  cls: string
  archetype: Archetype
  district: string
  cell: Cell
  floors: number
  /** The node that placed this one: its attach target (a hub, or an earlier node). */
  attach: string
}

export interface DerivedRoad {
  id: string
  from: string
  to: string
  cls: RoadClass
  lanes: number
  /** True when the road is a local access lane added so the network stays connected. */
  access: boolean
}

export interface DerivedCity {
  seed: number
  provenance: 'simulated' | 'live'
  districts: { id: string; hub: Cell; domain: string }[]
  buildings: DerivedBuilding[]
  roads: DerivedRoad[]
  hall: Hall
  hallCell: Cell
}

export interface GrowOptions {
  /** Nodes fixed to a cell (pinned edits, R040): never placed elsewhere. */
  reserved?: ReadonlyMap<string, Cell>
  /** Cells occupied by non-derived elements (decor, pinned roads): growth avoids them. */
  blocked?: ReadonlySet<string>
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.z}`
}

/** The cell at ring-order index `i` of an outward square spiral from the origin. */
export function spiralCell(i: number): Cell {
  if (i === 0) return { x: 0, z: 0 }
  const ring = Math.ceil((Math.sqrt(i + 1) - 1) / 2)
  const side = ring * 2
  const start = (2 * ring - 1) ** 2
  const off = i - start
  const seg = Math.floor(off / side)
  const t = off % side
  switch (seg) {
    case 0:
      return { x: ring, z: -ring + 1 + t }
    case 1:
      return { x: ring - 1 - t, z: ring }
    case 2:
      return { x: -ring, z: ring - 1 - t }
    default:
      return { x: -ring + 1 + t, z: -ring }
  }
}

function degrees(edges: GraphEdge[]): Map<string, number> {
  const d = new Map<string, number>()
  for (const e of edges) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1)
    d.set(e.to, (d.get(e.to) ?? 0) + 1)
  }
  return d
}

/** Height in floors by node weight and degree. */
export function floorsFor(node: GraphNode, degree: number): number {
  return Math.min(GROWTH_RULES.maxFloors, 1 + Math.round(Math.sqrt(degree + node.weight)))
}

/** Derive the city. Pure: the same inputs always give the same output. */
export function deriveCity(facts: GraphFacts, seed: number, opts: GrowOptions = {}): DerivedCity {
  const rng = mulberry32(seed)
  const reserved = opts.reserved ?? new Map<string, Cell>()
  const taken = new Set<string>(opts.blocked ?? [])
  for (const c of reserved.values()) taken.add(cellKey(c))
  const nodes = [...facts.nodes].sort((a, b) => a.seq - b.seq)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const deg = degrees(facts.edges)
  const placed = new Map<string, Cell>()

  // The Hall of Records sits at the centre: it is the first thing placed.
  const hall = hallFor(facts.records)
  const hallCell: Cell = { x: 0, z: 0 }
  taken.add(cellKey(hallCell))

  // One hub per domain, on the district ring in first-appearance order.
  const districts: DerivedCity['districts'] = []
  const hubs = new Map<string, Cell>()
  for (const n of nodes) {
    if (hubs.has(n.domain)) continue
    const idx = districts.length + 1
    const s = spiralCell(idx)
    const hub = { x: s.x * GROWTH_RULES.districtSpacing, z: s.z * GROWTH_RULES.districtSpacing }
    hubs.set(n.domain, hub)
    taken.add(cellKey(hub))
    districts.push({ id: `district-${n.domain}`, hub, domain: n.domain })
  }

  function freeNear(origin: Cell): Cell | null {
    // A seeded start offset keeps neighbours from always stacking on one side.
    const start = Math.floor(rng() * 8)
    for (let i = start; i < start + (2 * GROWTH_RULES.maxProbeRadius + 1) ** 2; i++) {
      const s = spiralCell(i)
      const c = { x: origin.x + s.x, z: origin.z + s.z }
      if (!taken.has(cellKey(c))) return c
    }
    return null
  }

  const buildings: DerivedBuilding[] = []
  const roads: DerivedRoad[] = []
  const attachOf = new Map<string, string>()

  for (const n of nodes) {
    const arch = archetypeFor(n.cls)
    // Placement anchor: an already-placed graph neighbour (earliest edge), else the parent, else the domain hub.
    let anchorId: string | undefined
    for (const e of facts.edges) {
      const other = e.from === n.id ? e.to : e.to === n.id ? e.from : undefined
      if (other && placed.has(other)) {
        anchorId = other
        break
      }
    }
    if (!anchorId && n.parent && placed.has(n.parent)) anchorId = n.parent
    const hub = hubs.get(n.domain)!
    const anchor = anchorId ? placed.get(anchorId)! : hub
    let cell = reserved.get(n.id) ?? null
    cell ??= freeNear(anchor)
    if (!cell) continue
    taken.add(cellKey(cell))
    placed.set(n.id, cell)
    attachOf.set(n.id, anchorId ?? `district-${n.domain}`)
    buildings.push({
      id: n.id,
      cls: n.cls,
      archetype: arch,
      district: `district-${n.domain}`,
      cell,
      floors: floorsFor(n, deg.get(n.id) ?? 0),
      attach: anchorId ?? `district-${n.domain}`,
    })
  }

  // Roads: one per graph edge between placed nodes, classified by the table (R036).
  for (const e of facts.edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b || !placed.has(a.id) || !placed.has(b.id)) continue
    const r = roadFor({
      kind: e.kind,
      weight: e.weight,
      fromDomain: a.domain,
      toDomain: b.domain,
      fromClass: a.cls,
      toClass: b.cls,
    })
    roads.push({ id: `road-${e.id}`, from: a.id, to: b.id, cls: r.cls, lanes: r.lanes, access: false })
  }
  // Access lanes: every building reaches its attach target, and the hubs chain to the hall, so the network is connected.
  for (const b of buildings) {
    if (b.attach.startsWith('district-')) {
      roads.push({ id: `access-${b.id}`, from: b.id, to: b.attach, cls: 'lane', lanes: 1, access: true })
    } else if (!roads.some((r) => (r.from === b.id && r.to === b.attach) || (r.to === b.id && r.from === b.attach))) {
      roads.push({ id: `access-${b.id}`, from: b.id, to: b.attach, cls: 'lane', lanes: 1, access: true })
    }
  }
  let prev = 'hall'
  for (const d of districts) {
    roads.push({ id: `trunk-${d.id}`, from: prev, to: d.id, cls: 'highway', lanes: 3, access: true })
    prev = d.id
  }

  return { seed, provenance: facts.provenance, districts, buildings, roads, hall, hallCell }
}

/** Chunk key for a cell: the unit of the streamed neighbourhood read (R041). */
export function chunkOf(c: Cell): string {
  const k = GROWTH_RULES.chunkCells
  return `${Math.floor(c.x / k)},${Math.floor(c.z / k)}`
}

/** Group the derived buildings into streamed chunks. */
export function chunksOf(city: DerivedCity): Map<string, DerivedBuilding[]> {
  const out = new Map<string, DerivedBuilding[]>()
  for (const b of city.buildings) {
    const k = chunkOf(b.cell)
    const list = out.get(k) ?? []
    list.push(b)
    out.set(k, list)
  }
  return out
}

/** True when the road network is connected (every building, hub and the hall reach each other). */
export function roadsConnected(city: DerivedCity): boolean {
  const ids = new Set<string>(['hall', ...city.districts.map((d) => d.id), ...city.buildings.map((b) => b.id)])
  const parent = new Map<string, string>([...ids].map((i) => [i, i]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  for (const r of city.roads) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue
    parent.set(find(r.from), find(r.to))
  }
  const roots = new Set([...ids].map(find))
  return roots.size === 1
}

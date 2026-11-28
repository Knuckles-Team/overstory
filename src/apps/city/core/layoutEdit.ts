/**
 * @file layoutEdit.ts
 * @description The layout overrides an operator persists (OVERSTORY-CITY-R032):
 * one override document — building moves and rotations, drawn or removed
 * road segments, district styles — is the delta over the derived layout.
 * The derived layout stays the default: applying an empty document restores
 * the derived placement. Validation (no plot overlap, the road graph stays
 * connected, quarter-turn rotations, known districts) is pure over the world
 * state and the live road graph, so the bar is testable without a renderer;
 * storage is an authorised write through the city gateway (R021's served
 * layout operation), never browser-local state.
 */
// spec: OVERSTORY-CITY-R032, OVERSTORY-CITY-R021, OVERSTORY-DESIGN-R012.6
import {
  deriveRoadGraph,
  validateRoadEdit,
  type RoadEdit,
  type RoadGraph,
  type RoadSegment,
} from '@/lib/scene3d/roads'
import type { DistrictArchetype } from '@/lib/scene3d/generators'
import { DISTRICT_DOMAINS, ROAD_W, X_ROADS, Z_ROADS, plotDoor } from './layout'
import type { world as SimWorld } from './sim'
import { CITY_WORLD_SEED, generateIslandRoads, isDryFootprint } from './worldgen'
import { isCitySandbox } from '@/lib/city-sandbox'

/** The quarter-turn rotations the layout edit accepts (R032; mirrors schemas.ts). */
const QUARTER_TURNS = [0, 90, 180, 270] as const

export type World = typeof SimWorld

function dryBuildingSite(
  building: { w: number; d: number },
  site: { x: number; z: number },
  rotation: number,
): boolean {
  const door = plotDoor(site)
  const dx = door.x - site.x
  const dz = door.z - site.z
  return (
    isDryFootprint({ ...site, w: building.w, d: building.d }, (rotation * Math.PI) / 180) &&
    isDryFootprint({
      x: site.x + dx / 2,
      z: site.z + dz / 2,
      w: Math.max(0.8, Math.abs(dx)),
      d: Math.max(0.8, Math.abs(dz)),
    })
  )
}

/** The only override document version the city reads or writes. */
export const LAYOUT_VERSION = 1 as const

/** Rotations snap to quarter turns (the door re-projects from the plot). */
export const ROTATIONS = [0, 90, 180, 270] as const
export type Rotation = (typeof ROTATIONS)[number]

/** The district archetypes an operator can set (the generator's vocabulary). */
export const ARCHETYPES: readonly DistrictArchetype[] = [
  'gateway',
  'datahall',
  'workshop',
  'storehouse',
  'studio',
  'docks',
]

/** Minimum clear pedestrian verge between a building wall and a carriageway. */
const BUILDING_ROAD_SETBACK_M = 0.75

/** True when a segment crosses an axis-aligned, already-expanded footprint. */
function segmentHitsAabb(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  let enter = 0
  let exit = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > exit) return false
      if (t > enter) enter = t
    } else {
      if (t < enter) return false
      if (t < exit) exit = t
    }
    return true
  }
  return (
    clip(-(x1 - x0), x0 - minX) &&
    clip(x1 - x0, maxX - x0) &&
    clip(-(z1 - z0), z0 - minZ) &&
    clip(z1 - z0, maxZ - z0) &&
    enter <= exit
  )
}

/**
 * Static collision gate for an operator-drawn road. Its corridor is expanded
 * by carriageway half-width and sidewalk setback, then tested against every
 * building's oriented (quarter-turn) footprint. This belongs in generation /
 * edit validation, never the render loop, so invalid geometry never reaches
 * the GPU and cannot cause a clipped city block.
 */
function roadHitsBuilding(segment: RoadSegment, graph: RoadGraph, world: World): boolean {
  if (!(segment.from in graph.nodes) || !(segment.to in graph.nodes)) return false
  const from = graph.nodes[segment.from]
  const to = graph.nodes[segment.to]
  const pad = segment.width / 2 + BUILDING_ROAD_SETBACK_M
  return Object.values(world.buildings).some((building) => {
    const swapped = building.rot % 180 !== 0
    const halfX = (swapped ? building.d : building.w) / 2 + pad
    const halfZ = (swapped ? building.w : building.d) / 2 + pad
    return segmentHitsAabb(
      from.x,
      from.z,
      to.x,
      to.z,
      building.x - halfX,
      building.x + halfX,
      building.z - halfZ,
      building.z + halfZ,
    )
  })
}

/** One building override: the plot it sits on and its quarter-turn rotation. */
export interface BuildingMove {
  buildingId: string
  plot: number
  rotation: Rotation
}

/** One road override: a drawn segment (endpoints) or a removed one. */
export interface RoadOverride {
  kind: 'add' | 'remove'
  segmentId: string
  from?: string
  to?: string
}

/** One district style override: the domain's archetype. */
export interface DistrictStyle {
  domain: string
  archetype: DistrictArchetype
}

/**
 * The stored layout override document (R032): final state, not deltas —
 * every viewer applies the same document to the same derived placement and
 * gets the same city.
 */
export interface LayoutOverride {
  version: typeof LAYOUT_VERSION
  moves: BuildingMove[]
  roads: RoadOverride[]
  styles: DistrictStyle[]
  /**
   * Medulla KV stores styles as a record (domain → archetype),
   * which is the effective world state after applying DistrictStyle[].
   * Read-only for the layout doc; the array form is the edit form.
   */
  stylesMap?: Record<string, string>
  /** Monotonically increasing revision number (Medulla-backed, R021). */
  revision?: number
  /** Arbitrary metadata (Medulla KV store uses this for world-level data). */
  buildings?: { id: string; x: number; z: number; rot: number; plot: number; door?: { x: number; z: number } }[]
  seed?: string
  captured_at?: string
  roads_extended?: { id: string; from: string; to: string; x1?: number; z1?: number; x2?: number; z2?: number }[]
}

export function emptyLayoutOverride(): LayoutOverride {
  return { version: LAYOUT_VERSION, moves: [], roads: [], styles: [] }
}

/** One edit the operator makes in the edit mode (R032). */
export type LayoutEdit =
  | { kind: 'move-building'; buildingId: string; plot: number; rotation?: Rotation }
  | { kind: 'rotate-building'; buildingId: string; rotation: Rotation }
  | { kind: 'add-road'; from: string; to: string }
  | { kind: 'remove-road'; segmentId: string }
  | { kind: 'district-style'; domain: string; archetype: DistrictArchetype }
  | { kind: 'reset' }

export interface EditVerdict {
  ok: boolean
  /** The operator-facing refusal reason (see {@link REFUSAL_TEXT}). */
  reason?: string
}

/** The stable id of a drawn segment: deterministic in its endpoints. */
export function roadSegmentId(from: string, to: string): string {
  return `a-${[from, to].sort().join('--')}`
}

/**
 * Validate one edit against the current world and the live road graph
 * (R032): the target plot must exist and be free (a plot that carries
 * another building, a reservation or a construction site is taken), the
 * road edit must keep the graph connected and overlap-free (the shared
 * validator, OVERSTORY-DESIGN-R012.6), and the district style must name a
 * known domain and archetype. A refused edit is never applied.
 */
export function validateEdit(edit: LayoutEdit, world: World, graph: RoadGraph): EditVerdict {
  switch (edit.kind) {
    case 'move-building': {
      if (!(edit.buildingId in world.buildings)) return { ok: false, reason: 'not-movable' }
      const b = world.buildings[edit.buildingId]
      if (b.category !== 'connector') return { ok: false, reason: 'not-movable' }
      if (edit.plot < 0 || edit.plot >= world.plots.length) return { ok: false, reason: 'unknown-plot' }
      const plot = world.plots[edit.plot]
      if (plot.buildingId && plot.buildingId !== edit.buildingId) return { ok: false, reason: 'plot-occupied' }
      if (plot.reservedId) return { ok: false, reason: 'plot-reserved' }
      if (plot.construction) return { ok: false, reason: 'plot-under-construction' }
      if (edit.rotation !== undefined && !(QUARTER_TURNS as readonly number[]).includes(edit.rotation))
        return { ok: false, reason: 'invalid-rotation' }
      if (!dryBuildingSite(b, plot, edit.rotation ?? b.rot)) return { ok: false, reason: 'building-hits-water' }
      return { ok: true }
    }
    case 'rotate-building': {
      if (!(edit.buildingId in world.buildings)) return { ok: false, reason: 'not-movable' }
      const b = world.buildings[edit.buildingId]
      if (b.category !== 'connector') return { ok: false, reason: 'not-movable' }
      if (!(QUARTER_TURNS as readonly number[]).includes(edit.rotation))
        return { ok: false, reason: 'invalid-rotation' }
      if (!dryBuildingSite(b, b, edit.rotation)) return { ok: false, reason: 'building-hits-water' }
      return { ok: true }
    }
    case 'add-road': {
      const segment: RoadSegment = {
        id: roadSegmentId(edit.from, edit.to),
        from: edit.from,
        to: edit.to,
        curve: 0.4,
        width: ROAD_W,
      }
      const verdict = validateRoadEdit(graph, { kind: 'add-segment', segment })
      if (!verdict.ok) return { ok: false, reason: verdict.reason }
      if (roadHitsBuilding(segment, graph, world)) return { ok: false, reason: 'road-hits-building' }
      return { ok: true }
    }
    case 'remove-road': {
      if (!(edit.segmentId in graph.segments)) return { ok: false, reason: 'unknown-segment' }
      if (
        world.plots.some((plot) => plot.access?.roadId === edit.segmentId) ||
        Object.values(world.buildings).some((building) => building.access?.roadId === edit.segmentId)
      )
        return { ok: false, reason: 'road-serves-building' }
      const segment = graph.segments[edit.segmentId]
      const verdict = validateRoadEdit(graph, { kind: 'remove-segment', segment })
      return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason }
    }
    case 'district-style': {
      if (!DISTRICT_DOMAINS.includes(edit.domain)) return { ok: false, reason: 'unknown-domain' }
      if (!(ARCHETYPES as readonly string[]).includes(edit.archetype))
        return { ok: false, reason: 'unknown-archetype' }
      return { ok: true }
    }
    case 'reset':
      return { ok: true }
  }
}

/**
 * The override document after one edit (R032). The document is final state:
 * a second move of the same building replaces its entry, and removing all
 * edits (`reset`) yields the empty document whose application restores the
 * derived layout.
 */
export function nextDocument(doc: LayoutOverride | null, edit: LayoutEdit, world: World): LayoutOverride {
  if (edit.kind === 'reset') return emptyLayoutOverride()
  const next = doc ? structuredClone(doc) : emptyLayoutOverride()
  switch (edit.kind) {
    case 'move-building': {
      const entry = next.moves.find((m) => m.buildingId === edit.buildingId)
      const rotation: Rotation =
        edit.rotation ??
        (entry
          ? entry.rotation
          : edit.buildingId in world.buildings
            ? (world.buildings[edit.buildingId].rot as Rotation)
            : 0)
      if (entry) {
        entry.plot = edit.plot
        entry.rotation = rotation
      } else {
        next.moves.push({ buildingId: edit.buildingId, plot: edit.plot, rotation })
      }
      break
    }
    case 'rotate-building': {
      const entry = next.moves.find((m) => m.buildingId === edit.buildingId)
      if (entry) {
        entry.rotation = edit.rotation
      } else {
        const plot = world.plots.findIndex((p) => p.buildingId === edit.buildingId)
        next.moves.push({
          buildingId: edit.buildingId,
          plot: plot >= 0 ? plot : 0,
          rotation: edit.rotation,
        })
      }
      break
    }
    case 'add-road': {
      const segmentId = roadSegmentId(edit.from, edit.to)
      if (!next.roads.some((r) => r.segmentId === segmentId)) {
        next.roads.push({ kind: 'add', segmentId, from: edit.from, to: edit.to })
      }
      break
    }
    case 'remove-road': {
      if (!next.roads.some((r) => r.segmentId === edit.segmentId)) {
        next.roads.push({ kind: 'remove', segmentId: edit.segmentId })
      }
      break
    }
    case 'district-style': {
      const entry = next.styles.find((s) => s.domain === edit.domain)
      if (entry) entry.archetype = edit.archetype
      else next.styles.push({ domain: edit.domain, archetype: edit.archetype })
      break
    }
  }
  return next
}

/**
 * Validate a whole stored document (R032, the boot and second-viewer path):
 * every move's final plot is free (two buildings may never share a plot, and
 * a moved building never steals a reservation), the road overrides applied
 * in order keep the graph connected and overlap-free, and every district
 * style is known. Returns the refusal reasons (empty when the document is
 * sound) — an unsound document is never applied.
 */
export function validateDocument(
  doc: LayoutOverride,
  world: World,
  graph: RoadGraph,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  // Moves: final-state plot occupancy.
  const currentPlotOf = new Map<string, number>()
  world.plots.forEach((p, i) => {
    if (p.buildingId) currentPlotOf.set(p.buildingId, i)
  })
  const finalPlotOf = new Map<number, string>()
  for (const m of doc.moves) {
    const b = m.buildingId in world.buildings ? world.buildings[m.buildingId] : null
    if (b?.category !== 'connector') {
      reasons.push(`move: ${m.buildingId} is not a district building`)
      continue
    }
    if (m.plot < 0 || m.plot >= world.plots.length) {
      reasons.push(`move: plot ${m.plot} does not exist`)
      continue
    }
    if (!dryBuildingSite(b, world.plots[m.plot], m.rotation)) {
      reasons.push(`move: ${m.buildingId} foundation or entrance intersects water`)
      continue
    }
    const other = finalPlotOf.get(m.plot)
    if (other && other !== m.buildingId) {
      reasons.push(`move: plots ${m.plot} would carry ${other} and ${m.buildingId}`)
      continue
    }
    finalPlotOf.set(m.plot, m.buildingId)
  }
  // A moved building never steals a plot reserved for another connector.
  for (const [plotIndex, buildingId] of finalPlotOf) {
    const plot = world.plots[plotIndex]
    if (plot.reservedId && plot.reservedId !== buildingId) {
      reasons.push(`move: plot ${plotIndex} is reserved for ${plot.reservedId}`)
    }
  }
  // Roads: the overrides applied in order against the live graph.
  const evolving: RoadGraph = {
    nodes: { ...graph.nodes },
    segments: Object.fromEntries(Object.entries(graph.segments)),
  }
  for (const r of doc.roads) {
    const segment: RoadSegment = {
      id: r.segmentId,
      from: r.from ?? r.segmentId,
      to: r.to ?? r.segmentId,
      curve: 0.4,
      width: ROAD_W,
    }
    const edit: RoadEdit =
      r.kind === 'add'
        ? { kind: 'add-segment', segment }
        : { kind: 'remove-segment', segment: evolving.segments[r.segmentId] ?? segment }
    const verdict = validateRoadEdit(evolving, edit)
    if (!verdict.ok) {
      reasons.push(`road ${r.segmentId}: ${verdict.reason ?? 'refused'}`)
      continue
    }
    if (r.kind === 'add') {
      evolving.segments[r.segmentId] = segment
    } else {
      evolving.segments = Object.fromEntries(Object.entries(evolving.segments).filter(([id]) => id !== r.segmentId))
    }
  }
  // District styles.
  for (const s of doc.styles) {
    if (!DISTRICT_DOMAINS.includes(s.domain)) {
      reasons.push(`style: unknown domain ${s.domain}`)
    } else if (!(ARCHETYPES as readonly string[]).includes(s.archetype)) {
      reasons.push(`style: unknown archetype ${s.archetype}`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/** The road graph the derived layout ships with (the grid the district grew on). */
export function derivedRoadGraph(): RoadGraph {
  if (isCitySandbox() && new URLSearchParams(window.location.search).has('seed')) {
    return generateIslandRoads(CITY_WORLD_SEED, [])
  }
  return deriveRoadGraph(X_ROADS, Z_ROADS, { segmentWidth: ROAD_W })
}

/**
 * Apply one stored layout document to the world (R032): final state over the
 * derived placement. Every connector building with a move entry sits on its
 * overridden plot at its rotation; every connector without an entry sits
 * back on its derived plot — so an empty document restores the derived
 * layout exactly. The road graph is re-derived and the overrides applied in
 * order; the district styles replace the derived archetypes. Idempotent:
 * applying the same document twice leaves the world unchanged.
 */
export function applyDocument(world: World, doc: LayoutOverride): RoadGraph {
  const moves = new Map<string, BuildingMove>()
  for (const m of doc.moves) moves.set(m.buildingId, m)
  for (const b of Object.values(world.buildings)) {
    if (b.category !== 'connector' || b.derivedPlot === null) continue
    const entry = moves.get(b.id)
    const plotIndex = entry ? entry.plot : b.derivedPlot
    if (plotIndex < 0 || plotIndex >= world.plots.length) continue
    const targetPlot = world.plots[plotIndex]
    const fromPlot = world.plots.find((p) => p.buildingId === b.id)
    if (fromPlot && fromPlot !== targetPlot) fromPlot.buildingId = null
    targetPlot.buildingId = b.id
    b.x = targetPlot.x
    b.z = targetPlot.z
    b.rot = entry ? entry.rotation : 0
    b.door = plotDoor(targetPlot)
    b.access = targetPlot.access
  }
  const graph = derivedRoadGraph()
  for (const r of doc.roads) {
    if (r.kind === 'add') {
      if (r.from && r.to && r.from in graph.nodes && r.to in graph.nodes && !(r.segmentId in graph.segments)) {
        graph.segments[r.segmentId] = {
          id: r.segmentId,
          from: r.from,
          to: r.to,
          curve: 0.4,
          width: ROAD_W,
        }
      }
    } else if (r.segmentId in graph.segments) {
      graph.segments = Object.fromEntries(Object.entries(graph.segments).filter(([id]) => id !== r.segmentId))
    }
  }
  world.roadGraph = graph
  world.layoutDoc = doc
  world.districtStyles = Object.fromEntries(doc.styles.map((s) => [s.domain, s.archetype]))
  return graph
}

/**
 * A serializable snapshot of the effective layout (R032's round-trip proof):
 * the connector placements, the road segments with their endpoints and the
 * district styles. Two viewers applying the same document to the same
 * derived city serialize identically.
 */
export function serializeLayout(world: World, graph: RoadGraph): unknown {
  return {
    buildings: Object.values(world.buildings)
      .filter((b) => b.category === 'connector')
      .map((b) => ({
        id: b.id,
        x: b.x,
        z: b.z,
        rot: b.rot,
        plot: world.plots.findIndex((p) => p.buildingId === b.id),
        door: b.door ? { x: b.door.x, z: b.door.z } : null,
      })),
    roads: Object.keys(graph.segments)
      .sort()
      .map((id) => {
        const s = graph.segments[id]
        const a = s.from in graph.nodes ? graph.nodes[s.from] : null
        const b = s.to in graph.nodes ? graph.nodes[s.to] : null
        return { id, from: s.from, to: s.to, x1: a?.x, z1: a?.z, x2: b?.x, z2: b?.z }
      }),
    styles: { ...world.districtStyles },
  }
}

/** The operator-facing wording for each refusal reason (R032). */
export const REFUSAL_TEXT: Record<string, string> = {
  'not-movable': 'Only district buildings move to plots.',
  'unknown-plot': 'Unknown plot.',
  'plot-occupied': 'That plot already carries a building.',
  'plot-reserved': 'That plot is reserved for a registered connector.',
  'plot-under-construction': 'That plot is under construction.',
  'invalid-rotation': 'Rotation snaps to a quarter turn.',
  'unknown-node': 'Pick two known intersections.',
  'unknown-segment': 'Unknown segment.',
  'disconnects-graph': 'Refused — removing that segment would disconnect the road network.',
  'overlaps-existing-segment': 'Refused — a segment already runs between those intersections.',
  'road-hits-building': 'Refused — the road corridor would intersect a building or its pedestrian setback.',
  'building-hits-water': 'Refused — the building foundation or its entrance needs dry ground.',
  'unknown-domain': 'Unknown district.',
  'unknown-archetype': 'Unknown district style.',
  unavailable: 'The served layout is unavailable right now; the edit was not saved and nothing changed locally.',
}

/**
 * @file editLayer.ts
 * @description The user edit layer over the derived city (OVERSTORY-CITY-R040,
 * constitution R-G4). The derived layout is the default. Edits are a
 * persistent layer: regrowth respects every pin and grows only around it,
 * and any area resets to its derived form. The layer is a document the
 * served write seam stores (R032, R021); it is never browser-local state.
 */
import { cellKey, deriveCity, type Cell, type DerivedBuilding, type DerivedCity, type DerivedRoad } from './growth'
import type { GraphFacts } from './graphFacts'

export const EDIT_LAYER_VERSION = 1 as const

/** A building pinned to a cell, optionally restyled or replaced by an authored form. */
export interface BuildingPin {
  id: string
  cell: Cell
  rotation?: 0 | 90 | 180 | 270
  /** A restyle or replacement: the archetype family the user chose. */
  family?: string
}

/** A road the user drew or removed. */
export interface RoadPin {
  kind: 'add' | 'remove'
  id: string
  from?: string
  to?: string
}

/** A decorative or non-derived element the user placed. */
export interface Decor {
  id: string
  kind: string
  cell: Cell
}

/** A terraform edit: a height delta at a cell. */
export interface TerrainEdit {
  cell: Cell
  delta: number
}

/** A zone policy set on a plot (R112). */
export interface PlotZone {
  plotIndex: number
  zone: 'residential' | 'commercial' | 'industrial' | 'mixed'
}

export interface EditLayer {
  version: typeof EDIT_LAYER_VERSION
  pins: BuildingPin[]
  roads: RoadPin[]
  decor: Decor[]
  terrain: TerrainEdit[]
  /** Plot zone policies (R112). */
  zones: PlotZone[]
}

export interface Area {
  x0: number
  z0: number
  x1: number
  z1: number
}

export function emptyEditLayer(): EditLayer {
  return { version: EDIT_LAYER_VERSION, pins: [], roads: [], decor: [], terrain: [], zones: [] }
}

/** The city a viewer sees: the derived layout with the edit layer applied. */
export interface ShownCity extends Omit<DerivedCity, 'buildings' | 'roads'> {
  buildings: (DerivedBuilding & { pinned: boolean; rotation: number })[]
  roads: (DerivedRoad & { drawn: boolean })[]
  decor: Decor[]
  terrain: TerrainEdit[]
}

export function inArea(c: Cell, a: Area): boolean {
  return (
    c.x >= Math.min(a.x0, a.x1) &&
    c.x <= Math.max(a.x0, a.x1) &&
    c.z >= Math.min(a.z0, a.z1) &&
    c.z <= Math.max(a.z0, a.z1)
  )
}

/** The refusal reasons, in operator-facing wording. */
export const PIN_REFUSAL = {
  occupied: 'That cell is already taken by another pinned item.',
  unknown: 'That building is not part of the city.',
} as const

/** Validate adding one building pin against the current layer. */
export function validatePin(
  layer: EditLayer,
  pin: BuildingPin,
  knownIds: ReadonlySet<string>,
): { ok: boolean; reason?: string } {
  if (!knownIds.has(pin.id)) return { ok: false, reason: PIN_REFUSAL.unknown }
  const k = cellKey(pin.cell)
  const clash =
    layer.pins.some((p) => p.id !== pin.id && cellKey(p.cell) === k) || layer.decor.some((d) => cellKey(d.cell) === k)
  return clash ? { ok: false, reason: PIN_REFUSAL.occupied } : { ok: true }
}

/** Add or replace a pin; a refused pin returns the layer unchanged and the reason. */
export function pinBuilding(
  layer: EditLayer,
  pin: BuildingPin,
  knownIds: ReadonlySet<string>,
): { layer: EditLayer; ok: boolean; reason?: string } {
  const v = validatePin(layer, pin, knownIds)
  if (!v.ok) return { layer, ...v }
  return { layer: { ...layer, pins: [...layer.pins.filter((p) => p.id !== pin.id), pin] }, ok: true }
}

/** Overlay the layer on a derived city. Pure. */
export function applyEditLayer(city: DerivedCity, layer: EditLayer): ShownCity {
  const pins = new Map(layer.pins.map((p) => [p.id, p]))
  const removed = new Set(layer.roads.filter((r) => r.kind === 'remove').map((r) => r.id))
  const buildings = city.buildings.map((b) => {
    const p = pins.get(b.id)
    if (!p) return { ...b, pinned: false, rotation: 0 }
    return {
      ...b,
      cell: p.cell,
      archetype: p.family
        ? { ...b.archetype, family: p.family as DerivedBuilding['archetype']['family'] }
        : b.archetype,
      pinned: true,
      rotation: p.rotation ?? 0,
    }
  })
  const roads = [
    ...city.roads.filter((r) => !removed.has(r.id)).map((r) => ({ ...r, drawn: false })),
    ...layer.roads
      .filter((r) => r.kind === 'add' && r.from && r.to)
      .map((r) => ({
        id: r.id,
        from: r.from!,
        to: r.to!,
        cls: 'lane' as const,
        lanes: 1,
        access: false,
        drawn: true,
      })),
  ]
  return { ...city, buildings, roads, decor: layer.decor, terrain: layer.terrain }
}

/**
 * Regrow the city from the facts and the seed around the layer: pinned
 * buildings and decor are fixed first, so growth fills only the cells
 * around them and never overwrites one (R040).
 */
export function regrow(facts: GraphFacts, seed: number, layer: EditLayer): ShownCity {
  const reserved = new Map(layer.pins.map((p) => [p.id, p.cell]))
  const blocked = new Set(layer.decor.map((d) => cellKey(d.cell)))
  return applyEditLayer(deriveCity(facts, seed, { reserved, blocked }), layer)
}

/** Reset an area to its derived form: drop every edit whose cell lies in the area. */
export function resetArea(layer: EditLayer, area: Area, derived?: DerivedCity): EditLayer {
  const inAreaIds = new Set((derived?.buildings ?? []).filter((b) => inArea(b.cell, area)).map((b) => b.id))
  return {
    ...layer,
    pins: layer.pins.filter((p) => !inArea(p.cell, area) && !inAreaIds.has(p.id)),
    decor: layer.decor.filter((d) => !inArea(d.cell, area)),
    terrain: layer.terrain.filter((t) => !inArea(t.cell, area)),
  }
}

// ===========================================================================
// R112: Plot zone editing
// ===========================================================================

/** Set zone on a plot (R112). */
export function setPlotZone(
  layer: EditLayer,
  plotIndex: number,
  zone: 'residential' | 'commercial' | 'industrial' | 'mixed',
): EditLayer {
  const existing = layer.zones.findIndex((z) => z.plotIndex === plotIndex)
  if (existing >= 0) {
    const updated = [...layer.zones]
    updated[existing] = { plotIndex, zone }
    return { ...layer, zones: updated }
  }
  return { ...layer, zones: [...layer.zones, { plotIndex, zone }] }
}

/** Clear zone on a plot (R112, undo). */
export function clearPlotZone(layer: EditLayer, plotIndex: number): EditLayer {
  return { ...layer, zones: layer.zones.filter((z) => z.plotIndex !== plotIndex) }
}

/** Get zone for a plot. */
export function getPlotZone(
  layer: EditLayer,
  plotIndex: number,
): 'residential' | 'commercial' | 'industrial' | 'mixed' | undefined {
  const z = layer.zones.find((z) => z.plotIndex === plotIndex)
  return z?.zone
}

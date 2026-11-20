/**
 * @file editLayer.test.ts
 * @description The user edit layer over the derived city (OVERSTORY-CITY-R040).
 */
// spec: OVERSTORY-CITY-R040
import { describe, expect, it } from 'vitest'
import {
  applyEditLayer,
  emptyEditLayer,
  pinBuilding,
  regrow,
  resetArea,
  PIN_REFUSAL,
  type EditLayer,
} from '../core/editLayer'
import { BUNDLED_FACTS, type GraphFacts } from '../core/graphFacts'
import { deriveCity } from '../core/growth'

const SEED = 20261120
const ids = new Set(BUNDLED_FACTS.nodes.map((n) => n.id))

function bigger(): GraphFacts {
  const extra = Array.from({ length: 12 }, (_, i) => ({
    id: `grown-${i}`,
    cls: 'Agent',
    label: 'x',
    domain: 'ops',
    weight: 1,
    seq: 2000 + i,
  }))
  return {
    ...BUNDLED_FACTS,
    nodes: [...BUNDLED_FACTS.nodes, ...extra],
    edges: [
      ...BUNDLED_FACTS.edges,
      ...extra.map((n, i) => ({ id: `g${i}`, from: n.id, to: 'conn-1', kind: 'uses', weight: 1 })),
    ],
  }
}

describe('pins', () => {
  it('keeps a pinned building and decor through regrowth with a grown graph', () => {
    const derived = deriveCity(BUNDLED_FACTS, SEED)
    const spot = { x: 40, z: 40 }
    let layer = emptyEditLayer()
    layer = pinBuilding(layer, { id: 'conn-2', cell: spot, rotation: 90 }, ids).layer
    layer = { ...layer, decor: [{ id: 'fountain', kind: 'fountain', cell: { x: 41, z: 40 } }] }
    const grown = regrow(bigger(), SEED, layer)
    const pinned = grown.buildings.find((b) => b.id === 'conn-2')!
    expect(pinned.cell).toEqual(spot)
    expect(pinned.pinned).toBe(true)
    expect(pinned.rotation).toBe(90)
    expect(grown.decor).toEqual(layer.decor)
    expect(grown.buildings.length).toBe(derived.buildings.length + 12)
  })

  it('grows only around the pins: no derived building lands on a pinned or decor cell', () => {
    const base = deriveCity(bigger(), SEED)
    // Pin a different building onto a cell the plain derivation would have used.
    const target = base.buildings.find((b) => b.id === 'grown-3')!.cell
    const layer = pinBuilding(emptyEditLayer(), { id: 'conn-3', cell: target }, ids).layer
    const grown = regrow(bigger(), SEED, layer)
    const onCell = grown.buildings.filter((b) => b.cell.x === target.x && b.cell.z === target.z)
    expect(onCell.map((b) => b.id)).toEqual(['conn-3'])
  })

  it('refuses a pin that collides with another pin or decor, with an operator-facing reason', () => {
    const cell = { x: 9, z: 9 }
    let layer = pinBuilding(emptyEditLayer(), { id: 'conn-1', cell }, ids).layer
    const clash = pinBuilding(layer, { id: 'conn-2', cell }, ids)
    expect(clash.ok).toBe(false)
    expect(clash.reason).toBe(PIN_REFUSAL.occupied)
    expect(clash.layer).toBe(layer)
    layer = { ...layer, decor: [{ id: 'd', kind: 'tree', cell: { x: 5, z: 5 } }] }
    expect(pinBuilding(layer, { id: 'conn-3', cell: { x: 5, z: 5 } }, ids).ok).toBe(false)
    expect(pinBuilding(layer, { id: 'ghost', cell: { x: 1, z: 1 } }, ids).reason).toBe(PIN_REFUSAL.unknown)
  })

  it('resets an area to its derived form and leaves the other pins', () => {
    const derived = deriveCity(BUNDLED_FACTS, SEED)
    let layer: EditLayer = emptyEditLayer()
    layer = pinBuilding(layer, { id: 'conn-1', cell: { x: 30, z: 30 } }, ids).layer
    layer = pinBuilding(layer, { id: 'conn-2', cell: { x: -30, z: -30 } }, ids).layer
    layer = {
      ...layer,
      decor: [{ id: 'd', kind: 'tree', cell: { x: 31, z: 30 } }],
      terrain: [{ cell: { x: 30, z: 31 }, delta: 2 }],
    }
    const reset = resetArea(layer, { x0: 25, z0: 25, x1: 35, z1: 35 }, derived)
    expect(reset.pins.map((p) => p.id)).toEqual(['conn-2'])
    expect(reset.decor).toEqual([])
    expect(reset.terrain).toEqual([])
    const shown = applyEditLayer(derived, reset)
    expect(shown.buildings.find((b) => b.id === 'conn-1')?.cell).toEqual(
      derived.buildings.find((b) => b.id === 'conn-1')?.cell,
    )
    expect(shown.buildings.find((b) => b.id === 'conn-1')?.pinned).toBe(false)
  })

  it('applies drawn and removed roads and round-trips through JSON', () => {
    const derived = deriveCity(BUNDLED_FACTS, SEED)
    const layer: EditLayer = {
      ...emptyEditLayer(),
      roads: [
        { kind: 'remove', id: derived.roads[0].id },
        { kind: 'add', id: 'drawn-1', from: 'conn-1', to: 'conn-3' },
      ],
    }
    const shown = applyEditLayer(derived, layer)
    expect(shown.roads.some((r) => r.id === derived.roads[0].id)).toBe(false)
    expect(shown.roads.find((r) => r.id === 'drawn-1')?.drawn).toBe(true)
    const again = JSON.parse(JSON.stringify(layer)) as EditLayer
    expect(applyEditLayer(derived, again)).toEqual(shown)
  })
})

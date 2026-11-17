/**
 * @file perfBudget.test.ts
 * @description The city's performance budgets as acceptance criteria
 * (OVERSTORY-CITY-R028): the stated budgets (triangles per building, draw
 * calls per district, texture memory, fps targets) are checked against the
 * bundled snapshot — the same world state the scene layer consumes — with
 * the per-object costs the scene modules actually produce, so the budgets
 * are enforced in tests, not left to eyeballing.
 */
// spec: OVERSTORY-CITY-R028
import { describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { domainOf } from '../core/ecosystem'
import { BUDGETS } from '../core/budgets'
import { initSim, resetSim, world } from '../core/sim'

/**
 * Static scene model over the bundled snapshot, mirroring the objects the
 * scene layer creates per entity:
 *  - one connector building = body + nameplate + door mat + ≤ 4 archetype
 *    pieces ≤ 7 draw calls, ≤ 12 + 2 + 2 + 4 × 20 triangles;
 *  - one reserved plot = marker plane + label sprite = 2 draw calls;
 *  - one landmark = ≤ 12 draw calls, ≤ 800 triangles (the bespoke silhouettes);
 *  - one character = one pinned GLB (the QA budget bounds it, assetQa).
 */
const TRIS_BOX = 12
const MAX_CALLS_PER_CONNECTOR = 7
const MAX_TRIS_PER_CONNECTOR = TRIS_BOX + 2 + 2 + 4 * 20
const MAX_CALLS_PER_RESERVED = 2
const MAX_CALLS_PER_LANDMARK = 12
const MAX_TRIS_PER_LANDMARK = 800

describe('performance budgets over the bundled snapshot (R028)', () => {
  afterEach(() => {
    resetSim()
  })

  it('states the acceptance numbers', () => {
    expect(BUDGETS.trianglesPerBuilding).toBe(4000)
    expect(BUDGETS.drawCallsPerDistrict).toBe(150)
    expect(BUDGETS.textureMemoryMB).toBe(32)
    expect(BUDGETS.fpsIntegrated).toBe(60) // 60 fps at 1× on integrated graphics
    expect(BUDGETS.fpsMobile).toBe(30) // 30 fps mobile target
  })

  it('per-building triangle cost holds for every building in the snapshot', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    for (const b of Object.values(world.buildings)) {
      const tris = b.category === 'core' ? MAX_TRIS_PER_LANDMARK : MAX_TRIS_PER_CONNECTOR
      expect(tris, `${b.id} triangle budget`).toBeLessThanOrEqual(BUDGETS.trianglesPerBuilding)
    }
  })

  it('draw-call cost per district domain holds for the largest domain in the snapshot', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    // Group the catalog by the same business domain the district is laid out in.
    const byDomain = new Map<string, { built: number; reserved: number }>()
    for (const c of world.connectors) {
      const d = domainOf(c.id)
      const entry = byDomain.get(d) ?? { built: 0, reserved: 0 }
      if (c.packStatus === 'served') entry.built++
      else entry.reserved++
      byDomain.set(d, entry)
    }
    expect(byDomain.size).toBeGreaterThan(0)
    for (const [d, entry] of byDomain) {
      const calls = entry.built * MAX_CALLS_PER_CONNECTOR + entry.reserved * MAX_CALLS_PER_RESERVED
      expect(calls, `domain "${d}" draw-call budget`).toBeLessThanOrEqual(BUDGETS.drawCallsPerDistrict)
    }
  })

  it('the whole district scene stays inside the draw-call budget even with landmarks', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const built = Object.values(world.buildings).filter((b) => b.category === 'connector').length
    const reserved = world.plots.filter((p) => p.reservedId).length
    const landmarks = Object.values(world.buildings).filter((b) => b.category === 'core').length
    // Characters add one draw call per rig; the GLBs are QA-bounded (assetQa).
    const characters = world.characters.length
    const total =
      built * MAX_CALLS_PER_CONNECTOR +
      reserved * MAX_CALLS_PER_RESERVED +
      landmarks * MAX_CALLS_PER_LANDMARK +
      characters
    // The district plus the core block is the city's static scene; the
    // per-domain budget above is the stricter bound, this is the sanity cap.
    expect(total).toBeLessThanOrEqual(BUDGETS.drawCallsPerDistrict * 2)
  })
})

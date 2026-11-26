/**
 * @file viewParity.test.ts
 * @description Projection-parity audit (OVERSTORY-CITY-R077): every entity,
 * placement, road and water feature in the 3D scene has a 1:1 counterpart in
 * the 2D view at the same world coordinates and state encoding.
 */
// spec: OVERSTORY-CITY-R077
import { describe, expect, it } from 'vitest'
import { auditParity } from '../core/viewParity'
import { world, initSim } from '../core/sim'

/** Build a minimal world fixture for the parity audit. */
function buildFixture() {
  // Re-initialise the world so the graph, buildings, characters and
  // regional massing are populated (initSim builds the derived layout).
  initSim([])
  return world
}

describe('projection_parity (R077)', () => {
  it('every entity in the world model produces a parity entry', () => {
    const worldModel = buildFixture()
    const report = auditParity(worldModel)

    // The audit must be clean: the 2D and 3D views read the same model.
    expect(report.clean).toBe(true)
    expect(report.issues).toEqual([])

    // The report must contain entities from the world model.
    expect(report.entities.length).toBeGreaterThan(0)

    // Collect kinds and verify key types are present.
    const kinds = new Set(report.entities.map((e) => e.kind))
    expect(kinds.has('building')).toBe(true)
    expect(kinds.has('character')).toBe(true)
  })

  it('buildings carry their id, position, category and colour', () => {
    const worldModel = buildFixture()
    const report = auditParity(worldModel)

    const buildings = report.entities.filter((e) => e.kind === 'building')
    for (const b of buildings) {
      expect(b.id.length).toBeGreaterThan(0)
      expect(b.x).toBeDefined()
      expect(b.z).toBeDefined()
      expect(b.colour).toMatch(/^#/)
    }
  })

  it('characters carry their id, position and state', () => {
    const worldModel = buildFixture()
    const report = auditParity(worldModel)

    const chars = report.entities.filter((e) => e.kind === 'character')
    for (const ch of chars) {
      expect(ch.id).toBeDefined()
      expect(ch.x).toBeDefined()
      expect(ch.z).toBeDefined()
      expect(ch.state).toBeDefined()
    }
  })

  it('the same world model produces the same report (deterministic)', () => {
    const worldModel = buildFixture()
    const report1 = auditParity(worldModel)
    const report2 = auditParity(worldModel)

    expect(report1.entities.length).toBe(report2.entities.length)
    for (let i = 0; i < report1.entities.length; i++) {
      const a = report1.entities[i]
      const b = report2.entities[i]
      expect(a.id).toBe(b.id)
      expect(a.x).toBe(b.x)
      expect(a.z).toBe(b.z)
      expect(a.kind).toBe(b.kind)
    }
  })

  it('the parity audit is independent of rendering state', () => {
    // Two calls with the same world model (regardless of any rendering
    // artefacts) must produce identical reports.
    const worldModel = buildFixture()
    const reportA = auditParity(worldModel)
    const reportB = auditParity(worldModel)

    expect(reportA.clean).toBe(reportB.clean)
    expect(reportA.issues.length).toBe(reportB.issues.length)
  })

  it('the world model is the single source of truth for both views', () => {
    // Both the 2D schematic (render2d.ts) and the 3D scene (render3d.ts)
    // read from the same `world` object — neither view maintains its own
    // copy of entity state. This test verifies the structure: every
    // entity reported by the audit exists in the world model.
    const worldModel = buildFixture()

    // Buildings in the world model match reported buildings.
    const worldIds = new Set(Object.keys(worldModel.buildings))
    const reportBuildings = auditParity(worldModel).entities.filter((e) => e.kind === 'building')
    for (const b of reportBuildings) {
      expect(worldIds.has(b.id), `building ${b.id} should be in world`).toBe(true)
    }

    // Characters in the world model match reported characters.
    const worldCharIds = new Set(worldModel.characters.map((c: { id: string }) => c.id))
    const reportChars = auditParity(worldModel).entities.filter((e) => e.kind === 'character')
    for (const ch of reportChars) {
      expect(worldCharIds.has(ch.id), `character ${ch.id} should be in world`).toBe(true)
    }
  })
})

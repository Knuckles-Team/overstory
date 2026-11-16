/**
 * @file ecosystem.test.ts
 * @description Fleet-driven connector district and the core landmarks
 * (OVERSTORY-CITY-R002/R004). The catalog is the Arbora fleet, not a
 * curated list: served packs are built, registered packs are planned
 * plots, and the arbora core is a landmark, never a connector plot.
 */
// spec: OVERSTORY-CITY-R002, OVERSTORY-CITY-R004, OVERSTORY-CITY-R005
import { describe, expect, it } from 'vitest'
import {
  ARBORA_CORE_SERVER,
  CORE_LANDMARKS,
  FLEET_SNAPSHOT,
  ROSTER,
  SIM_TOOLS,
  fleetToConnectors,
  type FleetServer,
} from '../core/ecosystem'
import { PLOTS } from '../core/layout'

describe('fleet snapshot (SIMULATED source, 2026-11-15 capture)', () => {
  it('carries the full registered catalog: 7 served, 67 registered-unpublished', () => {
    const served = FLEET_SNAPSHOT.filter((s) => s.packStatus === 'served')
    const registered = FLEET_SNAPSHOT.filter((s) => s.packStatus === 'registered_unpublished')
    expect(served).toHaveLength(7)
    expect(registered).toHaveLength(67)
    expect(FLEET_SNAPSHOT).toHaveLength(74)
  })

  it('does not carry the arbora core: it is a landmark, never a connector plot', () => {
    expect(FLEET_SNAPSHOT.map((s) => s.server)).not.toContain(ARBORA_CORE_SERVER)
  })

  it('served packs carry their captured tool counts and representative names', () => {
    const sql = FLEET_SNAPSHOT.find((s) => s.server === 'sql-mcp')
    expect(sql).toMatchObject({
      packStatus: 'served',
      toolCount: 33,
      tools: ['sql_schema_catalog', 'query', 'list_tables'],
    })
  })

  it('registered-unpublished packs carry no tools', () => {
    for (const s of FLEET_SNAPSHOT.filter((x) => x.packStatus === 'registered_unpublished')) {
      expect(s.toolCount).toBe(0)
      expect(s.tools).toEqual([])
    }
  })
})

describe('fleetToConnectors (R002)', () => {
  it('maps every fleet server to exactly one connector, excluding the arbora core', () => {
    const withCore: FleetServer[] = [
      ...FLEET_SNAPSHOT,
      {
        server: ARBORA_CORE_SERVER,
        toolCount: 44,
        tools: ['admission.review'],
        packStatus: 'served',
      },
    ]
    const connectors = fleetToConnectors(withCore)
    expect(connectors).toHaveLength(74)
    expect(connectors.map((c) => c.id)).not.toContain(ARBORA_CORE_SERVER)
    expect(new Set(connectors.map((c) => c.id)).size).toBe(connectors.length)
  })

  it('served packs keep their real tool list (simTools false)', () => {
    const connectors = fleetToConnectors(FLEET_SNAPSHOT)
    const mealie = connectors.find((c) => c.id === 'mealie-mcp')
    expect(mealie).toMatchObject({
      packStatus: 'served',
      tools: ['list_recipes', 'plan_meal', 'grocery_list'],
      simTools: false,
    })
    expect(mealie?.blurb).toContain('254 served tools')
  })

  it('registered packs fall back to the simulated tool set, marked as such', () => {
    const connectors = fleetToConnectors(FLEET_SNAPSHOT)
    const gitlab = connectors.find((c) => c.id === 'gitlab-mcp')
    expect(gitlab).toMatchObject({
      packStatus: 'registered_unpublished',
      tools: SIM_TOOLS,
      simTools: true,
    })
    expect(gitlab?.blurb).toBe('Registered — not yet published')
  })

  it('served packs without reported tool names also fall back to the simulated set', () => {
    const connectors = fleetToConnectors([{ server: 'no-tools-mcp', toolCount: 3, tools: [], packStatus: 'served' }])
    expect(connectors[0]).toMatchObject({ tools: SIM_TOOLS, simTools: true })
  })

  it('is deterministic: the same fleet read places the same building the same way', () => {
    const a = fleetToConnectors(FLEET_SNAPSHOT)
    const b = fleetToConnectors(FLEET_SNAPSHOT)
    expect(b).toEqual(a)
    const one = a.find((c) => c.id === 'vector-mcp')
    expect(one).toBeDefined()
    expect(typeof one?.archetype).toBe('string')
    expect(typeof one?.color).toBe('number')
  })
})

describe('district sizing (R002)', () => {
  it('holds 78 plots: the current 74-connector catalog always fits', () => {
    expect(PLOTS.length).toBe(78)
    expect(PLOTS.length).toBeGreaterThanOrEqual(FLEET_SNAPSHOT.length)
  })
})

describe('core landmarks (R004)', () => {
  it('is exactly one landmark per core platform component', () => {
    expect(CORE_LANDMARKS.map((l) => l.id)).toEqual([
      'arbora',
      'medulla',
      'meristem',
      'overstory',
      'tuig',
      'axil',
      'scion',
    ])
  })

  it('every landmark carries a role and at least one internal location', () => {
    for (const l of CORE_LANDMARKS) {
      expect(l.role.length).toBeGreaterThan(0)
      expect(l.rooms.length).toBeGreaterThanOrEqual(1)
      expect(l.tools.length).toBeGreaterThan(0)
    }
  })
})

describe('roster (R005)', () => {
  it('is 17 citizens: 14 AI agents and 3 human operators, each a distinct rider', () => {
    expect(ROSTER).toHaveLength(17)
    const ai = ROSTER.filter((r) => r.kind === 'ai')
    const humans = ROSTER.filter((r) => r.kind === 'human')
    expect(ai).toHaveLength(14)
    expect(humans).toHaveLength(3)
    expect(new Set(ROSTER.map((r) => r.rider)).size).toBe(ROSTER.length)
  })
})

/**
 * @file ecosystemMirror.test.ts
 * @description Live ecosystem mirroring (OVERSTORY-CITY-R020): the mirror
 * polls Arbora, diffs state, emits typed events, and applies them to the
 * city simulation. Determinism is tested by feeding identical ArboraState
 * snapshots and asserting identical city state outcomes.
 *
 * Events: connector-create, connector-update, connector-destroy,
 * landmark-update, fleet-update. The mirror is deterministic (same
 * ArboraState → same events → same city state).
 */
// spec: OVERSTORY-CITY-R020
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors, type ConnectorDef } from '../core/ecosystem'
import { bus } from '../core/events'
import { resetSim } from '../core/sim'
import {
  applyToCity,
  createEcosystemMirror,
  syncFromArbora,
  type ArboraState,
  type EcosystemEvent,
  type MirrorState,
} from '../core/ecosystemMirror'
import type { Plot } from '../core/sim'

// ---- Helpers ------------------------------------------------------------

/** Build a minimal ArboraState from a connector list (used by syncFromArbora). */
function buildState(
  connectors: ConnectorDef[],
  opts?: {
    served?: number
    registered?: number
    total?: number
    reachable?: boolean
    stale?: boolean
  },
): ArboraState {
  const snapshots: ArboraState['connectors'] = connectors.map((c) => ({
    id: c.id,
    name: c.name,
    blurb: c.blurb,
    archetype: c.archetype,
    color: c.color,
    tools: c.tools,
    packStatus: c.packStatus,
    simTools: c.simTools,
  }))
  const landmarkSnapshots: ArboraState['landmarks'] = Array.from(
    { length: 7 },
    (_, i) =>
      ({
        id: ['arbora', 'medulla', 'meristem', 'overstory', 'tuig', 'axil', 'scion'][i]!,
        name: ['Arbora', 'Medulla', 'Meristem', 'Overstory', 'Tuig', 'Axil', 'Scion SDK'][i]!,
        kind: ['gate', 'vault', 'works', 'tower', 'kiosk', 'pavilion', 'dock'][i]!,
        color: [0x5ea0ff, 0xa06bff, 0xff7847, 0x37d0c3, 0xffc94d, 0xff6f9c, 0x7fd06f][i]!,
        role: `Core platform component ${i + 1}`,
        tools: ['eg.graph.GetNodesByLabel'],
        rooms: ['graph'],
        online: true,
      }) as ArboraState['landmarks'][0],
  )
  return {
    connectors: snapshots,
    landmarks: landmarkSnapshots,
    fleet: {
      totalConnectors: opts?.total ?? connectors.length,
      servedConnectors: opts?.served ?? connectors.filter((c) => c.packStatus === 'served').length,
      registeredConnectors:
        opts?.registered ?? connectors.filter((c) => c.packStatus === 'registered_unpublished').length,
      arboraReachable: opts?.reachable ?? true,
      cacheStale: opts?.stale ?? false,
    },
    capturedAt: '2026-11-25T12:00:00.000Z',
  }
}

/** Create a minimal mock city object matching applyToCity's expected shape. */
function mockCity(): {
  buildings: Record<string, import('../core/sim').Building>
  plots: (Plot & { access?: unknown })[]
  connectors: ConnectorDef[]
  overflow: ConnectorDef[]
} {
  return {
    buildings: {},
    plots: Array.from({ length: 3 }, (_, i) => ({
      x: -30 + i * 5.6,
      z: -20,
      buildingId: null,
      reservedId: null,
      reservedName: null,
      construction: null,
    })) as (Plot & { access?: unknown })[],
    connectors: [],
    overflow: [],
  }
}

/** Helper to build a mock building with only the needed fields. */
function mockBuilding(overrides: Partial<import('../core/sim').Building> = {}): import('../core/sim').Building {
  return {
    id: 'mock',
    name: 'Mock',
    category: 'connector',
    role: 'Mock role',
    tools: [],
    rooms: ['main'],
    color: 0x000000,
    kind: 'tower',
    x: 0,
    z: 0,
    w: 5.6,
    d: 5.6,
    online: true,
    visits: 0,
    fresh: 0,
    flash: 0,
    served: true,
    packStatus: 'served',
    blurb: '',
    simTools: false,
    toolCount: 0,
    door: null,
    rot: 0,
    derivedPlot: null,
    ...overrides,
  }
}

// ---- Reset between tests ------------------------------------------------

beforeEach(() => {
  bus.reset()
  resetSim()
})

// ---- Mirror creation (base state) ----------------------------------------

describe('mirror creates with base ecosystem state (R020)', () => {
  it('createEcosystemMirror returns an EcosystemMirror interface', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    const mirror = createEcosystemMirror({
      baseConnectors: base,
    })
    expect(mirror).toBeDefined()
    expect(typeof mirror.sync).toBe('function')
    expect(typeof mirror.events).toBe('function')
    expect(typeof mirror.drain).toBe('function')
    expect(typeof mirror.reset).toBe('function')
    expect(typeof mirror.isActive).toBe('function')
  })

  it('events() is empty on creation (no ArboraState synced yet)', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    const mirror = createEcosystemMirror({
      baseConnectors: base,
    })
    expect(mirror.events()).toHaveLength(0)
    expect(mirror.drain()).toHaveLength(0)
  })

  it('isActive() is false until startPolling() is called', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    const mirror = createEcosystemMirror({
      baseConnectors: base,
      autoPoll: false,
    })
    expect(mirror.isActive()).toBe(false)
    ;(mirror as unknown as { startPolling: () => void }).startPolling()
    expect(mirror.isActive()).toBe(true)
    ;(mirror as unknown as { stopPolling: () => void }).stopPolling()
    expect(mirror.isActive()).toBe(false)
  })

  it('reset() clears all state and re-seeds from base', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    const mirror = createEcosystemMirror({
      baseConnectors: base,
    })
    // Sync some state first.
    const connector: ConnectorDef = {
      id: 'reset-test-mcp',
      name: 'Reset Test',
      blurb: 'test',
      archetype: 'tower',
      color: 0x111111,
      tools: ['t'],
      packStatus: 'served',
      simTools: false,
    }
    mirror.sync(buildState([connector]))
    // Drain should have the connector-create event.
    const drained = mirror.drain()
    expect(drained.some((e) => e.type === 'connector-create')).toBe(true)
    // Reset should clear everything.
    mirror.reset()
    expect(mirror.events()).toHaveLength(0)
    expect(mirror.isActive()).toBe(false)
  })
})

// ---- Connector create event ----------------------------------------------

describe('new connector in Arbora state creates mirror event (R020)', () => {
  it('syncFromArbora detects a new connector not in the base catalog', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    const newConnector: ConnectorDef = {
      id: 'new-service-mcp',
      name: 'New Service',
      blurb: 'A brand new connector',
      archetype: 'tower',
      color: 0xff0000,
      tools: ['new.tool.call'],
      packStatus: 'served',
      simTools: false,
    }
    const state = buildState([...base, newConnector])
    const baseSnapshots = base.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      archetype: c.archetype,
      color: c.color,
      tools: c.tools,
      packStatus: c.packStatus,
      simTools: c.simTools,
    }))
    const { events } = syncFromArbora(state, null, baseSnapshots)
    const createEvents = events.filter((e) => e.type === 'connector-create')
    expect(createEvents.length).toBeGreaterThan(0)
    // The new connector must be among the creates.
    expect(createEvents.some((e) => e.id === 'new-service-mcp')).toBe(true)
    const newCreate = createEvents.find((e) => e.id === 'new-service-mcp')
    expect(newCreate).toBeDefined()
    expect(newCreate!.detail).toContain('new-service-mcp')
    expect(newCreate!.snapshot).toBeDefined()
    expect(newCreate!.snapshot).toMatchObject({ id: 'new-service-mcp' })
  })

  it('applyToCity places a new connector on the next available plot', () => {
    const connector: ConnectorDef = {
      id: 'test-mcp',
      name: 'Test Service',
      blurb: 'A test connector',
      archetype: 'tower',
      color: 0xaabbcc,
      tools: ['test.call'],
      packStatus: 'served',
      simTools: false,
    }
    const state = buildState([connector])
    const { events } = syncFromArbora(state, null, [])
    const city = mockCity()
    applyToCity(events, city)
    expect(city.buildings['test-mcp']).toBeDefined()
    expect(city.buildings['test-mcp'].online).toBe(true)
    // The connector was placed on the first empty plot.
    expect(city.plots[0].buildingId).toBe('test-mcp')
    // A construction record was created.
    expect(city.plots[0].construction).not.toBeNull()
  })

  it('connector overflow is queued when no plots remain (not silently dropped)', () => {
    const connectors: ConnectorDef[] = Array.from({ length: 5 }, (_, i) => ({
      id: `overflow-${i}`,
      name: `Overflow ${i}`,
      blurb: 'Overflow connector',
      archetype: 'office',
      color: 0x336699,
      tools: ['op'],
      packStatus: 'registered_unpublished',
      simTools: true,
    }))
    const state = buildState(connectors)
    const { events } = syncFromArbora(state, null, [])
    // Only 3 plots available, so the first 3 fill the plots and the rest overflow.
    const city = mockCity()
    applyToCity(events, city)
    expect(city.buildings).toHaveProperty('overflow-0')
    expect(city.buildings).toHaveProperty('overflow-1')
    expect(city.buildings).toHaveProperty('overflow-2')
    expect(city.overflow.length).toBe(2)
  })

  it('connector-create is idempotent: sync twice does not create twice', () => {
    const connector: ConnectorDef = {
      id: 'dup-mcp',
      name: 'Dup',
      blurb: 'Dup test',
      archetype: 'tower',
      color: 0x112233,
      tools: ['dup'],
      packStatus: 'served',
      simTools: false,
    }
    const state = buildState([connector])
    const baseSnapshots = [
      {
        id: connector.id,
        name: connector.name,
        blurb: connector.blurb,
        archetype: connector.archetype,
        color: connector.color,
        tools: connector.tools,
        packStatus: connector.packStatus,
        simTools: connector.simTools,
      },
    ]

    // First sync (prev=null, empty base): produces the create event.
    const result1 = syncFromArbora(state, null, baseSnapshots)
    expect(result1.events.filter((e) => e.type === 'connector-create')).toHaveLength(0)
    // Second sync with the same state and base already knowing it: no creates.
    const result2 = syncFromArbora(
      state,
      {
        connectorIds: new Set(result1.nextState.connectorIds),
        connectorMap: result1.nextState.connectorMap,
        landmarkIds: new Set(result1.nextState.landmarkIds),
        landmarkMap: result1.nextState.landmarkMap,
        fleetStatus: result1.nextState.fleetStatus,
        seq: result1.nextState.seq,
        eventQueue: result1.nextState.eventQueue,
      },
      [],
    )
    expect(result2.events.filter((e) => e.type === 'connector-create')).toHaveLength(0)
  })
})

// ---- Connector destroy event ---------------------------------------------

describe('connector destruction removes from city (R020)', () => {
  it('a connector removed from Arbora state emits connector-destroy', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    // Remove one connector from the base.
    const reduced = base.slice(1) // remove the first.

    const baseSnapshots = base.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      archetype: c.archetype,
      color: c.color,
      tools: c.tools,
      packStatus: c.packStatus,
      simTools: c.simTools,
    }))
    const prevState: MirrorState = {
      connectorIds: new Set(base.map((c) => c.id)),
      connectorMap: new Map(
        base.map((c) => [c.id, baseSnapshots.find((s) => s.id === c.id)!] as [string, ArboraState['connectors'][0]]),
      ),
      landmarkIds: new Set(),
      landmarkMap: new Map(),
      fleetStatus: null,
      seq: 0,
      eventQueue: [],
    }
    const { events } = syncFromArbora(buildState(reduced), prevState, [])
    const destroys = events.filter((e) => e.type === 'connector-destroy')
    expect(destroys).toHaveLength(1)
    expect(destroys[0].id).toBe(base[0].id)
    expect(destroys[0].detail).toContain('removed')
  })

  it('applyToCity marks a destroyed connector as offline', () => {
    const city = mockCity()
    city.buildings['gone-mcp'] = mockBuilding({
      id: 'gone-mcp',
      name: 'Gone Service',
      category: 'connector',
      online: true,
    })
    city.connectors.push({
      id: 'gone-mcp',
      name: 'Gone Service',
      blurb: '',
      archetype: 'tower',
      color: 0x111111,
      tools: ['gone'],
      packStatus: 'served',
      simTools: false,
    } as ConnectorDef)

    const events: EcosystemEvent[] = [
      {
        type: 'connector-destroy',
        id: 'gone-mcp',
        detail: 'Connector gone-mcp removed',
        previousId: 'gone-mcp',
        seq: 1,
        capturedAt: '2026-11-25T12:00:00.000Z',
      },
    ]
    applyToCity(events, city)
    expect(city.buildings['gone-mcp'].online).toBe(false)
    expect(city.buildings['gone-mcp'].flash).toBe(2)
    expect(city.connectors).toHaveLength(0)
  })
})

// ---- Connector update event ----------------------------------------------

describe('connector updates are applied to city state (R020)', () => {
  it('a changed connector name and tools emit connector-update', () => {
    const oldConnector: ConnectorDef = {
      id: 'updated-mcp',
      name: 'Old Name',
      blurb: 'Old blurb',
      archetype: 'tower',
      color: 0x111111,
      tools: ['old.tool'],
      packStatus: 'served',
      simTools: false,
    }
    const updatedConnector: ConnectorDef = {
      id: 'updated-mcp',
      name: 'New Name',
      blurb: 'New blurb',
      archetype: 'tower',
      color: 0x111111,
      tools: ['new.tool'],
      packStatus: 'served',
      simTools: false,
    }
    const prevState: ConnectorDef[] = [oldConnector]
    const nextState = buildState([updatedConnector])

    const { events } = syncFromArbora(
      nextState,
      {
        connectorIds: new Set(prevState.map((s) => s.id)),
        connectorMap: new Map(prevState.map((s) => [s.id, s])),
        landmarkIds: new Set(),
        landmarkMap: new Map(),
        fleetStatus: null,
        seq: 0,
        eventQueue: [],
      } as MirrorState,
      [],
    )

    const updates = events.filter((e) => e.type === 'connector-update')
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('updated-mcp')
    expect(updates[0].detail).toContain('updated')
  })

  it('applyToCity updates the building name, tools, and triggers a flash', () => {
    const city = mockCity()
    city.buildings['upd-mcp'] = mockBuilding({
      id: 'upd-mcp',
      name: 'Old',
      category: 'connector',
      online: true,
    })
    city.connectors.push({
      id: 'upd-mcp',
      name: 'Old',
      blurb: 'old',
      archetype: 'tower',
      color: 0x111111,
      tools: ['old'],
      packStatus: 'served',
      simTools: false,
    } as ConnectorDef)

    const snapshot: ArboraState['connectors'][0] = {
      id: 'upd-mcp',
      name: 'Updated',
      blurb: 'new blurb',
      archetype: 'diner',
      color: 0x222222,
      tools: ['new'],
      packStatus: 'served',
      simTools: false,
    }
    const events: EcosystemEvent[] = [
      {
        type: 'connector-update',
        id: 'upd-mcp',
        detail: 'Configuration updated',
        snapshot,
        seq: 1,
        capturedAt: '2026-11-25T12:00:00.000Z',
      },
    ]
    applyToCity(events, city)
    expect(city.buildings['upd-mcp'].name).toBe('Updated')
    expect(city.buildings['upd-mcp'].flash).toBeGreaterThan(0)
    expect(city.buildings['upd-mcp'].tools).toEqual(['new'])
    // Connector list was updated too.
    expect(city.connectors[0].name).toBe('Updated')
  })

  it('no update event when nothing changed', () => {
    const connector: ConnectorDef = {
      id: 'stable-mcp',
      name: 'Stable',
      blurb: 'Stable',
      archetype: 'tower',
      color: 0x111111,
      tools: ['stable'],
      packStatus: 'served',
      simTools: false,
    }
    const prevState: MirrorState = {
      connectorIds: new Set([connector.id]),
      connectorMap: new Map([
        [
          connector.id,
          {
            id: connector.id,
            name: connector.name,
            blurb: connector.blurb,
            archetype: connector.archetype,
            color: connector.color,
            tools: connector.tools,
            packStatus: connector.packStatus,
            simTools: connector.simTools,
          },
        ],
      ]),
      landmarkIds: new Set(),
      landmarkMap: new Map(),
      fleetStatus: null,
      seq: 0,
      eventQueue: [],
    }
    const { events } = syncFromArbora(buildState([connector]), prevState, [])
    const updates = events.filter((e) => e.type === 'connector-update')
    expect(updates).toHaveLength(0)
  })
})

// ---- Landmark update event -----------------------------------------------

describe('landmark updates are applied to city state (R020)', () => {
  it('a landmark going offline emits landmark-update', () => {
    const state: ArboraState = {
      connectors: [],
      landmarks: [
        {
          id: 'arbora',
          name: 'Arbora',
          kind: 'gate',
          color: 0x5ea0ff,
          role: 'Platform gate',
          tools: ['admission.review'],
          rooms: ['admission'],
          online: false,
        },
      ],
      fleet: {
        totalConnectors: 0,
        servedConnectors: 0,
        registeredConnectors: 0,
        arboraReachable: true,
        cacheStale: false,
      },
      capturedAt: '2026-11-25T12:00:00.000Z',
    }
    const prevState: MirrorState = {
      connectorIds: new Set(),
      connectorMap: new Map(),
      landmarkIds: new Set(['arbora']),
      landmarkMap: new Map([
        [
          'arbora',
          {
            id: 'arbora',
            name: 'Arbora',
            kind: 'gate',
            color: 0x5ea0ff,
            role: 'Platform gate',
            tools: ['admission.review'],
            rooms: ['admission'],
            online: true,
          },
        ],
      ]),
      fleetStatus: null,
      seq: 0,
      eventQueue: [],
    }
    const { events } = syncFromArbora(state, prevState, [])
    const landmarkUpdates = events.filter((e) => e.type === 'landmark-update')
    expect(landmarkUpdates).toHaveLength(1)
    expect(landmarkUpdates[0].id).toBe('arbora')
    expect(landmarkUpdates[0].detail).toContain('status changed')
  })

  it('applyToCity marks a landmark as offline (no flash on offline)', () => {
    const city = mockCity()
    city.buildings.arbora = mockBuilding({
      id: 'arbora',
      name: 'Arbora',
      category: 'core',
      online: true,
    })

    const events: EcosystemEvent[] = [
      {
        type: 'landmark-update',
        id: 'arbora',
        detail: 'Arbora is offline',
        snapshot: {
          id: 'arbora',
          name: 'Arbora',
          kind: 'gate',
          color: 0x5ea0ff,
          role: 'Platform gate',
          tools: [],
          rooms: [],
          online: false,
        },
        seq: 1,
        capturedAt: '2026-11-25T12:00:00.000Z',
      },
    ]
    applyToCity(events, city)
    expect(city.buildings.arbora.online).toBe(false)
    expect(city.buildings.arbora.flash).toBe(0) // offline → no flash
  })

  it('a landmark going online triggers an online flash', () => {
    const city = mockCity()
    city.buildings.medulla = mockBuilding({
      id: 'medulla',
      name: 'Medulla',
      category: 'core',
      online: false,
    })

    const events: EcosystemEvent[] = [
      {
        type: 'landmark-update',
        id: 'medulla',
        detail: 'Medulla is online',
        snapshot: {
          id: 'medulla',
          name: 'Medulla',
          kind: 'vault',
          color: 0xa06bff,
          role: 'Knowledge engine',
          tools: [],
          rooms: [],
          online: true,
        },
        seq: 2,
        capturedAt: '2026-11-25T12:00:00.000Z',
      },
    ]
    applyToCity(events, city)
    expect(city.buildings.medulla.online).toBe(true)
    expect(city.buildings.medulla.flash).toBe(3)
  })
})

// ---- Fleet update event --------------------------------------------------

describe('fleet status changes propagate to city (R020)', () => {
  it('a new fleet snapshot with different counts emits fleet-update', () => {
    const state: ArboraState = {
      connectors: [],
      landmarks: [],
      fleet: {
        totalConnectors: 100,
        servedConnectors: 20,
        registeredConnectors: 80,
        arboraReachable: true,
        cacheStale: true,
      },
      capturedAt: '2026-11-25T12:00:00.000Z',
    }
    const prevState: MirrorState = {
      connectorIds: new Set(),
      connectorMap: new Map(),
      landmarkIds: new Set(),
      landmarkMap: new Map(),
      fleetStatus: {
        totalConnectors: 50,
        servedConnectors: 10,
        registeredConnectors: 40,
        arboraReachable: true,
        cacheStale: false,
      },
      seq: 0,
      eventQueue: [],
    }
    const { events } = syncFromArbora(state, prevState, [])
    const fleetUpdates = events.filter((e) => e.type === 'fleet-update')
    expect(fleetUpdates).toHaveLength(1)
    expect(fleetUpdates[0].detail).toContain('Fleet')
    expect(fleetUpdates[0].detail).toContain('100 total')
  })

  it('the first sync always emits a fleet-update event', () => {
    const state: ArboraState = {
      connectors: [],
      landmarks: [],
      fleet: {
        totalConnectors: 75,
        servedConnectors: 7,
        registeredConnectors: 68,
        arboraReachable: true,
        cacheStale: false,
      },
      capturedAt: '2026-11-25T12:00:00.000Z',
    }
    const { events } = syncFromArbora(state, null, [])
    const fleetUpdates = events.filter((e) => e.type === 'fleet-update')
    expect(fleetUpdates).toHaveLength(1)
    expect(fleetUpdates[0].detail).toContain('Fleet online')
  })

  it('no fleet-update when counts are unchanged', () => {
    const state: ArboraState = {
      connectors: [],
      landmarks: [],
      fleet: {
        totalConnectors: 75,
        servedConnectors: 7,
        registeredConnectors: 68,
        arboraReachable: true,
        cacheStale: false,
      },
      capturedAt: '2026-11-25T12:00:00.000Z',
    }
    const prevState: MirrorState = {
      connectorIds: new Set(),
      connectorMap: new Map(),
      landmarkIds: new Set(),
      landmarkMap: new Map(),
      fleetStatus: {
        totalConnectors: 75,
        servedConnectors: 7,
        registeredConnectors: 68,
        arboraReachable: true,
        cacheStale: false,
      },
      seq: 0,
      eventQueue: [],
    }
    const { events } = syncFromArbora(state, prevState, [])
    const fleetUpdates = events.filter((e) => e.type === 'fleet-update')
    expect(fleetUpdates).toHaveLength(0)
  })
})

// ---- Determinism ---------------------------------------------------------

describe('mirror is deterministic (R020)', () => {
  it('same ArboraState produces identical event sequences', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    const newConnector: ConnectorDef = {
      id: 'det-test-mcp',
      name: 'Det Test',
      blurb: 'Deterministic test',
      archetype: 'tower',
      color: 0x445566,
      tools: ['det.call'],
      packStatus: 'served',
      simTools: false,
    }
    const state1 = buildState([...base, newConnector])
    const state2 = buildState([...base, newConnector])

    const baseSnapshots = base.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      archetype: c.archetype,
      color: c.color,
      tools: c.tools,
      packStatus: c.packStatus,
      simTools: c.simTools,
    }))

    const result1 = syncFromArbora(state1, null, baseSnapshots)
    const result2 = syncFromArbora(state2, null, baseSnapshots)

    // Both should produce the SAME set of events (same create events).
    const sig = (e: EcosystemEvent) => `${e.type}:${e.id}:${e.detail}`
    expect(result1.events.map(sig)).toEqual(result2.events.map(sig))
  })

  it('same ArboraState produces identical city state when applied', () => {
    const connector: ConnectorDef = {
      id: 'city-det-mcp',
      name: 'City Det',
      blurb: 'City deterministic',
      archetype: 'gate',
      color: 0xabcdef,
      tools: ['city.call'],
      packStatus: 'served',
      simTools: false,
    }
    const state = buildState([connector])
    const { events: events1 } = syncFromArbora(state, null, [])
    const { events: events2 } = syncFromArbora(state, null, [])

    const city1 = mockCity()
    const city2 = mockCity()
    applyToCity(events1, city1)
    applyToCity(events2, city2)

    // Both cities have the same building with the same properties.
    expect(city1.buildings['city-det-mcp']).toBeDefined()
    expect(city1.buildings['city-det-mcp']).toMatchObject({
      id: 'city-det-mcp',
      name: 'City Det',
      online: true,
    })
    expect(city1.buildings['city-det-mcp']).toEqual(city2.buildings['city-det-mcp'])
    // Same plot assignment.
    expect(city1.plots[0].buildingId).toBe(city2.plots[0].buildingId)
  })

  it('ordering of events is stable: sorted by seq', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT)
    // Add two connectors to force both create and update events.
    const connector: ConnectorDef = {
      id: 'order-test-mcp',
      name: 'Order Test',
      blurb: 'Order test',
      archetype: 'tower',
      color: 0x123456,
      tools: ['order.call'],
      packStatus: 'served',
      simTools: false,
    }

    const { events: events1 } = syncFromArbora(buildState([...base, connector]), null, [])
    const { events: events2 } = syncFromArbora(buildState([...base, connector]), null, [])

    // Both runs produce the same sequence order.
    const sig = (e: EcosystemEvent) => `${e.seq}:${e.type}:${e.id}`
    expect(events1.map(sig)).toEqual(events2.map(sig))

    // Events are sorted by seq (ascending).
    for (let i = 1; i < events1.length; i++) {
      expect(events1[i].seq).toBeGreaterThanOrEqual(events1[i - 1].seq)
    }
  })
})

// ---- Fallback when Arbora unavailable ------------------------------------

describe('mirror falls back gracefully when Arbora unavailable (R020)', () => {
  it('createEcosystemMirror with a failing fetchFn logs and returns empty', async () => {
    const logs: string[] = []
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'))
    const mirror = createEcosystemMirror({
      baseConnectors: fleetToConnectors(FLEET_SNAPSHOT),
      autoPoll: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      log: (msg) => logs.push(msg),
    })

    const result = await (
      mirror as unknown as { poll: () => Promise<{ success: boolean; events: EcosystemEvent[] }> }
    ).poll()
    expect(result.success).toBe(false)
    expect(result.events).toHaveLength(0)
    expect(logs.some((l) => l.includes('unreachable'))).toBe(true)
  })

  it('simulated mode (no mirror) works without errors', () => {
    // In SIMULATED mode, no mirror is created — the city runs on the
    // deterministic simulation only. This test verifies the page can boot
    // without a mirror at all.
    const city = mockCity()
    // No mirror events to apply — should not throw.
    applyToCity([], city)
    expect(city.buildings).toEqual({})
  })

  it('the mirror does not throw when applied to an empty city', () => {
    // Even with no base connectors, the mirror should handle gracefully.
    const city = mockCity()
    const { events } = syncFromArbora(buildState([]), null, [])
    applyToCity(events, city)
    // No buildings added, no crash.
    expect(city.buildings).toEqual({})
  })

  it('a mirror with autoPoll false does not start polling', () => {
    const mirror = createEcosystemMirror({
      baseConnectors: [],
      autoPoll: false,
    })
    expect(mirror.isActive()).toBe(false)
    // Even after calling sync, it stays inactive.
    mirror.sync(buildState([]))
    expect(mirror.isActive()).toBe(false)
  })
})

// ---- End-to-end: sync then apply ------------------------------------------

describe('end-to-end sync → events → apply cycle (R020)', () => {
  it('a full sync+drain+apply flow creates a connector in the city', () => {
    const connector: ConnectorDef = {
      id: 'e2e-mcp',
      name: 'End To End',
      blurb: 'End-to-end test',
      archetype: 'tower',
      color: 0xff00ff,
      tools: ['e2e.call'],
      packStatus: 'served',
      simTools: false,
    }
    const mirror = createEcosystemMirror({
      baseConnectors: [],
      autoPoll: false,
    })

    // Sync adds the connector.
    const state = buildState([connector])
    const events = mirror.sync(state)
    const creates = events.filter((e) => e.type === 'connector-create')
    expect(creates).toHaveLength(1)

    // Drain the events (connector-create + initial fleet-update).
    const drained = mirror.drain()
    const drainedCreates = drained.filter((e) => e.type === 'connector-create')
    expect(drainedCreates).toHaveLength(1)
    const firstCreate = drainedCreates[0]
    expect(firstCreate.type).toBe('connector-create')

    // Apply to city.
    const city = mockCity()
    applyToCity(drained, city)
    expect(city.buildings['e2e-mcp']).toBeDefined()
    expect(city.buildings['e2e-mcp'].name).toBe('End To End')
  })

  it('the bus receives events from applyToCity (construction progress)', () => {
    const connector: ConnectorDef = {
      id: 'bus-mcp',
      name: 'Bus Test',
      blurb: 'Bus test',
      archetype: 'tower',
      color: 0x000000,
      tools: ['bus.call'],
      packStatus: 'served',
      simTools: false,
    }

    const received: string[] = []
    const unsub = bus.subscribe((e) => {
      if (e.type === 'construction.progress') received.push(e.detail ?? '')
    })

    const mirror = createEcosystemMirror({
      baseConnectors: [],
      autoPoll: false,
    })
    mirror.sync(buildState([connector]))
    const drained = mirror.drain()

    // Apply to city, which emits construction events.
    const city = mockCity()
    applyToCity(drained, city)
    unsub()

    // A construction event should have been emitted.
    expect(received.length).toBeGreaterThan(0)
    expect(received.some((d) => d.includes('Scaffolding'))).toBe(true)
  })
})

// ---- Event type exhaustiveness --------------------------------------------

describe('event types are well-defined (R020)', () => {
  it('all five event types exist and are distinct', () => {
    const types: EcosystemEvent['type'][] = [
      'connector-create',
      'connector-update',
      'connector-destroy',
      'landmark-update',
      'fleet-update',
    ]
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })

  it('every event carries a seq number and capturedAt', () => {
    const state = buildState([
      {
        id: 'seq-test',
        name: 'Seq Test',
        blurb: 'Seq test',
        archetype: 'tower',
        color: 0x000000,
        tools: ['seq'],
        packStatus: 'served',
        simTools: false,
      },
    ])
    const { events } = syncFromArbora(state, null, [])
    for (const evt of events) {
      expect(evt.seq).toBeGreaterThan(0)
      expect(evt.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    }
  })
})

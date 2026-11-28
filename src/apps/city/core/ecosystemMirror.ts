// Live ecosystem mirroring — real-time sync between Arbora's ecosystem state
// and the city visualisation (OVERSTORY-CITY-R020).
//
// The mirror sits on top of the base ecosystem data (CORE_LANDMARKS,
// CONNECTOR_DISTRICT, fleetToConnectors). Arbora state supersedes base data
// when present. Changes are queued as deterministic events, replayed
// identically across runs.

// spec: OVERSTORY-CITY-R020

import { CORE_LANDMARKS, type ConnectorDef } from './ecosystem'
import { bus, makeEvent } from './events'
import { plotDoor } from './layout'
import type { Plot } from './sim'

// ---- ArboraState: the shape of live data from Arbora --------------------

export interface ConnectorSnapshot {
  id: string
  name: string
  blurb: string
  archetype: string
  color: number
  tools: string[]
  packStatus: 'served' | 'registered_unpublished'
  simTools: boolean
}

export interface LandmarkSnapshot {
  id: string
  name: string
  kind: string
  color: number
  role: string
  tools: string[]
  rooms: string[]
  /** Whether the landmark is currently online (from Arbora status). */
  online: boolean
}

export interface FleetStatusSnapshot {
  /** Total connector count reported by Arbora. */
  totalConnectors: number
  /** Served (online) connector count. */
  servedConnectors: number
  /** Registered but unpublished connector count. */
  registeredConnectors: number
  /** Arbora reachability from the city host. */
  arboraReachable: boolean
  /** Whether the fleet cache is stale. */
  cacheStale: boolean
}

export interface ArboraState {
  /** Connector catalog (fleet.read equivalent). */
  connectors: ConnectorSnapshot[]
  /** Core platform components with live online status. */
  landmarks: LandmarkSnapshot[]
  /** Fleet / status summary. */
  fleet: FleetStatusSnapshot
  /** Timestamp of this snapshot (ISO string). */
  capturedAt: string
}

// ---- EcosystemEvent types (R020) ----------------------------------------

export type EcosystemEventType =
  'connector-create' | 'connector-update' | 'connector-destroy' | 'landmark-update' | 'fleet-update'

export interface EcosystemEvent {
  type: EcosystemEventType
  /** Connector / landmark id (type-dependent). */
  id?: string
  /** Human-readable description. */
  detail: string
  /** Snapshot of the affected resource (present for create/update). */
  snapshot?: ConnectorSnapshot | LandmarkSnapshot
  /** Previous state id for cross-reference (destroy). */
  previousId?: string
  /** Monotonic sequence number for deterministic ordering. */
  seq: number
  /** Arbora capturedAt this event derives from. */
  capturedAt: string
}

// ---- Internal mirror state -----------------------------------------------

export interface MirrorState {
  /** Last seen connector ids (deterministic lookup key). */
  connectorIds: Set<string>
  /** Last seen connector snapshots keyed by id. */
  connectorMap: Map<string, ConnectorSnapshot>
  /** Last seen landmark ids. */
  landmarkIds: Set<string>
  /** Last seen landmark snapshots keyed by id. */
  landmarkMap: Map<string, LandmarkSnapshot>
  /** Last known fleet status. */
  fleetStatus: FleetStatusSnapshot | null
  /** Monotonic sequence counter. */
  seq: number
  /** Buffered events not yet consumed. */
  eventQueue: EcosystemEvent[]
}

// ---- applyToCity: mutate the city simulation from events -----------------

/**
 * Apply ecosystem events to the city world state (R020).
 * The connector-create case places a new connector on the next available plot.
 * connector-destroy removes the building (used during rollback/sync).
 * connector-update mutates the building's properties.
 * landmark-update updates the landmark's online status.
 * fleet-update updates the world connectors list.
 */
export function applyToCity(
  events: EcosystemEvent[],
  city: {
    buildings: Record<string, import('./sim').Building>
    plots: import('./sim').Plot[]
    connectors: ConnectorDef[]
    overflow: ConnectorDef[]
  },
): void {
  for (const evt of events) {
    switch (evt.type) {
      case 'connector-create': {
        const snap = evt.snapshot as ConnectorSnapshot | undefined
        if (!snap) continue
        const def: ConnectorDef = {
          id: snap.id,
          name: snap.name,
          blurb: snap.blurb,
          archetype: snap.archetype,
          color: snap.color,
          tools: snap.tools.length ? snap.tools : ['ingest', 'query', 'sync'],
          packStatus: snap.packStatus,
          simTools: snap.simTools,
        }
        // Check if already present (idempotent).
        if (snap.id in city.buildings || city.connectors.find((c) => c.id === snap.id)) continue
        // Find the next available plot.
        const plot = city.plots.find((p) => !p.buildingId && !p.construction)
        if (!plot) {
          city.overflow.push(def)
          bus.emit(
            makeEvent('task.queued', {}, `New connector ${snap.id} outgrew the district — queued for expansion`),
          )
          continue
        }
        placeConnector(def, plot, city)
        break
      }
      case 'connector-update': {
        const snap = evt.snapshot as ConnectorSnapshot | undefined
        if (!snap || !(snap.id in city.buildings)) continue
        const building = city.buildings[snap.id]
        building.name = snap.name
        building.blurb = snap.blurb
        building.tools = snap.tools.length ? snap.tools : ['ingest', 'query', 'sync']
        building.packStatus = snap.packStatus
        building.simTools = snap.simTools
        building.served = snap.packStatus === 'served'
        building.fresh = 300 // brief "updated" flash
        building.flash = 1
        // Update the connectors list.
        const idx = city.connectors.findIndex((c) => c.id === snap.id)
        if (idx >= 0) {
          city.connectors[idx] = {
            id: snap.id,
            name: snap.name,
            blurb: snap.blurb,
            archetype: snap.archetype,
            color: snap.color,
            tools: building.tools,
            packStatus: snap.packStatus,
            simTools: snap.simTools,
          }
        }
        bus.emit(makeEvent('connector.joined', { building: snap.id }, `${snap.name} updated its configuration`))
        break
      }
      case 'connector-destroy': {
        if (!evt.id) continue
        if (!(evt.id in city.buildings)) continue
        const building = city.buildings[evt.id]
        // Mark as offline (we don't fully delete — the plot should stay).
        building.online = false
        building.flash = 2
        const idx = city.connectors.findIndex((c) => c.id === evt.id)
        if (idx >= 0) city.connectors.splice(idx, 1)
        bus.emit(makeEvent('task.failed', { building: evt.id }, `${building.name} disconnected from the fleet`))
        break
      }
      case 'landmark-update': {
        const snap = evt.snapshot as LandmarkSnapshot | undefined
        if (!snap || !(snap.id in city.buildings)) continue
        const building = city.buildings[snap.id]
        building.online = snap.online
        if (snap.online) {
          building.flash = 3
        }
        bus.emit(
          makeEvent(
            snap.online ? 'connector.joined' : 'task.failed',
            { building: snap.id },
            `${snap.name} is ${snap.online ? 'online' : 'offline'}`,
          ),
        )
        break
      }
      case 'fleet-update': {
        // fleet-update is informational; the connectors list is updated
        // through connector-create/destroy events derived from the catalog.
        break
      }
    }
  }
}

/**
 * Place a connector on a plot (mirrors sim.placeConnector without requiring
 * the full sim module import).
 */
function placeConnector(
  def: ConnectorDef,
  plot: Plot,
  city: {
    buildings: Record<string, import('./sim').Building>
    plots: Plot[]
  },
): void {
  const building: import('./sim').Building = {
    id: def.id,
    name: def.name,
    category: 'connector',
    role: def.blurb,
    tools: def.tools.length ? def.tools : ['ingest', 'query', 'sync'],
    rooms: def.tools.length ? def.tools.slice(0, 3) : ['main'],
    color: def.color,
    kind: def.archetype,
    x: plot.x,
    z: plot.z,
    w: 5.6,
    d: 5.6,
    online: true,
    visits: 0,
    fresh: 900,
    flash: 0,
    served: def.packStatus === 'served',
    packStatus: def.packStatus,
    blurb: def.blurb,
    toolCount: def.tools.length,
    door: plotDoor(plot),
    rot: 0,
    derivedPlot: null,
    access: plot.access,
    simTools: def.simTools,
  }
  city.buildings[def.id] = building
  plot.buildingId = def.id
  plot.construction = { connectorId: def.id, progress: 0, lastMilestone: 0 }
  bus.emit(makeEvent('construction.progress', { building: def.id }, `Scaffolding raised at ${def.name}`))
}

// ---- Diff engine: detect changes between two ArboraState snapshots -------

/**
 * Diff two ArboraState snapshots and emit a deterministic sequence of
 * EcosystemEvent (R020). The sequence is sorted by connector id (stable),
 * so the same ArboraState always yields the same city state.
 */
function diffState(
  prev: MirrorState | null,
  next: ArboraState,
  seq: number,
): { events: EcosystemEvent[]; nextSeq: number } {
  const events: EcosystemEvent[] = []
  let currentSeq = seq

  const newIds = new Set(next.connectors.map((c) => c.id))
  const prevIds = prev?.connectorIds ?? new Set()

  // Connector creates: ids in next but not in prev.
  for (const id of newIds) {
    if (!prevIds.has(id)) {
      currentSeq++
      events.push({
        type: 'connector-create',
        id,
        detail: `New connector ${id} detected`,
        snapshot: next.connectors.find((c) => c.id === id)!,
        seq: currentSeq,
        capturedAt: next.capturedAt,
      })
    }
  }

  // Connector destroys: ids in prev but not in next.
  if (prev) {
    for (const id of prevIds) {
      if (!newIds.has(id)) {
        currentSeq++
        events.push({
          type: 'connector-destroy',
          id,
          detail: `Connector ${id} removed`,
          previousId: id,
          seq: currentSeq,
          capturedAt: next.capturedAt,
        })
      }
    }
  }

  // Connector updates: ids in both, check if content changed.
  if (prev) {
    for (const id of newIds) {
      if (prevIds.has(id)) {
        const prevSnap = prev.connectorMap.get(id)
        const nextSnap = next.connectors.find((c) => c.id === id)
        if (prevSnap && nextSnap && connectorChanged(prevSnap, nextSnap)) {
          currentSeq++
          events.push({
            type: 'connector-update',
            id,
            detail: `${id} configuration updated`,
            snapshot: nextSnap,
            seq: currentSeq,
            capturedAt: next.capturedAt,
          })
        }
      }
    }
  }

  // Landmark updates.
  const prevLandmarkIds = prev?.landmarkIds ?? new Set()

  for (const lm of next.landmarks) {
    if (prev && prevLandmarkIds.has(lm.id)) {
      const prevLm = prev.landmarkMap.get(lm.id)
      if (prevLm && landmarkChanged(prevLm, lm)) {
        currentSeq++
        events.push({
          type: 'landmark-update',
          id: lm.id,
          detail: `${lm.name} status changed`,
          snapshot: lm,
          seq: currentSeq,
          capturedAt: next.capturedAt,
        })
      }
    }
  }

  // Fleet updates.
  if (prev?.fleetStatus) {
    const fs = next.fleet
    if (
      fs.totalConnectors !== prev.fleetStatus.totalConnectors ||
      fs.servedConnectors !== prev.fleetStatus.servedConnectors ||
      fs.registeredConnectors !== prev.fleetStatus.registeredConnectors ||
      fs.arboraReachable !== prev.fleetStatus.arboraReachable
    ) {
      currentSeq++
      events.push({
        type: 'fleet-update',
        detail: `Fleet: ${fs.totalConnectors} total, ${fs.servedConnectors} served, ${fs.registeredConnectors} registered`,
        seq: currentSeq,
        capturedAt: next.capturedAt,
      })
    }
  } else {
    // First sync — emit fleet update.
    currentSeq++
    events.push({
      type: 'fleet-update',
      detail: `Fleet online: ${next.fleet.totalConnectors} total, ${next.fleet.servedConnectors} served`,
      seq: currentSeq,
      capturedAt: next.capturedAt,
    })
  }

  // Sort by seq for deterministic ordering.
  events.sort((a, b) => a.seq - b.seq)

  return { events, nextSeq: currentSeq }
}

/** Compare two connector snapshots for changes. */
function connectorChanged(a: ConnectorSnapshot, b: ConnectorSnapshot): boolean {
  if (a.packStatus !== b.packStatus) return true
  if (a.name !== b.name) return true
  if (a.blurb !== b.blurb) return true
  if (a.tools.length !== b.tools.length) return true
  for (let i = 0; i < a.tools.length; i++) {
    if (a.tools[i] !== b.tools[i]) return true
  }
  return false
}

/** Compare two landmark snapshots for changes. */
function landmarkChanged(a: LandmarkSnapshot, b: LandmarkSnapshot): boolean {
  if (a.online !== b.online) return true
  if (a.name !== b.name) return true
  return false
}

// ---- syncFromArbora: convert an ArboraState to EcosystemEvents ----------

/**
 * Convert an ArboraState to a deterministic sequence of EcosystemEvent.
 * Uses the previous state (if any) to diff and only emit changes.
 * The base ecosystem data (fleetToConnectors from FLEET_SNAPSHOT) serves
 * as the initial state so the first sync emits only *new* connectors.
 */
export function syncFromArbora(
  state: ArboraState,
  prev: MirrorState | null,
  baseConnectors: ConnectorSnapshot[] | null,
): { events: EcosystemEvent[]; nextState: MirrorState } {
  // If no previous state, use the base connectors as initial.
  let effectivePrev: MirrorState | null = prev
  if (!effectivePrev && baseConnectors) {
    effectivePrev = {
      connectorIds: new Set(baseConnectors.map((c) => c.id)),
      connectorMap: new Map(baseConnectors.map((c) => [c.id, c])),
      landmarkIds: new Set(CORE_LANDMARKS.map((l) => l.id)),
      landmarkMap: new Map(CORE_LANDMARKS.map((l) => [l.id, { ...l, online: true, rooms: l.rooms, tools: l.tools }])),
      fleetStatus: null,
      seq: 0,
      eventQueue: [],
    }
  }

  const { events, nextSeq } = diffState(effectivePrev, state, effectivePrev?.seq ?? 0)

  // Build the next mirror state.
  const nextState: MirrorState = {
    connectorIds: new Set(state.connectors.map((c) => c.id)),
    connectorMap: new Map(state.connectors.map((c) => [c.id, c])),
    landmarkIds: new Set(state.landmarks.map((l) => l.id)),
    landmarkMap: new Map(state.landmarks.map((l) => [l.id, l])),
    fleetStatus: state.fleet,
    seq: nextSeq,
    eventQueue: [],
  }

  return { events, nextState }
}

// ---- EcosystemMirror interface (R020) ------------------------------------

export interface EcosystemMirror {
  /** Sync the mirror against a new ArboraState snapshot. Returns events. */
  sync(state: ArboraState): EcosystemEvent[]
  /** Peek at buffered events without draining. */
  events(): EcosystemEvent[]
  /** Drain and return all buffered events. */
  drain(): EcosystemEvent[]
  /** Reset the mirror to its initial state. */
  reset(): void
  /** Whether the mirror is active (LIVE mode). */
  isActive(): boolean
  /** Start auto-polling (LIVE mode only). */
  startPolling(): void
  /** Stop auto-polling. */
  stopPolling(): void
}

// ---- createEcosystemMirror factory (R020) --------------------------------

/**
 * Create a live ecosystem mirror that polls Arbora and mirrors changes
 * into the city simulation (OVERSTORY-CITY-R020).
 *
 * @param options - Configuration for the mirror.
 * @returns An EcosystemMirror instance.
 */
export function createEcosystemMirror(options: {
  /** Poll interval in milliseconds (default 3000). */
  pollIntervalMs?: number
  /** Base connectors to use as initial state (from FLEET_SNAPSHOT via fleetToConnectors). */
  baseConnectors: ConnectorDef[]
  /** Whether to auto-poll (default true). */
  autoPoll?: boolean
  /** Optional fetch implementation for Arbora API calls. */
  fetchFn?: typeof fetch
  /** Optional log function for fallback logging. */
  log?: (msg: string) => void
}): EcosystemMirror {
  const {
    pollIntervalMs = 3000,
    baseConnectors,
    autoPoll: _autoPoll = true,
    fetchFn = fetch,
    log = console.log,
  } = options

  // Convert base connectors to snapshot form for the initial state.
  const baseSnapshots: ConnectorSnapshot[] = baseConnectors.map((c) => ({
    id: c.id,
    name: c.name,
    blurb: c.blurb,
    archetype: c.archetype,
    color: c.color,
    tools: c.tools,
    packStatus: c.packStatus,
    simTools: c.simTools,
  }))

  let state: MirrorState | null = null
  let timerId: ReturnType<typeof setInterval> | null = null
  let active = false

  /** Build an ArboraState from the fleet/status API responses. */
  function buildArboraState(
    servers: import('./ecosystem').FleetServer[],
    status?: { reachable: boolean; served: number; registered: number },
    cacheStale?: boolean,
  ): ArboraState {
    const connectors: ConnectorSnapshot[] = servers
      .filter((s) => s.server !== 'arbora')
      .map((s) => ({
        id: s.server,
        name: s.server
          .replace(/-mcp$|_agent$|^mcp-/, '')
          .split(/[-_]/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        blurb: s.packStatus === 'served' ? `${s.toolCount} served tools` : 'Registered — not yet published',
        archetype: 'connector',
        color: 0x5b8def,
        tools: s.tools.length ? s.tools : ['ingest', 'query', 'sync'],
        packStatus: s.packStatus,
        simTools: s.tools.length === 0,
      }))

    const landmarkSnapshots: LandmarkSnapshot[] = CORE_LANDMARKS.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      color: l.color,
      role: l.role,
      tools: l.tools,
      rooms: l.rooms,
      online: true,
    }))

    return {
      connectors,
      landmarks: landmarkSnapshots,
      fleet: {
        totalConnectors: connectors.length,
        servedConnectors: connectors.filter((c) => c.packStatus === 'served').length,
        registeredConnectors: connectors.filter((c) => c.packStatus === 'registered_unpublished').length,
        arboraReachable: status?.reachable ?? true,
        cacheStale: cacheStale ?? false,
      },
      capturedAt: new Date().toISOString(),
    }
  }

  /**
   * Poll Arbora for current state. Returns { events, success } where
   * success is false when Arbora is unreachable (fallback path).
   */
  async function poll(): Promise<{ events: EcosystemEvent[]; success: boolean }> {
    let servers: import('./ecosystem').FleetServer[] = []
    let statusInfo: { reachable: boolean; served: number; registered: number } | undefined
    let cacheStale = false

    try {
      const [fleetRes, statusRes] = await Promise.all([
        fetchFn('/api/apps/city/fleet').then(
          (r) =>
            r.json() as {
              servers?: { server: string; toolCount?: number; tools?: string[] }[]
              cache?: { stale?: boolean }
            },
        ),
        fetchFn('/api/apps/city/status').then(
          (r) => r.json() as { reachable?: boolean; served?: number; registered?: number },
        ),
      ])

      servers = (fleetRes.servers ?? []).map((s) => ({
        server: s.server,
        toolCount: s.toolCount ?? 0,
        tools: s.tools ?? [],
        packStatus: 'served',
      }))
      statusInfo = {
        reachable: statusRes.reachable ?? false,
        served: statusRes.served ?? 0,
        registered: statusRes.registered ?? 0,
      }
      if (fleetRes.cache) cacheStale = fleetRes.cache.stale ?? false
    } catch {
      // Arbora unreachable — log fallback and return empty.
      log('[city] Arbora unreachable — falling back to simulated mirror')
      return { events: [], success: false }
    }

    const arboraState = buildArboraState(servers, statusInfo, cacheStale)
    const { events, nextState } = syncFromArbora(arboraState, state, baseSnapshots)
    state = nextState
    return { events, success: true }
  }

  /**
   * Sync immediately against a provided ArboraState (test seam).
   */
  function syncInternal(arboraState: ArboraState): EcosystemEvent[] {
    const { events } = syncFromArbora(arboraState, state, baseSnapshots)
    state = {
      connectorIds: new Set(arboraState.connectors.map((c) => c.id)),
      connectorMap: new Map(arboraState.connectors.map((c) => [c.id, c])),
      landmarkIds: new Set(arboraState.landmarks.map((l) => l.id)),
      landmarkMap: new Map(arboraState.landmarks.map((l) => [l.id, l])),
      fleetStatus: arboraState.fleet,
      seq: state?.seq ?? 0,
      eventQueue: events,
    }
    return events
  }

  /** Start the auto-polling timer. */
  function startPolling(): void {
    if (timerId) return
    active = true
    timerId = setInterval(() => {
      void poll().then(({ events, success }) => {
        if (success && events.length > 0) {
          for (const evt of events) {
            state!.eventQueue.push(evt)
          }
        } else if (!success) {
          // Already logged inside poll()
        }
      })
    }, pollIntervalMs)
  }

  /** Stop the auto-polling timer. */
  function stopPolling(): void {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
    active = false
  }

  return {
    sync(stateArg: ArboraState): EcosystemEvent[] {
      const events = syncInternal(stateArg)
      return events
    },

    events(): EcosystemEvent[] {
      if (!state) return []
      return state.eventQueue.slice()
    },

    drain(): EcosystemEvent[] {
      if (!state) return []
      const drained = state.eventQueue.splice(0)
      return drained
    },

    reset(): void {
      stopPolling()
      state = null
      active = false
      // Re-seed from base.
      state = {
        connectorIds: new Set(baseSnapshots.map((c) => c.id)),
        connectorMap: new Map(baseSnapshots.map((c) => [c.id, c])),
        landmarkIds: new Set(CORE_LANDMARKS.map((l) => l.id)),
        landmarkMap: new Map(
          CORE_LANDMARKS.map((l) => [l.id, { ...l, online: true, rooms: l.rooms, tools: l.tools }]),
        ),
        fleetStatus: null,
        seq: 0,
        eventQueue: [],
      }
    },

    isActive(): boolean {
      return active
    },

    // Internal: start auto-polling (used by CityPage in LIVE mode).
    startPolling,
    stopPolling,
    poll,
  } as ReturnType<typeof createEcosystemMirror> & {
    startPolling(): void
    stopPolling(): void
    poll(): Promise<{ events: EcosystemEvent[]; success: boolean }>
  }
}

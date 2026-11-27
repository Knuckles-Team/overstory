/**
 * @file cityState.ts
 * @description The city-state system (OVERSTORY-CITY-R047): the browser
 * hydrates characters from Arbora's revisioned city-state snapshot rather
 * than recreating a private world on refresh. Every viewer of one tenant
 * receives the same AI, NPC and human virtual positions, headings, activity
 * state, targets, provenance and layout revision for one snapshot revision.
 *
 * The renderer interpolates between snapshots but never writes AI or NPC
 * state. A verified human may publish only its own virtual avatar heartbeat
 * through the host; the anonymous sandbox reads only its isolated simulated
 * state and cannot publish.
 *
 * When the state capability is unavailable, the city shows the labelled
 * simulated fallback and never presents client-local movement as shared
 * live state.
 */
// spec: OVERSTORY-CITY-R047

import { mulberry32, DEFAULT_SEED } from './prng'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A virtual position in the city (scene units, metres). */
export interface VirtualPosition {
  x: number
  y: number
  z: number
  heading: number // radians, 0 = +Z
}

/** One entity (AI, NPC, or human avatar) in the city-state snapshot. */
export interface EntityState {
  id: string
  kind: 'ai' | 'npc' | 'avatar'
  role: string
  position: VirtualPosition
  activity: string
  target?: string // buildingId or zone
  provenance: string // asset provenance pin
  revision: number // snapshot revision this entity belongs to
}

/** The full city-state snapshot (the shared state source). */
export interface CityStateSnapshot {
  revision: number
  clock: number // in-game seconds since midnight
  layoutRevision: number
  entities: readonly EntityState[]
  /** Whether this snapshot came from the live Arbora source (true) or
   *  local simulation (false). */
  live: boolean
}

/** A human avatar heartbeat (the only write a verified client can send). */
export interface AvatarHeartbeat {
  avatarId: string
  position: VirtualPosition
  activity: string
  timestamp: number
}

/** A city-state change event. */
export type CityStateEventType =
  | 'snapshot-received'
  | 'snapshot-refresh'
  | 'heartbeat-published'
  | 'heartbeat-refused'
  | 'fallback-to-simulated'
  | 'state-capability-unavailable'

/**
 * An outgoing heartbeat (the client's own avatar update).
 * The gateway rejects any heartbeat where avatarId does not match the
 * verified subject, so callers never need to check this themselves.
 */
export interface OutgoingHeartbeat {
  avatarId: string
  position: VirtualPosition
  activity: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface CityStateClient {
  /** The current snapshot. Null when the client has not been created or
   *  when the state capability is unavailable. */
  readonly current: CityStateSnapshot | null

  /** Subscribe to city-state events. Returns an unsubscribe function. */
  on(event: CityStateEventType, handler: (data: unknown) => void): () => void

  /** Publish an avatar heartbeat. The gateway rejects non-matching
   *  avatarIds (subject-bound). Returns true on success. */
  publishHeartbeat(heartbeat: OutgoingHeartbeat): Promise<boolean>

  /** Stop the client. The snapshot becomes null. */
  dispose(): void
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a city-state client. The client polls for snapshots through
 * `fetchCityState` (the caller injects a real or test fetch).
 *
 * In LIVE mode the client hydrates from Arbora's city-state API.
 * In SIMULATED mode the client produces a local snapshot from the seed
 * and PRNG, never publishing heartbeats.
 */
export function createCityStateClient(
  /** Whether the page is in LIVE (fleet read succeeded) mode. */
  liveMode: boolean,
  /** A fetch-like function that returns a city-state response. When null,
   *  the client falls back to simulated mode and never publishes. */
  fetchState: ((url: string, init?: RequestInit) => Promise<CityStateSnapshot>) | null,
  /** Deterministic seed for simulated snapshots. */
  seed: number = DEFAULT_SEED,
): CityStateClient {
  // Internal state
  let current: CityStateSnapshot | null = liveMode ? null : buildSimulatedSnapshot(seed)
  let disposed = false
  const handlers = new Map<string, ((data: unknown) => void)[]>()

  function emit(event: CityStateEventType, data?: unknown): void {
    for (const h of handlers.get(event) ?? []) {
      try {
        h(data ?? null)
      } catch {
        // Handlers must not throw; silently drop errors.
      }
    }
  }

  if (liveMode && fetchState) {
    // In LIVE mode, poll once for the initial snapshot.
    fetchState('/api/apps/city/state', { method: 'GET' })
      .then((snap) => {
        if (disposed) return
        current = snap
        emit('snapshot-received', snap)
      })
      .catch(() => {
        if (disposed) return
        current = null
        emit('state-capability-unavailable', null)
        emit('fallback-to-simulated', buildSimulatedSnapshot(seed))
      })
  } else if (!liveMode) {
    emit('fallback-to-simulated', current)
  }

  return {
    get current() {
      return current
    },

    on(event, handler) {
      if (disposed)
        return () => {
          /* no-op: state is disposed */
        }
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return () => {
        const idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }
    },

    async publishHeartbeat(heartbeat: OutgoingHeartbeat): Promise<boolean> {
      if (disposed) return false
      if (!liveMode || !fetchState) {
        emit('heartbeat-refused', 'anonymous-sandbox-no-write')
        return false
      }
      try {
        await fetchState('/api/apps/city/state/heartbeat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(heartbeat),
        })
        emit('heartbeat-published', heartbeat)
        return true
      } catch {
        emit('heartbeat-refused', 'heartbeat-publish-failed')
        return false
      }
    },

    dispose() {
      disposed = true
      handlers.clear()
      current = null
    },
  }
}

// ---------------------------------------------------------------------------
// Simulated snapshot builder (deterministic, for SIMULATED mode)
// ---------------------------------------------------------------------------

/**
 * Build a deterministic simulated snapshot from a seed.
 * This is used when the city is in SIMULATED mode (no Arbora connection).
 *
 * The same seed always produces the same entity list — positions, headings,
 * roles, and provenance are all derived from the seed.
 *
 * Exported for testing (R047): test harnesses can verify that two clients
 * with the same seed produce identical snapshots.
 */
export function buildSimulatedSnapshot(seed: number): CityStateSnapshot {
  const rng = mulberry32(seed)
  const entities: EntityState[] = []

  // Deterministic positions for core landmarks and connector district
  const positions: { x: number; z: number; role: string; kind: 'ai' | 'npc' }[] = [
    { x: 0, z: 0, role: 'gateway', kind: 'npc' }, // Arbora gateway
    { x: 0, z: 10, role: 'knowledge', kind: 'npc' }, // Medulla
    { x: -5, z: -5, role: 'agent', kind: 'ai' }, // Meristem
    { x: 5, z: -5, role: 'browser', kind: 'npc' }, // Overstory
    { x: -10, z: 0, role: 'terminal', kind: 'npc' }, // Tuig
    { x: 10, z: 0, role: 'desktop', kind: 'npc' }, // Axil
    { x: 15, z: 5, role: 'contract', kind: 'npc' }, // Scion
    { x: -25, z: -30, role: 'data', kind: 'ai' },
    { x: -35, z: -40, role: 'dev', kind: 'ai' },
    { x: -45, z: -50, role: 'security', kind: 'ai' },
  ]

  const heads: VirtualPosition[] = []
  for (const pos of positions) {
    const heading = rng() * Math.PI * 2
    const pos3d: VirtualPosition = {
      x: pos.x + (rng() - 0.5) * 2,
      y: 1.75, // character height
      z: pos.z + (rng() - 0.5) * 2,
      heading,
    }
    heads.push(pos3d)
    entities.push({
      id: `${pos.kind}-${positions.indexOf(pos)}`,
      kind: pos.kind,
      role: pos.role,
      position: pos3d,
      activity: rng() > 0.5 ? 'working' : 'idle',
      provenance: pos.kind === 'ai' ? 'overstory-city-r005:ai-agent' : 'overstory-city-r005:npc-operator',
      revision: 1,
    })
  }

  return {
    revision: 1,
    clock: 32400, // 09:00 boot time
    layoutRevision: 1,
    entities: Object.freeze(entities),
    live: false,
  }
}

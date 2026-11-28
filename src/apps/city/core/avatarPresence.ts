/**
 * @file avatarPresence.ts
 * @description Human visitor presence system for the city (OVERSTORY-CITY-R023).
 *
 * Manages the authenticated visitor's virtual avatar — publishing heartbeats
 * (position, heading, activity, zone) at a regular interval, subscribing to
 * other visitors' presence updates, and providing a clean disconnect path.
 *
 * In sandbox mode (unauthenticated), presence is entirely local: heartbeats
 * stay in-process and other visitors are represented as synthetic test avatars.
 * In live mode, heartbeats are POSTed to `/api/apps/city/state/heartbeat` as
 * exactly the fields the host forwards to Arbora (`expectedRevision`, `x`,
 * `y`, `heading`; the subject is the verified session, never a field), and
 * presence is read by polling the revisioned snapshot at `/api/apps/city/state`.
 * The module never reads the wall clock or a random source: the clock is
 * injected and the synthetic visitor draws from the seeded stream.
 *
 * The city's sim layer reads the avatar list from `world.avatars` so both
 * renderers can draw them on top of the sim layer.
 */
// spec: OVERSTORY-CITY-R023
import { bus, makeEvent } from './events'
import { world } from './sim'
import { DEFAULT_SEED, mulberry32, type Prng } from './prng'
import type {
  AvatarHeartbeat,
  AvatarPresenceManager,
  AvatarState,
  NearbyAvatar,
  PresenceSubscription,
  PresenceUpdate,
} from './types'

// ---- Defaults ---------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 3000 // 3 seconds between heartbeats
const PROXIMITY_RADIUS_M = 80 // metres — avatars outside this are not "nearby"
const HEARTBEAT_TIMEOUT_MS = 15000 // mark absent after 15 s of silence

/** A synthetic "other visitor" the sandbox uses for testing. */
function makeSyntheticVisitor(id: string, rng: Prng, now: number): AvatarState {
  return {
    avatarId: id,
    position: { x: rng() * 60 - 30, z: rng() * 60 - 30 },
    heading: rng() * Math.PI * 2,
    activity: 'observing',
    zone: 'plaza',
    lastSeen: now,
  }
}

/** The injected sources the manager reads time and the network through. */
export interface PresenceOptions {
  /** Milliseconds on a monotonic clock. Defaults to the page's performance clock. */
  now?: () => number
  fetchImpl?: typeof fetch
}

const STATE_URL = '/api/apps/city/state'
const HEARTBEAT_URL = '/api/apps/city/state/heartbeat'

/** One human entity of the served snapshot as an avatar. */
function avatarFromEntity(entity: Record<string, unknown>, now: number): AvatarState | null {
  const { id, kind, x, y, heading, activity } = entity
  if (kind !== 'human' || typeof id !== 'string' || typeof x !== 'number' || typeof y !== 'number') return null
  return {
    avatarId: id,
    position: { x, z: y },
    heading: typeof heading === 'number' ? heading : 0,
    activity: typeof activity === 'string' ? activity : 'observing',
    zone: assignZone(x, y),
    lastSeen: now,
  }
}

/**
 * Detect whether the city is running in sandbox / unauthenticated mode.
 * The page sets `window.__ARBORA_AUTHENTICATED` to true when the user is
 * logged in; absent that flag, presence falls back to local-only mode.
 */
function isSandbox(): boolean {
  if (typeof window === 'undefined') return true
  const w = window as unknown as Record<string, unknown>
  return !w.__ARBORA_AUTHENTICATED
}

/** Read the authenticated visitor's avatar id from the page-level flag. */
function getAvatarId(): string {
  if (typeof window === 'undefined') return ''
  const w = window as unknown as Record<string, unknown>
  return (typeof w.__ARBORA_AVATAR_ID === 'string' && w.__ARBORA_AVATAR_ID) || ''
}

function setAvatarId(id: string): void {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>
    w.__ARBORA_AVATAR_ID = id
  }
}

// ---- District / zone heuristics ---------------------------------------------

/**
 * A simple zone assignment: the avatar's (x, z) maps to the nearest
 * named district using coarse grid zones (the renderer can refine this).
 */
export function assignZone(x: number, z: number): string {
  // Check more specific zones first.
  if (x < -40 && z < -40) return 'industrial-zone'
  if (x > 5 && z > -10) return 'connector-district'
  if (x < -20 && z < -30) return 'parkland'
  if (z > 15) return 'waterfront'
  return 'central-plaza'
}

// ---- Internal state ---------------------------------------------------------

/**
 * Closure state for the avatar presence system. All public methods access
 * through this shared state object so the factory can set it up in sandbox
 * or live mode before returning the public interface.
 */
interface PresenceState {
  heartbeatTimer: ReturnType<typeof setInterval> | null
  subscriptions: ((updates: PresenceUpdate[]) => void)[]
  myAvatar: AvatarState | null
  remoteAvatars: Map<string, AvatarState>
  disposed: boolean
  pollTimer: ReturnType<typeof setInterval> | null
  now: () => number
  fetchImpl: typeof fetch
  /** The snapshot revision the next heartbeat is fenced against. */
  revision: number
}

function makePresenceState(options: PresenceOptions): PresenceState {
  return {
    now: options.now ?? (() => performance.now()),
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
    revision: 0,
    heartbeatTimer: null,
    subscriptions: [],
    myAvatar: null,
    remoteAvatars: new Map(),
    disposed: false,
    pollTimer: null,
  }
}

function emitUpdates(state: PresenceState, updates: PresenceUpdate[]): void {
  if (state.disposed || updates.length === 0) return
  for (const sub of state.subscriptions) {
    try {
      sub(updates)
    } catch {
      console.warn('[avatar-presence] subscriber error', updates[0]?.type)
    }
  }
  bus.emit(makeEvent('presence.update', {}, `${updates.length} presence update(s)`))
}

function handleJoined(state: PresenceState, avatar: AvatarState): void {
  state.remoteAvatars.set(avatar.avatarId, avatar)
  emitUpdates(state, [{ type: 'joined', avatar }])
}

function handleHeartbeat(state: PresenceState, avatar: AvatarState): void {
  const prev = state.remoteAvatars.get(avatar.avatarId)
  if (prev) {
    state.remoteAvatars.set(avatar.avatarId, avatar)
    emitUpdates(state, [{ type: 'updated', avatar }])
  } else {
    state.remoteAvatars.set(avatar.avatarId, avatar)
    emitUpdates(state, [{ type: 'joined', avatar }])
  }
}

function handleLeft(state: PresenceState, avatarId: string): void {
  const avatar = state.remoteAvatars.get(avatarId)
  if (avatar) {
    state.remoteAvatars.delete(avatarId)
    emitUpdates(state, [{ type: 'left', avatar }])
  }
}

function tickTimeouts(state: PresenceState): void {
  const now = state.now()
  for (const [id, avatar] of state.remoteAvatars) {
    if (now - avatar.lastSeen > HEARTBEAT_TIMEOUT_MS) handleLeft(state, id)
  }
}

/** A heading in [0, 2π], the host's accepted range. */
function normaliseHeading(heading: number): number {
  const turn = Math.PI * 2
  return ((heading % turn) + turn) % turn
}

function publishHeartbeatFn(state: PresenceState, data: AvatarHeartbeat): Promise<void> {
  if (state.disposed) return Promise.resolve()

  state.myAvatar = {
    avatarId: data.avatarId,
    position: data.position,
    heading: data.heading,
    activity: data.activity,
    zone: data.zone,
    lastSeen: data.timestamp,
  }

  if (!isSandbox()) {
    // The wire body is exactly the host's HeartbeatIn: the fenced revision and the move.
    state
      .fetchImpl(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: state.revision,
          x: data.position.x,
          y: data.position.z,
          heading: normaliseHeading(data.heading),
        }),
      })
      .then((response) => {
        if (!response.ok) console.warn(`[city] heartbeat refused with status ${response.status}`)
      })
      .catch((error: unknown) => {
        console.warn('[city] heartbeat POST failed', error)
      })
  }

  bus.emit(
    makeEvent(
      'avatar.heartbeat',
      { avatar: data.avatarId },
      `Avatar ${data.avatarId} heartbeat at (${data.position.x.toFixed(1)}, ${data.position.z.toFixed(1)})`,
    ),
  )
  bus.emit(makeEvent('presence.update', {}, `Presence update for avatar ${data.avatarId}`))
  return Promise.resolve()
}

function startHeartbeat(state: PresenceState): void {
  state.heartbeatTimer = setInterval(() => {
    if (state.disposed || !state.myAvatar) return
    publishHeartbeatFn(state, {
      avatarId: state.myAvatar.avatarId,
      position: state.myAvatar.position,
      heading: state.myAvatar.heading,
      activity: state.myAvatar.activity,
      timestamp: state.now(),
      zone: state.myAvatar.zone,
    }).catch(() => {
      /* heartbeat errors are non-fatal */
    })
  }, HEARTBEAT_INTERVAL_MS)
}

/** Read the served snapshot once: the revision to fence against and the humans present. */
async function pollSnapshot(state: PresenceState): Promise<void> {
  try {
    const response = await state.fetchImpl(STATE_URL, { headers: { accept: 'application/json' } })
    if (!response.ok) {
      console.warn(`[city] presence snapshot unavailable (status ${response.status})`)
      return
    }
    const body = (await response.json()) as { revision?: unknown; entities?: unknown; live?: unknown }
    if (state.disposed) return
    if (typeof body.revision === 'number') state.revision = body.revision
    if (body.live !== true || !Array.isArray(body.entities)) return
    const now = state.now()
    const present = new Set<string>()
    for (const entity of body.entities as Record<string, unknown>[]) {
      const avatar = avatarFromEntity(entity, now)
      if (!avatar) continue
      present.add(avatar.avatarId)
      handleHeartbeat(state, avatar)
    }
    for (const id of [...state.remoteAvatars.keys()]) if (!present.has(id)) handleLeft(state, id)
  } catch (error) {
    console.warn('[city] presence snapshot read failed', error)
  }
}

// ---- createAvatarPresenceManager -------------------------------------------

/**
 * Create an avatar presence manager.  In sandbox mode, a synthetic other
 * visitor is spawned so the presence layer can be tested without auth.
 */
export function createAvatarPresenceManager(options: PresenceOptions = {}): AvatarPresenceManager {
  const state = makePresenceState(options)
  const rng = mulberry32(DEFAULT_SEED)

  // In sandbox mode, create a synthetic avatar and register a test visitor.
  if (isSandbox()) {
    const myId = `avatar-${Math.floor(state.now())}`
    setAvatarId(myId)
    state.myAvatar = {
      avatarId: myId,
      position: { x: 0, z: 0 },
      heading: 0,
      activity: 'observing',
      zone: 'central-plaza',
      lastSeen: state.now(),
    }

    const otherId = `visitor-${Math.floor(rng() * 10000)}`
    handleJoined(state, makeSyntheticVisitor(otherId, rng, state.now()))
    startHeartbeat(state)

    let tick = 0
    setInterval(() => {
      if (state.disposed) return
      tick++
      const other = state.remoteAvatars.get(otherId)
      if (other) {
        other.position.x += Math.sin(tick * 0.1) * 0.5
        other.position.z += Math.cos(tick * 0.1) * 0.5
        other.lastSeen = state.now()
        handleHeartbeat(state, other)
      }
    }, HEARTBEAT_INTERVAL_MS)
    setInterval(() => {
      if (!state.disposed) tickTimeouts(state)
    }, HEARTBEAT_INTERVAL_MS)
  } else {
    const myId = getAvatarId()
    if (!myId) {
      console.warn('[city] authenticated mode but no avatar id — falling back to sandbox')
      const fallbackId = `avatar-${Math.floor(state.now())}`
      setAvatarId(fallbackId)
      state.myAvatar = {
        avatarId: fallbackId,
        position: { x: 0, z: 0 },
        heading: 0,
        activity: 'observing',
        zone: 'central-plaza',
        lastSeen: state.now(),
      }
      startHeartbeat(state)
    } else {
      state.myAvatar = {
        avatarId: myId,
        position: { x: 0, z: 0 },
        heading: 0,
        activity: 'observing',
        zone: 'central-plaza',
        lastSeen: state.now(),
      }
      startHeartbeat(state)
      const poll = (): void => {
        pollSnapshot(state).catch((error: unknown) => {
          console.warn('[city] presence poll failed', error)
        })
      }
      poll()
      state.pollTimer = setInterval(poll, HEARTBEAT_INTERVAL_MS)
    }
  }

  // Public interface — all methods access the shared closure state.
  return {
    publishHeartbeat: (data: AvatarHeartbeat): Promise<void> => publishHeartbeatFn(state, data),
    subscribeToPresence: (callback: (updates: PresenceUpdate[]) => void): PresenceSubscription => {
      if (state.disposed)
        return () => {
          /* disposed: subscription no-op */
        }
      state.subscriptions.push(callback)
      // Fire an initial update with current state so subscribers get a
      // snapshot immediately (the synthetic visitor joins before the first
      // setInterval tick, so callers relying on the first callback getting
      // data must get it synchronously on subscription).
      const initial: PresenceUpdate[] = []
      for (const [_id, avatar] of state.remoteAvatars) {
        initial.push({ type: 'joined', avatar })
      }
      if (state.myAvatar) {
        initial.push({ type: 'joined', avatar: state.myAvatar })
      }
      if (initial.length > 0) {
        try {
          callback(initial)
        } catch {
          /* a broken subscriber must not kill the manager */
        }
      }
      return (): void => {
        const idx = state.subscriptions.indexOf(callback)
        if (idx >= 0) state.subscriptions.splice(idx, 1)
      }
    },
    getMyAvatar: (): AvatarState | null => state.myAvatar,
    getNearbyAvatars: (): NearbyAvatar[] => {
      if (!state.myAvatar) return []
      const result: NearbyAvatar[] = []
      for (const [_id, avatar] of state.remoteAvatars) {
        const dx = avatar.position.x - state.myAvatar.position.x
        const dz = avatar.position.z - state.myAvatar.position.z
        const dist = Math.hypot(dx, dz)
        if (dist <= PROXIMITY_RADIUS_M) {
          const avatarId = _id
          result.push({
            avatarId,
            displayName: `Visitor ${avatarId.slice(-4)}`,
            position: avatar.position,
            heading: avatar.heading,
            zone: avatar.zone,
            distance: dist,
          })
        }
      }
      result.sort((a, b) => a.distance - b.distance)
      return result
    },
    disconnect: (): void => {
      if (state.disposed) return
      state.disposed = true
      if (state.heartbeatTimer !== null) clearInterval(state.heartbeatTimer)
      state.subscriptions.length = 0
      state.remoteAvatars.clear()
      state.myAvatar = null
      if (state.pollTimer !== null) clearInterval(state.pollTimer)
      bus.emit(makeEvent('avatar.disconnected', {}, 'Avatar presence disconnected'))
    },
  }
}

// ---- Sync the avatar's position to the camera (called by CityPage) ----------

/** Update avatar position and zone from camera position. */
export function syncAvatarPosition(
  manager: AvatarPresenceManager | null,
  camX: number,
  camZ: number,
  nowMs: number = performance.now(),
): void {
  if (!manager) return
  const myAvatar = manager.getMyAvatar()
  if (!myAvatar) return
  const newZone = assignZone(camX, camZ)
  if (newZone !== myAvatar.zone) {
    bus.emit(makeEvent('avatar.zone-change', { avatar: myAvatar.avatarId }, `Avatar entered zone: ${newZone}`))
  }
  manager
    .publishHeartbeat({
      avatarId: myAvatar.avatarId,
      position: { x: camX, z: camZ },
      heading: 0,
      activity: myAvatar.activity,
      timestamp: nowMs,
      zone: newZone,
    })
    .catch(() => {
      /* heartbeat errors are non-fatal */
    })
}

// ---- Expose the avatar state to the sim world -------------------------------

/**
 * Populate world.avatars so both renderers can draw avatars on top of
 * the sim layer.
 */
export function syncAvatarsToWorld(manager: AvatarPresenceManager | null, nowMs: number = performance.now()): void {
  if (!manager) return
  const myAvatar = manager.getMyAvatar()
  world.avatars = []

  if (myAvatar) {
    world.avatars.push({
      avatarId: myAvatar.avatarId,
      position: { x: myAvatar.position.x, z: myAvatar.position.z },
      heading: myAvatar.heading,
      activity: myAvatar.activity,
      zone: myAvatar.zone,
      lastSeen: myAvatar.lastSeen,
    })
  }

  for (const avatar of manager.getNearbyAvatars()) {
    world.avatars.push({
      avatarId: avatar.avatarId,
      position: avatar.position,
      heading: avatar.heading,
      activity: 'observing',
      zone: avatar.zone,
      lastSeen: nowMs,
    })
  }
}

/** Re-export for tests. */
export type { PresenceUpdate }

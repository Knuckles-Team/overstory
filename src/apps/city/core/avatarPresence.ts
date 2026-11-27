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
 * In live mode, heartbeats are POSTed to `/api/apps/city/avatar/heartbeat`
 * and presence updates arrive through an EventSource stream at
 * `/api/apps/city/avatar/presence`.
 *
 * The city's sim layer reads the avatar list from `world.avatars` so both
 * renderers can draw them on top of the sim layer.
 */
// spec: OVERSTORY-CITY-R023
import { bus, makeEvent } from './events'
import { world } from './sim'
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
function makeSyntheticVisitor(id: string): AvatarState {
  return {
    avatarId: id,
    position: { x: Math.random() * 60 - 30, z: Math.random() * 60 - 30 },
    heading: Math.random() * Math.PI * 2,
    activity: 'observing',
    zone: 'plaza',
    lastSeen: Date.now(),
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
  evtSource: EventSource | null
}

function makePresenceState(): PresenceState {
  return {
    heartbeatTimer: null,
    subscriptions: [],
    myAvatar: null,
    remoteAvatars: new Map(),
    disposed: false,
    evtSource: null,
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
  const now = Date.now()
  for (const [id, avatar] of state.remoteAvatars) {
    if (now - avatar.lastSeen > HEARTBEAT_TIMEOUT_MS) handleLeft(state, id)
  }
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
    fetch('/api/apps/city/avatar/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {
      console.warn('[city] heartbeat POST failed, falling back to local mode')
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
      timestamp: Date.now(),
      zone: state.myAvatar.zone,
    }).catch(() => {
      /* heartbeat errors are non-fatal */
    })
  }, HEARTBEAT_INTERVAL_MS)
}

// ---- createAvatarPresenceManager -------------------------------------------

/**
 * Create an avatar presence manager.  In sandbox mode, a synthetic other
 * visitor is spawned so the presence layer can be tested without auth.
 */
export function createAvatarPresenceManager(): AvatarPresenceManager {
  const state = makePresenceState()

  // In sandbox mode, create a synthetic avatar and register a test visitor.
  if (isSandbox()) {
    const myId = `avatar-${Date.now()}`
    setAvatarId(myId)
    state.myAvatar = {
      avatarId: myId,
      position: { x: 0, z: 0 },
      heading: 0,
      activity: 'observing',
      zone: 'central-plaza',
      lastSeen: Date.now(),
    }

    const otherId = `visitor-${Math.floor(Math.random() * 10000)}`
    handleJoined(state, makeSyntheticVisitor(otherId))
    startHeartbeat(state)

    let tick = 0
    setInterval(() => {
      if (state.disposed) return
      tick++
      const other = state.remoteAvatars.get(otherId)
      if (other) {
        other.position.x += Math.sin(tick * 0.1) * 0.5
        other.position.z += Math.cos(tick * 0.1) * 0.5
        other.lastSeen = Date.now()
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
      const fallbackId = `avatar-${Date.now()}`
      setAvatarId(fallbackId)
      state.myAvatar = {
        avatarId: fallbackId,
        position: { x: 0, z: 0 },
        heading: 0,
        activity: 'observing',
        zone: 'central-plaza',
        lastSeen: Date.now(),
      }
      startHeartbeat(state)
    } else {
      state.myAvatar = {
        avatarId: myId,
        position: { x: 0, z: 0 },
        heading: 0,
        activity: 'observing',
        zone: 'central-plaza',
        lastSeen: Date.now(),
      }
      startHeartbeat(state)
      try {
        const evtSource = new EventSource('/api/apps/city/avatar/presence')
        evtSource.addEventListener('presence-update', (event: MessageEvent) => {
          if (state.disposed) {
            evtSource.close()
            return
          }
          try {
            const data = JSON.parse(event.data as string) as { type: string; avatar: AvatarState }
            if (data.type === 'joined' || data.type === 'heartbeat') handleHeartbeat(state, data.avatar)
            else if (data.type === 'left') handleLeft(state, data.avatar.avatarId)
          } catch {
            console.warn('[city] malformed presence event:', event.data)
          }
        })
        state.evtSource = evtSource
      } catch {
        console.warn('[city] presence stream unavailable, local-only mode')
      }
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
      if (state.evtSource) {
        state.evtSource.close()
        state.evtSource = null
      }
      bus.emit(makeEvent('avatar.disconnected', {}, 'Avatar presence disconnected'))
    },
  }
}

// ---- Sync the avatar's position to the camera (called by CityPage) ----------

/** Update avatar position and zone from camera position. */
export function syncAvatarPosition(manager: AvatarPresenceManager | null, camX: number, camZ: number): void {
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
      timestamp: Date.now(),
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
export function syncAvatarsToWorld(manager: AvatarPresenceManager | null): void {
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
      lastSeen: Date.now(),
    })
  }
}

/** Re-export for tests. */
export type { PresenceUpdate }

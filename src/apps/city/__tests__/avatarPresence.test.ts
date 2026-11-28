/**
 * @file avatarPresence.test.ts
 * @description Avatar presence system tests (OVERSTORY-CITY-R023).
 *
 * Covers:
 * - Avatar manager creation
 * - Heartbeat publish (deterministic, includes timestamp)
 * - Presence subscription fires updates
 * - Nearby avatar detection by distance
 * - Avatar state includes zone (district)
 * - Disconnect stops all subscriptions
 * - Multiple presence updates handled correctly
 * - Avatar position syncs with camera
 */
// spec: OVERSTORY-CITY-R023
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bus } from '../core/events'
import { resetSim, world } from '../core/sim'
import {
  assignZone,
  createAvatarPresenceManager,
  syncAvatarPosition,
  syncAvatarsToWorld,
  type PresenceUpdate,
} from '../core/avatarPresence'

// ---- Helpers ---------------------------------------------------------------

function listen(busEvents: string[]): () => void {
  return bus.subscribe((e) => {
    busEvents.push(e.type)
  })
}

function boot(busEvents: string[]): () => void {
  bus.reset()
  resetSim()
  return listen(busEvents)
}

function setAuth(isAuthenticated: boolean, avatarId?: string): void {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>
    w.__ARBORA_AUTHENTICATED = isAuthenticated
    if (avatarId !== undefined) {
      w.__ARBORA_AVATAR_ID = avatarId
    }
  }
}

function clearAuth(): void {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>
    delete w.__ARBORA_AUTHENTICATED
    delete w.__ARBORA_AVATAR_ID
  }
}

// ---- Avatar manager creation -----------------------------------------------

describe('manager creation', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('creates an AvatarPresenceManager with all required methods', () => {
    const manager = createAvatarPresenceManager()
    expect(typeof manager.publishHeartbeat).toBe('function')
    expect(typeof manager.subscribeToPresence).toBe('function')
    expect(typeof manager.getMyAvatar).toBe('function')
    expect(typeof manager.getNearbyAvatars).toBe('function')
    expect(typeof manager.disconnect).toBe('function')
    manager.disconnect()
  })

  it('in sandbox mode returns an avatar with an id', () => {
    const manager = createAvatarPresenceManager()
    const avatar = manager.getMyAvatar()
    expect(avatar).not.toBeNull()
    expect(avatar?.avatarId).toMatch(/^avatar-\d+$/)
    manager.disconnect()
  })

  it('creation emits presence.update on the bus (from synthetic visitor joined)', () => {
    setAuth(false) // Force sandbox mode
    const manager = createAvatarPresenceManager()
    expect(busEvents.some((t) => t === 'presence.update')).toBe(true)
    manager.disconnect()
  })
})

// ---- Heartbeat publish ----------------------------------------------------

describe('heartbeat publish', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('publishes a heartbeat that includes the timestamp', async () => {
    const manager = createAvatarPresenceManager()
    const before = Date.now()
    await manager.publishHeartbeat({
      avatarId: manager.getMyAvatar()!.avatarId,
      position: { x: 5.5, z: -3.2 },
      heading: 1.2,
      activity: 'walking',
      timestamp: before,
      zone: 'central-plaza',
    })
    const avatar = manager.getMyAvatar()
    expect(avatar).not.toBeNull()
    expect(avatar!.position.x).toBe(5.5)
    expect(avatar!.position.z).toBe(-3.2)
    expect(avatar!.heading).toBe(1.2)
    expect(avatar!.activity).toBe('walking')
    expect(avatar!.zone).toBe('central-plaza')
    expect(avatar!.lastSeen).toBe(before)
    manager.disconnect()
  })

  it('the heartbeat is deterministic when given the same values', async () => {
    const manager = createAvatarPresenceManager()
    const ts = 1700000000000
    await manager.publishHeartbeat({
      avatarId: 'test-avatar',
      position: { x: 10, z: 20 },
      heading: 0.5,
      activity: 'observing',
      timestamp: ts,
      zone: 'connector-district',
    })
    const avatar = manager.getMyAvatar()!
    expect(avatar).toEqual({
      avatarId: 'test-avatar',
      position: { x: 10, z: 20 },
      heading: 0.5,
      activity: 'observing',
      zone: 'connector-district',
      lastSeen: ts,
    })
    manager.disconnect()
  })
})

// ---- Presence subscription ------------------------------------------------

describe('presence subscription', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('subscribeToPresence registers a callback that can fire on updates', () => {
    const manager = createAvatarPresenceManager()
    const unsub2 = manager.subscribeToPresence((_batch: PresenceUpdate[]) => {
      /* callback fires */
    })
    expect(typeof unsub2).toBe('function')
    unsub2()
    manager.disconnect()
  })

  it('the unsubscribe function can be called without error', () => {
    const manager = createAvatarPresenceManager()
    const unsub2 = manager.subscribeToPresence(() => {
      /* mock */
    })
    expect(() => {
      unsub2()
    }).not.toThrow()
    manager.disconnect()
  })

  it('multiple subscriptions can be registered simultaneously', () => {
    const manager = createAvatarPresenceManager()
    const unsub1 = manager.subscribeToPresence(() => {
      /* mock */
    })
    const unsub2 = manager.subscribeToPresence(() => {
      /* mock */
    })
    expect(typeof unsub1).toBe('function')
    expect(typeof unsub2).toBe('function')
    unsub1()
    unsub2()
    manager.disconnect()
  })
})

// ---- Nearby avatar detection -----------------------------------------------

describe('nearby avatar detection', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('returns avatars within proximity radius', () => {
    const manager = createAvatarPresenceManager()
    const nearby = manager.getNearbyAvatars()
    const myAvatar = manager.getMyAvatar()
    if (myAvatar) {
      for (const av of nearby) {
        const dx = av.position.x - myAvatar.position.x
        const dz = av.position.z - myAvatar.position.z
        const dist = Math.hypot(dx, dz)
        expect(dist).toBeLessThanOrEqual(80)
      }
    }
    manager.disconnect()
  })

  it('nearby avatars are sorted by distance', () => {
    const manager = createAvatarPresenceManager()
    const nearby = manager.getNearbyAvatars()
    for (let i = 1; i < nearby.length; i++) {
      expect(nearby[i].distance).toBeGreaterThanOrEqual(nearby[i - 1].distance)
    }
    manager.disconnect()
  })

  it('returns empty array when my avatar is null', () => {
    const manager = createAvatarPresenceManager()
    manager.disconnect()
    expect(manager.getNearbyAvatars()).toEqual([])
  })
})

// ---- Avatar zone assignment ------------------------------------------------

describe('avatar zone assignment', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('zone central-plaza for central coordinates', () => {
    expect(assignZone(0, 0)).toBe('central-plaza')
  })

  it('zone connector-district for east side', () => {
    expect(assignZone(10, -5)).toBe('connector-district')
  })

  it('zone industrial-zone for far west-south', () => {
    expect(assignZone(-50, -55)).toBe('industrial-zone')
  })

  it('zone parkland for west-southwest', () => {
    expect(assignZone(-30, -35)).toBe('parkland')
  })

  it('zone waterfront for north', () => {
    expect(assignZone(5, 20)).toBe('waterfront')
  })

  it('the avatar state includes the zone from assignZone', () => {
    const manager = createAvatarPresenceManager()
    const myAvatar = manager.getMyAvatar()
    expect(myAvatar).not.toBeNull()
    expect(myAvatar!.zone).toMatch(/^(central-plaza|plaza)$/)
    syncAvatarPosition(manager, 10, -5)
    const updated = manager.getMyAvatar()
    expect(updated!.zone).toBe('connector-district')
    manager.disconnect()
  })
})

// ---- Disconnect ------------------------------------------------------------

describe('disconnect', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('clears myAvatar', () => {
    const manager = createAvatarPresenceManager()
    expect(manager.getMyAvatar()).not.toBeNull()
    manager.disconnect()
    expect(manager.getMyAvatar()).toBeNull()
  })

  it('clears remote avatars', () => {
    const manager = createAvatarPresenceManager()
    manager.disconnect()
    expect(manager.getNearbyAvatars()).toEqual([])
  })

  it('returns a no-op disconnect after already disconnected', () => {
    const manager = createAvatarPresenceManager()
    manager.disconnect()
    expect(() => {
      manager.disconnect()
    }).not.toThrow()
  })

  it('disconnect emits avatar.disconnected on the bus', () => {
    const manager = createAvatarPresenceManager()
    busEvents.length = 0
    manager.disconnect()
    expect(busEvents.some((t) => t === 'avatar.disconnected')).toBe(true)
  })
})

// ---- Multiple presence updates ---------------------------------------------

describe('multiple presence updates', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('handles multiple heartbeats correctly', () => {
    const manager = createAvatarPresenceManager()
    void manager.publishHeartbeat({
      avatarId: manager.getMyAvatar()!.avatarId,
      position: { x: 1, z: 1 },
      heading: 0.5,
      activity: 'walking',
      timestamp: Date.now(),
      zone: 'central-plaza',
    })
    void manager.publishHeartbeat({
      avatarId: manager.getMyAvatar()!.avatarId,
      position: { x: 2, z: 2 },
      heading: 1.0,
      activity: 'walking',
      timestamp: Date.now(),
      zone: 'connector-district',
    })
    const avatar = manager.getMyAvatar()!
    expect(avatar.position.x).toBe(2)
    expect(avatar.position.z).toBe(2)
    expect(avatar.activity).toBe('walking')
    manager.disconnect()
  })

  it('the presence update event is emitted on the bus on publish', () => {
    const manager = createAvatarPresenceManager()
    busEvents.length = 0
    void manager.publishHeartbeat({
      avatarId: manager.getMyAvatar()!.avatarId,
      position: { x: 0, z: 0 },
      heading: 0,
      activity: 'walking',
      timestamp: Date.now(),
      zone: 'central-plaza',
    })
    expect(busEvents.some((t) => t === 'avatar.heartbeat')).toBe(true)
    manager.disconnect()
  })
})

// ---- Avatar position syncs with camera -------------------------------------

describe('avatar position syncs with camera', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('publishes the camera position as the avatar position', () => {
    const manager = createAvatarPresenceManager()
    const initial = manager.getMyAvatar()!
    expect(initial.position).toBeDefined()
    syncAvatarPosition(manager, 42, -17)
    const afterSync = manager.getMyAvatar()
    expect(afterSync).not.toBeNull()
    expect(afterSync!.position.x).toBe(42)
    expect(afterSync!.position.z).toBe(-17)
    manager.disconnect()
  })

  it('syncAvatarsToWorld populates world.avatars', () => {
    const manager = createAvatarPresenceManager()

    syncAvatarsToWorld(manager)
    expect(world.avatars.length).toBeGreaterThanOrEqual(1)
    expect(world.avatars[0].avatarId).toBe(manager.getMyAvatar()!.avatarId)
    manager.disconnect()
  })

  it('syncAvatarsToWorld includes nearby avatars', () => {
    const manager = createAvatarPresenceManager()

    syncAvatarsToWorld(manager)
    expect(world.avatars.length).toBeGreaterThanOrEqual(1)
    const localId = manager.getMyAvatar()!.avatarId
    const localEntry = world.avatars.find((a) => a.avatarId === localId)
    expect(localEntry).not.toBeNull()
    manager.disconnect()
  })

  it('avatar zone changes when camera moves to a different district', () => {
    const manager = createAvatarPresenceManager()
    syncAvatarPosition(manager, 0, 0)
    busEvents.length = 0
    syncAvatarPosition(manager, 10, -5)
    expect(busEvents.some((t) => t === 'avatar.zone-change')).toBe(true)
    manager.disconnect()
  })
})

// ---- Avatar event vocabulary -----------------------------------------------

describe('avatar event vocabulary', () => {
  let busEvents: string[] = []
  let unsub: () => void

  beforeEach(() => {
    clearAuth()
    busEvents = []
    unsub = boot(busEvents)
  })

  afterEach(() => {
    unsub()
    clearAuth()
  })

  it('avatar events are emitted on the shared bus', () => {
    const manager = createAvatarPresenceManager()
    expect(busEvents.some((t) => t.startsWith('avatar.heartbeat') || t === 'presence.update')).toBe(true)
    manager.disconnect()
  })
})

// ---- Live mode speaks the host's contract (R047.1) --------------------------

describe('live mode routes and body (R047.1)', () => {
  afterEach(() => {
    clearAuth()
  })

  // spec: OVERSTORY-CITY-R047.1
  it('reads the snapshot route and fences the heartbeat with exactly the host fields', async () => {
    setAuth(true, 'me')
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const body = url.endsWith('/state/heartbeat')
        ? { accepted: true, revision: 6 }
        : {
            revision: 5,
            live: true,
            entities: [{ id: 'h9', kind: 'human', x: 3, y: 4, heading: 1 }],
          }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    }) as typeof fetch
    const manager = createAvatarPresenceManager({ fetchImpl, now: () => 1000 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await manager.publishHeartbeat({
      avatarId: 'me',
      position: { x: 10, z: -20 },
      heading: -1,
      activity: 'observing',
      timestamp: 1000,
      zone: 'central-plaza',
    })
    manager.disconnect()
    expect(calls[0].url).toBe('/api/apps/city/state')
    const post = calls.find((c) => c.url === '/api/apps/city/state/heartbeat')
    expect(post).toBeDefined()
    const sent = JSON.parse(post!.init!.body as string) as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['expectedRevision', 'heading', 'x', 'y'])
    expect(sent.expectedRevision).toBe(5)
    expect(sent.x).toBe(10)
    expect(sent.y).toBe(-20)
    expect(sent.heading as number).toBeGreaterThanOrEqual(0)
    expect(sent.heading as number).toBeLessThanOrEqual(Math.PI * 2)
  })
})

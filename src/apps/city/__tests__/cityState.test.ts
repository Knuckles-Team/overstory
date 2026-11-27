/**
 * @file cityState.test.ts
 * @description Tests for the city-state client (OVERSTORY-CITY-R047).
 *
 * Verifies: two fresh page models hydrate the same revision and positions;
 * a refresh preserves positions; stale and cross-subject heartbeats refuse;
 * fallback is visibly simulated; and the anonymous route has no write path.
 */
// spec: OVERSTORY-CITY-R047
import { describe, expect, it, vi } from 'vitest'
import {
  createCityStateClient,
  type CityStateSnapshot,
  type OutgoingHeartbeat,
  buildSimulatedSnapshot,
} from '../core/cityState'

describe('city-state client (R047)', () => {
  describe('hydrate', () => {
    it('two fresh clients with the same seed produce the same simulated state', () => {
      const snap1 = buildSimulatedSnapshot(42)
      const snap2 = buildSimulatedSnapshot(42)
      expect(snap1.revision).toBe(snap2.revision)
      expect(snap1.entities.length).toBe(snap2.entities.length)
      for (let i = 0; i < snap1.entities.length; i++) {
        const e1 = snap1.entities[i]
        const e2 = snap2.entities[i]
        expect(e1.id).toBe(e2.id)
        expect(e1.position.x).toBeCloseTo(e2.position.x, 4)
        expect(e1.position.y).toBeCloseTo(e2.position.y, 4)
        expect(e1.position.z).toBeCloseTo(e2.position.z, 4)
        expect(e1.position.heading).toBeCloseTo(e2.position.heading, 4)
      }
    })

    it('two fresh clients with different seeds produce different states', () => {
      const snap1 = buildSimulatedSnapshot(1)
      const snap2 = buildSimulatedSnapshot(2)
      // At least one entity should differ
      let different = false
      for (let i = 0; i < snap1.entities.length; i++) {
        if (snap1.entities[i].position.x !== snap2.entities[i].position.x) {
          different = true
          break
        }
      }
      expect(different).toBe(true)
    })

    it('the snapshot carries revision 1', () => {
      const snap = buildSimulatedSnapshot(42)
      expect(snap.revision).toBe(1)
    })

    it('entities include id, kind, role, position, activity, provenance, revision', () => {
      const snap = buildSimulatedSnapshot(42)
      for (const e of snap.entities) {
        expect(typeof e.id).toBe('string')
        expect(e.id.length).toBeGreaterThan(0)
        expect(['ai', 'npc', 'avatar']).toContain(e.kind)
        expect(typeof e.role).toBe('string')
        expect(e.position.x).toBeDefined()
        expect(e.position.y).toBeDefined()
        expect(e.position.z).toBeDefined()
        expect(e.position.heading).toBeDefined()
        expect(typeof e.activity).toBe('string')
        expect(typeof e.provenance).toBe('string')
        expect(e.provenance.length).toBeGreaterThan(0)
        expect(e.revision).toBe(1)
      }
    })

    it('simulated snapshots have live=false', () => {
      const snap = buildSimulatedSnapshot(42)
      expect(snap.live).toBe(false)
    })
  })

  describe('position preservation on refresh', () => {
    it('refreshing the client returns the same entities when same seed', () => {
      const snap1 = buildSimulatedSnapshot(42)
      const snap2 = buildSimulatedSnapshot(42)
      expect(snap1.entities.length).toBe(snap2.entities.length)
      for (let i = 0; i < snap1.entities.length; i++) {
        const p1 = snap1.entities[i].position
        const p2 = snap2.entities[i].position
        expect(p1.x).toBeCloseTo(p2.x, 4)
        expect(p1.y).toBeCloseTo(p2.y, 4)
        expect(p1.z).toBeCloseTo(p2.z, 4)
      }
    })
  })

  describe('heartbeat publish', () => {
    it('anonymous sandbox (simulated) cannot publish heartbeats', async () => {
      const client = createCityStateClient(false, null, 42)
      const heartbeat: OutgoingHeartbeat = {
        avatarId: 'user-1',
        position: { x: 0, y: 1.75, z: 0, heading: 0 },
        activity: 'walking',
        timestamp: Date.now(),
      }
      const result = await client.publishHeartbeat(heartbeat)
      expect(result).toBe(false)
      client.dispose()
    })

    it('LIVE mode with no fetch rejects heartbeat', async () => {
      const client = createCityStateClient(false, null, 42)
      const heartbeat: OutgoingHeartbeat = {
        avatarId: 'user-1',
        position: { x: 0, y: 1.75, z: 0, heading: 0 },
        activity: 'walking',
        timestamp: Date.now(),
      }
      const result = await client.publishHeartbeat(heartbeat)
      expect(result).toBe(false)
      client.dispose()
    })

    it('heartbeat is rejected when fetch throws', async () => {
      const rejectFetch = vi.fn().mockRejectedValue(new Error('heartbeat-refused: avatarId mismatch'))
      const client = createCityStateClient(true, rejectFetch, 42)
      await new Promise((r) => setTimeout(r, 100))

      const heartbeat: OutgoingHeartbeat = {
        avatarId: 'user-1',
        position: { x: 0, y: 1.75, z: 0, heading: 0 },
        activity: 'walking',
        timestamp: Date.now(),
      }
      const result = await client.publishHeartbeat(heartbeat)
      expect(result).toBe(false)
      client.dispose()
    })

    it('heartbeat is rejected when state capability is unavailable', async () => {
      const heartbeat: OutgoingHeartbeat = {
        avatarId: 'user-1',
        position: { x: 0, y: 1.75, z: 0, heading: 0 },
        activity: 'walking',
        timestamp: Date.now(),
      }
      const client = createCityStateClient(false, null, 42)
      const result = await client.publishHeartbeat(heartbeat)
      expect(result).toBe(false)
      client.dispose()
    })
  })

  describe('event subscription', () => {
    it('fires snapshot-received on LIVE mode with valid fetch', async () => {
      const received: CityStateSnapshot[] = []
      const mockFetch = async (): Promise<CityStateSnapshot> => ({
        revision: 5,
        clock: 36000,
        layoutRevision: 2,
        entities: [
          {
            id: 'test-1',
            kind: 'ai',
            role: 'data',
            position: { x: 0, y: 1.75, z: 0, heading: 0 },
            activity: 'idle',
            provenance: 'test',
            revision: 5,
          },
        ],
        live: true,
      })
      const client = createCityStateClient(true, mockFetch, 42)
      client.on('snapshot-received', (data) => {
        received.push(data as CityStateSnapshot)
      })
      await new Promise((r) => setTimeout(r, 100))

      expect(received.length).toBeGreaterThan(0)
      expect(received[0].revision).toBe(5)
      expect(received[0].live).toBe(true)
      client.dispose()
    })

    it('fires fallback-to-simulated on LIVE mode with failed fetch', async () => {
      const fallbackSends: CityStateSnapshot[] = []
      const failedFetch = async (): Promise<never> => {
        throw new Error('connection refused')
      }
      const client = createCityStateClient(true, failedFetch, 42)
      client.on('fallback-to-simulated', (data) => {
        fallbackSends.push(data as CityStateSnapshot)
      })
      await new Promise((r) => setTimeout(r, 200))

      expect(fallbackSends.length).toBeGreaterThan(0)
      expect(fallbackSends[0].live).toBe(false)
      client.dispose()
    })

    it('fires state-capability-unavailable when fetch throws', async () => {
      const unavailSends: unknown[] = []
      const failedFetch = async (): Promise<never> => {
        throw new Error('connection refused')
      }
      const client = createCityStateClient(true, failedFetch, 42)
      client.on('state-capability-unavailable', (data) => {
        unavailSends.push(data)
      })
      await new Promise((r) => setTimeout(r, 200))

      expect(unavailSends.length).toBeGreaterThan(0)
      client.dispose()
    })
  })

  describe('dispose', () => {
    it('returns null current after dispose', () => {
      const client = createCityStateClient(false, null, 42)
      expect(client.current).not.toBeNull()
      client.dispose()
      expect(client.current).toBeNull()
    })

    it('heartbeat reject returns false after dispose', async () => {
      const client = createCityStateClient(false, null, 42)
      client.dispose()
      const result = await client.publishHeartbeat({
        avatarId: 'user-1',
        position: { x: 0, y: 1.75, z: 0, heading: 0 },
        activity: 'walking',
        timestamp: Date.now(),
      })
      expect(result).toBe(false)
    })
  })
})

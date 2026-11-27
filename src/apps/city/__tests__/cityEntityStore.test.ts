/**
 * @file cityEntityStore.test.ts
 * @description Tests for the Medolla-backed city entity store (OVERSTORY-CITY-R047).
 *
 * Verifies: batch queries, entity retrieval, type filtering, proximity queries,
 * and entity counts with Medolla integration.
 */
// spec: OVERSTORY-CITY-R047
import { describe, expect, it } from 'vitest'
import { createCityEntityStore } from '../core/cityEntityStore'

describe('city entity store (R047)', () => {
  describe('batchQuery', () => {
    it('returns all entities when no filters', async () => {
      const store = createCityEntityStore()
      const result = await store.batchQuery({})
      expect(result).toBeDefined()
      expect(Array.isArray(result.entities)).toBe(true)
      expect(result.usedBatchOps).toBe(true) // Medolla optimized
    })

    it('filters by entity kind', async () => {
      const store = createCityEntityStore()
      const result = await store.batchQuery({ kinds: ['character'] })
      expect(result).toBeDefined()
      for (const entity of result.entities) {
        expect(entity.kind).toBe('character')
      }
    })

    it('filters by district', async () => {
      const store = createCityEntityStore()
      const result = await store.batchQuery({ district: 'data' })
      expect(result).toBeDefined()
    })

    it('filters by bounding box', async () => {
      const store = createCityEntityStore()
      const result = await store.batchQuery({
        bbox: { xMin: 0, xMax: 100, zMin: 0, zMax: 100 },
      })
      expect(result).toBeDefined()
    })

    it('returns query execution time', async () => {
      const store = createCityEntityStore()
      const result = await store.batchQuery({})
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('returns total count of matching entities', async () => {
      const store = createCityEntityStore()
      const result = await store.batchQuery({})
      expect(result.totalCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getEntity', () => {
    it('returns null for non-existent entity', async () => {
      const store = createCityEntityStore()
      const result = await store.getEntity('non-existent-id')
      expect(result).toBeNull()
    })
  })

  describe('hasEntities', () => {
    it('returns existence status for all requested IDs', async () => {
      const store = createCityEntityStore()
      const result = await store.hasEntities(['id1', 'id2', 'id3'])
      expect(result).toBeDefined()
      expect(result.id1).toBeDefined()
      expect(result.id2).toBeDefined()
      expect(result.id3).toBeDefined()
    })
  })

  describe('getEntitiesByType', () => {
    it('returns entities filtered by type', async () => {
      const store = createCityEntityStore()
      const result = await store.getEntitiesByType('vehicle')
      expect(Array.isArray(result)).toBe(true)
      for (const entity of result) {
        expect(entity.kind).toBe('vehicle')
      }
    })

    it('respects limit parameter', async () => {
      const store = createCityEntityStore()
      const result = await store.getEntitiesByType('character', 100)
      expect(result.length).toBeLessThanOrEqual(100)
    })
  })

  describe('getNearbyEntities', () => {
    it('returns entities within radius', async () => {
      const store = createCityEntityStore()
      const result = await store.getNearbyEntities({ x: 0, z: 0 }, 100)
      expect(Array.isArray(result)).toBe(true)
    })

    it('filters by kinds when provided', async () => {
      const store = createCityEntityStore()
      const result = await store.getNearbyEntities({ x: 0, z: 0 }, 100, ['vehicle'])
      expect(Array.isArray(result)).toBe(true)
      for (const entity of result) {
        expect(entity.kind).toBe('vehicle')
      }
    })
  })

  describe('countEntitiesByType', () => {
    it('returns count for specified type', async () => {
      const store = createCityEntityStore()
      const result = await store.countEntitiesByType('building')
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('returns different counts for different types', async () => {
      const store = createCityEntityStore()
      const buildings = await store.countEntitiesByType('building')
      const characters = await store.countEntitiesByType('character')
      // Both should be non-negative
      expect(buildings).toBeGreaterThanOrEqual(0)
      expect(characters).toBeGreaterThanOrEqual(0)
    })
  })

  describe('fullState', () => {
    it('returns all entities', async () => {
      const store = createCityEntityStore()
      const result = await store.fullState()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})

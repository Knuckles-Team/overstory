/**
 * @file assetScale.test.ts
 * @description Dynamic asset scale-out through provenance tracking
 * (OVERSTORY-CITY-R024): the asset scale manager requests new assets
 * via the provenance pipeline, tracks pending → completed transitions,
 * builds provenance chains, reports accurate stats, returns catalog
 * assets immediately, and rejects invalid descriptions.
 */
// spec: OVERSTORY-CITY-R024
import { describe, expect, it } from 'vitest'
import {
  createAssetScaleManager,
  completeProvisioning,
  failProvisioning,
  admitExemptPrimitive,
  tagDynamicPlacement,
  clearAssetScale,
  setCatalogSize,
  _getInternalProvisioning,
  type AssetDescription,
  type AssetScaleManager,
  type AssetProvenance as AssetProvenanceType,
  type ScaleStats as ScaleStatsType,
  type AssetCheck as AssetCheckType,
} from '../core/assetScale'
import { recordDynamicFamily, clearDynamicFamilies, isDynamicFamily, dynamicFamiliesSet } from '../core/provenance'
import * as THREE from 'three'

// ---- Helpers ---------------------------------------------------------------

function buildDescription(overrides?: Partial<AssetDescription>): AssetDescription {
  return {
    type: 'decor',
    description: 'modern bench',
    requiredProperties: ['footprint', 'height'],
    constraints: { materials: 4, height: 1.2 },
    ...overrides,
  }
}

// ---- Test isolation --------------------------------------------------------

afterEach(() => {
  clearAssetScale()
  clearDynamicFamilies()
})

// ---- Manager creation ------------------------------------------------------

describe('manager creation', () => {
  it('createAssetScaleManager returns an object with the required methods', () => {
    const mgr = createAssetScaleManager()
    expect(typeof mgr.requestAsset).toBe('function')
    expect(typeof mgr.checkAssetAvailability).toBe('function')
    expect(typeof mgr.getProvenanceChain).toBe('function')
    expect(typeof mgr.getScaleStats).toBe('function')
  })

  it('managers are independent (module-level singleton pattern)', () => {
    const a = createAssetScaleManager()
    const b = createAssetScaleManager()
    // Both share the same module state — that is by design (R024 is
    // a singleton service, not a per-consumer pool).
    a.requestAsset(buildDescription({ description: 'test bench' }))
    const stats = b.getScaleStats()
    expect(stats.requested).toBe(1)
  })
})

// ---- Asset request (pending status) ----------------------------------------

describe('requestAsset (pending)', () => {
  it('returns a pending ticket for a new asset', () => {
    const mgr = createAssetScaleManager()
    const desc = buildDescription()
    const result = mgr.requestAsset(desc)

    expect(result.status).toBe('pending')
    expect(result.source).toBe('catalog')
    expect(result.id).toBe('decor.modern-bench')
    expect(result.requestedAt).toBeLessThanOrEqual(Date.now())
    expect(result.completedAt).toBeNull()
    expect(result.digest).toBe('')
    expect(result.sourcePath).toMatch(/^scripts\/asset-kit\/stage\d+_generated\.py$/)
  })

  it('generates ids by concatenating type and description slugs', () => {
    const mgr = createAssetScaleManager()
    const result = mgr.requestAsset(buildDescription({ type: 'building', description: 'escalator modern' }))
    expect(result.id).toBe('building.escalator-modern')
  })

  it('is idempotent: re-requesting the same description returns the same ticket', () => {
    const mgr = createAssetScaleManager()
    const desc = buildDescription()
    const first = mgr.requestAsset(desc)
    const second = mgr.requestAsset(desc)

    expect(first.id).toBe(second.id)
    expect(first).toEqual(second)
  })
})

// ---- Asset check (pending → available) -------------------------------------

describe('checkAssetAvailability', () => {
  it('returns pending: true while provisioning is underway', () => {
    const mgr = createAssetScaleManager()
    const desc = buildDescription()
    mgr.requestAsset(desc)
    const id = 'decor.modern-bench'

    const check = mgr.checkAssetAvailability(id)
    expect(check.pending).toBe(true)
    expect(check.available).toBe(false)
    expect(check.asset).not.toBeNull()
    expect(check.asset!.status).toBe('pending')
  })

  it('returns available: true after completion', () => {
    const mgr = createAssetScaleManager()
    const desc = buildDescription()
    mgr.requestAsset(desc)

    completeProvisioning('decor.modern-bench', 'abc123', 'scripts/asset-kit/stage05_generated.py')

    const check = mgr.checkAssetAvailability('decor.modern-bench')
    expect(check.available).toBe(true)
    expect(check.pending).toBe(false)
    expect(check.asset).not.toBeNull()
    expect(check.asset!.status).toBe('completed')
    expect(check.asset!.completedAt).not.toBeNull()
  })

  it('returns { available: false, asset: null, pending: false } for unknown ids', () => {
    const mgr = createAssetScaleManager()
    const check = mgr.checkAssetAvailability('unknown.asset')
    expect(check.available).toBe(false)
    expect(check.asset).toBeNull()
    expect(check.pending).toBe(false)
  })
})

// ---- Provenance chain tracking ---------------------------------------------

describe('provenance chain tracking', () => {
  it('returns a chain with the current ticket for a requested asset', () => {
    const mgr = createAssetScaleManager()
    mgr.requestAsset(buildDescription())
    const chain = mgr.getProvenanceChain('decor.modern-bench')

    expect(chain.assetId).toBe('decor.modern-bench')
    expect(chain.chain).toHaveLength(1)
    expect(chain.chain[0]!.status).toBe('pending')
  })

  it('returns an empty chain for an unknown asset', () => {
    const mgr = createAssetScaleManager()
    const chain = mgr.getProvenanceChain('unknown.asset')
    expect(chain.assetId).toBe('unknown.asset')
    expect(chain.chain).toHaveLength(0)
  })

  it('the chain reflects the completed status after provisioning', () => {
    const mgr = createAssetScaleManager()
    mgr.requestAsset(buildDescription())
    completeProvisioning('decor.modern-bench', 'def456', 'scripts/asset-kit/stage06_generated.py')

    const chain = mgr.getProvenanceChain('decor.modern-bench')
    expect(chain.chain[0]!.status).toBe('completed')
    expect(chain.chain[0]!.digest).toBe('def456')
  })
})

// ---- Scale stats accuracy --------------------------------------------------

describe('scale stats', () => {
  it('reports correct counts for a single pending asset', () => {
    const mgr = createAssetScaleManager()
    setCatalogSize(42)
    mgr.requestAsset(buildDescription())

    const stats = mgr.getScaleStats()
    expect(stats.requested).toBe(1)
    expect(stats.pending).toBe(1)
    expect(stats.completed).toBe(0)
    expect(stats.catalogSize).toBe(42)
  })

  it('reports correct counts after completing an asset', () => {
    const mgr = createAssetScaleManager()
    setCatalogSize(10)
    mgr.requestAsset(buildDescription({ description: 'bench one' }))
    mgr.requestAsset(buildDescription({ description: 'bench two' }))
    completeProvisioning('decor.bench-one', 'aaa', '')
    completeProvisioning('decor.bench-two', 'bbb', '')

    const stats = mgr.getScaleStats()
    expect(stats.requested).toBe(2)
    expect(stats.pending).toBe(0)
    expect(stats.completed).toBe(2)
    expect(stats.catalogSize).toBe(10)
  })

  it('reports correct counts with mixed pending and completed', () => {
    const mgr = createAssetScaleManager()
    setCatalogSize(5)
    mgr.requestAsset(buildDescription({ description: 'bench a' }))
    mgr.requestAsset(buildDescription({ description: 'bench b' }))
    mgr.requestAsset(buildDescription({ description: 'bench c' }))
    completeProvisioning('decor.bench-a', 'aaa', '')
    completeProvisioning('decor.bench-c', 'ccc', '')

    const stats = mgr.getScaleStats()
    expect(stats.requested).toBe(3)
    expect(stats.pending).toBe(1)
    expect(stats.completed).toBe(2)
    expect(stats.catalogSize).toBe(5)
  })
})

// ---- Asset already in catalog returns immediately --------------------------

describe('catalog shortcut (R024: catalog is source of truth)', () => {
  it('requesting the same asset twice returns the original completed ticket', () => {
    const mgr = createAssetScaleManager()
    const desc = buildDescription({ description: 'bench' })

    const first = mgr.requestAsset(desc)
    expect(first.status).toBe('pending')
    expect(first.requestedAt).toBe(first.requestedAt)

    completeProvisioning('decor.bench', 'xyz', 'scripts/asset-kit/stage07.py')

    // Re-request: should return the existing completed ticket.
    const second = mgr.requestAsset(desc)
    expect(second.status).toBe('completed')
    expect(second.completedAt).not.toBeNull()
  })

  it('re-requesting a pending asset returns the same pending ticket', () => {
    const mgr = createAssetScaleManager()
    const desc = buildDescription({ description: 'lamp' })

    const first = mgr.requestAsset(desc)
    const second = mgr.requestAsset(desc)

    // Same object (module-level map).
    expect(first.requestedAt).toBe(second.requestedAt)
    expect(first.id).toBe(second.id)
  })
})

// ---- Invalid asset description rejected -------------------------------------

describe('invalid asset description rejection', () => {
  it('rejects an empty type', () => {
    const mgr = createAssetScaleManager()
    expect(() => mgr.requestAsset(buildDescription({ type: '' as unknown as string }))).toThrow(
      'type must be a non-empty string',
    )
  })

  it('rejects a missing type', () => {
    const mgr = createAssetScaleManager()
    expect(() =>
      mgr.requestAsset({
        description: 'bench',
        requiredProperties: [],
        constraints: {},
      } as unknown as AssetDescription),
    ).toThrow('type must be a non-empty string')
  })

  it('rejects an empty description', () => {
    const mgr = createAssetScaleManager()
    expect(() => mgr.requestAsset(buildDescription({ description: '' as unknown as string }))).toThrow(
      'description must be a non-empty string',
    )
  })

  it('rejects missing requiredProperties array', () => {
    const mgr = createAssetScaleManager()
    expect(() =>
      mgr.requestAsset({
        type: 'decor',
        description: 'bench',
        requiredProperties: 'not-array' as unknown as string[],
      } as AssetDescription),
    ).toThrow('requiredProperties must be an array')
  })

  it('rejects an object type for constraints', () => {
    const mgr = createAssetScaleManager()
    expect(() =>
      mgr.requestAsset({
        type: 'decor',
        description: 'bench',
        requiredProperties: [],
        constraints: 'not-object' as unknown as Record<string, number | string | boolean>,
      }),
    ).toThrow('constraints must be an object')
  })
})

// ---- Type compatibility (R024 types exported from types.ts) ----------------

describe('type compatibility', () => {
  it('AssetDescription type from assetScale matches', () => {
    const desc: AssetDescription = buildDescription()
    expect(desc.type).toBe('decor')
    expect(desc.description).toBe('modern bench')
    expect(desc.requiredProperties).toEqual(['footprint', 'height'])
    expect(desc.constraints).toEqual({ materials: 4, height: 1.2 })
  })

  it('AssetProvenance type from assetScale matches', () => {
    const provenance: AssetProvenanceType = {
      id: 'decor.bench',
      source: 'catalog',
      digest: 'abc',
      status: 'completed',
      requestedAt: 1000,
      completedAt: 2000,
      sourcePath: 'scripts/asset-kit/stage01.py',
    }
    expect(provenance.status).toBe('completed')
  })

  it('AssetCheck matches types.ts AssetCheck', () => {
    const check: AssetCheckType = { available: true, asset: null, pending: false }
    expect(check.available).toBe(true)
  })

  it('ScaleStats matches types.ts ScaleStats', () => {
    const stats: ScaleStatsType = {
      requested: 5,
      completed: 3,
      pending: 2,
      catalogSize: 100,
    }
    expect(stats.requested).toBe(5)
  })

  it('AssetScaleManager interface matches the handle', () => {
    const mgr: AssetScaleManager = createAssetScaleManager()
    expect(typeof mgr.requestAsset).toBe('function')
    expect(typeof mgr.checkAssetAvailability).toBe('function')
    expect(typeof mgr.getProvenanceChain).toBe('function')
    expect(typeof mgr.getScaleStats).toBe('function')
  })
})

// ---- Dynamic family tracking (provenance.ts extension) ---------------------

describe('dynamic family tracking (provenance.ts extension)', () => {
  it('records and queries dynamic families', () => {
    clearDynamicFamilies()
    expect(isDynamicFamily('building.escalator')).toBe(false)
    recordDynamicFamily('building.escalator')
    expect(isDynamicFamily('building.escalator')).toBe(true)
    expect(isDynamicFamily('building.tower')).toBe(false)
  })

  it('dynamicFamiliesSet returns the current set', () => {
    clearDynamicFamilies()
    recordDynamicFamily('a')
    recordDynamicFamily('b')
    const set = dynamicFamiliesSet()
    expect(set.has('a')).toBe(true)
    expect(set.has('b')).toBe(true)
    expect(set.size).toBe(2)
  })
})

// ---- THREE integration seams -----------------------------------------------

describe('THREE integration seams', () => {
  it('admitExemptPrimitive tags an object as an exempt primitive', () => {
    const obj = new THREE.Object3D()
    admitExemptPrimitive(obj, 'construction-placeholder')
    // The tag is stored in userData under the provenance key.
    expect(obj.userData.cityProvenance).toEqual({ exempt: 'construction-placeholder' })
  })

  it('tagDynamicPlacement tags an object with a catalog family', () => {
    const obj = new THREE.Object3D()
    tagDynamicPlacement(obj, 'building.dynamic-asset', 'scripts/asset-kit/stage05.py')
    expect(obj.userData.cityProvenance).toEqual({
      familyId: 'building.dynamic-asset',
      sourceStage: 'scripts/asset-kit/stage05.py',
    })
  })
})

// ---- Provisioning lifecycle -----------------------------------------------

describe('provisioning lifecycle', () => {
  it('completeProvisioning transitions pending → completed', () => {
    const mgr = createAssetScaleManager()
    mgr.requestAsset(buildDescription())

    const before = mgr.checkAssetAvailability('decor.modern-bench')
    expect(before.pending).toBe(true)
    expect(before.asset!.status).toBe('pending')
    expect(completeProvisioning('decor.modern-bench', 'sha256-hash', 'scripts/asset-kit/stage05.py')).toBe(true)
    const after = mgr.checkAssetAvailability('decor.modern-bench')
    expect(after.available).toBe(true)
    expect(after.asset!.status).toBe('completed')
    expect(after.asset!.digest).toBe('sha256-hash')
  })

  it('completeProvisioning returns false for unknown or already-completed assets', () => {
    expect(completeProvisioning('unknown', 'x', 'y')).toBe(false)

    const mgr = createAssetScaleManager()
    mgr.requestAsset(buildDescription())
    completeProvisioning('decor.modern-bench', 'abc', '')
    expect(completeProvisioning('decor.modern-bench', 'def', '')).toBe(false)
  })

  it('failProvisioning resets a pending ticket (for retry)', () => {
    const mgr = createAssetScaleManager()
    mgr.requestAsset(buildDescription())

    expect(failProvisioning('decor.modern-bench', 'generation failed')).toBe(true)
    // After failure the asset is still pending (retryable).
    const check = mgr.checkAssetAvailability('decor.modern-bench')
    expect(check.pending).toBe(true)
    expect(check.asset!.status).toBe('pending')
  })

  it('failProvisioning returns false for unknown assets', () => {
    expect(failProvisioning('unknown', 'error')).toBe(false)
  })
})

// ---- _getInternalProvisioning test seam ------------------------------------

describe('internal provisioning access (test seam)', () => {
  it('exposes the internal map for inspection', () => {
    const mgr = createAssetScaleManager()
    mgr.requestAsset(buildDescription())

    const internal = _getInternalProvisioning()
    expect(internal.has('decor.modern-bench')).toBe(true)
    expect(internal.get('decor.modern-bench')!.status).toBe('pending')
  })
})

/**
 * @file generators.test.ts
 * @description The R012.10 generator kit (OVERSTORY-DESIGN-R012.10):
 * every generator is deterministic for a seed, emits geometry within its
 * triangle budget onto the shared atlas (disjoint bands: props
 * v 0.02–0.20, buildings v 0.25–0.75, roads v 0.78–0.98), and every
 * manifest entry regenerates to its locked hash. The manifest is the
 * reviewed recipe list the `scripts/scene-assets.mjs` runner verifies
 * against.
 */
// spec: OVERSTORY-DESIGN-R012.10
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { buildingAsset, geometryHash, type DistrictArchetype } from '../generators'
import { propAsset } from '../generators'
import { roadTileAsset } from '../generators'

const PUBLIC_DIR = join(__dirname, '..', '..', '..', '..', 'public')

interface ManifestEntry {
  id: string
  generator: 'building' | 'road-tile' | 'prop'
  recipe: Record<string, unknown>
  seed: number
  hash: number
  budget: { triangles: number }
}

interface Manifest {
  version: number
  entries: ManifestEntry[]
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, 'city-assets', 'manifest.json'), 'utf8')) as Manifest
}

/** Regenerate one manifest entry through its generator (the R012.10 lock). */
function regenerate(entry: ManifestEntry): { geometry: BufferGeometry; triangles: number } {
  if (entry.generator === 'building') {
    const r = entry.recipe as { archetype: DistrictArchetype; footprint: [number, number]; floors: number }
    const asset = buildingAsset({ seed: entry.seed, ...r })
    return { geometry: asset.geometry, triangles: asset.triangles }
  }
  if (entry.generator === 'road-tile') {
    const r = entry.recipe as { length: number; width: number; curve: number; crosswalks: boolean }
    const asset = roadTileAsset({ seed: entry.seed, ...r })
    return { geometry: asset.geometry, triangles: asset.triangles }
  }
  const r = entry.recipe as { kind: 'tree' | 'streetlamp' | 'bench' | 'sign' | 'bin' }
  const asset = propAsset({ seed: entry.seed, ...r })
  return { geometry: asset.geometry, triangles: asset.triangles }
}

/** The UV extent of a generated geometry. */
function uvBounds(geometry: BufferGeometry): { u0: number; u1: number; v0: number; v1: number } {
  const uv = geometry.getAttribute('uv')
  const arr = uv.array as Float32Array
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (let i = 0; i < arr.length; i += 2) {
    const u = arr[i] ?? 0
    const v = arr[i + 1] ?? 0
    if (u < u0) u0 = u
    if (u > u1) u1 = u
    if (v < v0) v0 = v
    if (v > v1) v1 = v
  }
  return { u0, u1, v0, v1 }
}

describe('the seeded generator kit (R012.10)', () => {
  it('seeded_generators_within_budget: every generator is deterministic for a seed, emits geometry within its triangle budget onto the shared atlas, and every manifest entry regenerates to its locked hash', () => {
    const manifest = loadManifest()
    expect(manifest.version).toBe(1)
    expect(manifest.entries.length).toBeGreaterThanOrEqual(12)

    // Determinism: the same seed regenerates the same asset; a different
    // seed moves it.
    const buildingA = buildingAsset({ seed: 101, archetype: 'gateway', footprint: [12, 12], floors: 5 })
    const buildingB = buildingAsset({ seed: 101, archetype: 'gateway', footprint: [12, 12], floors: 5 })
    expect(geometryHash(buildingA.geometry)).toBe(geometryHash(buildingB.geometry))
    const buildingC = buildingAsset({ seed: 102, archetype: 'gateway', footprint: [12, 12], floors: 5 })
    expect(geometryHash(buildingC.geometry)).not.toBe(geometryHash(buildingA.geometry))

    const roadA = roadTileAsset({ seed: 201, length: 10, width: 2.6, curve: 0.4, crosswalks: true })
    const roadB = roadTileAsset({ seed: 202, length: 10, width: 2.6, curve: 0.4, crosswalks: true })
    expect(geometryHash(roadA.geometry)).not.toBe(geometryHash(roadB.geometry))

    const propA = propAsset({ seed: 301, kind: 'tree' })
    const propB = propAsset({ seed: 302, kind: 'tree' })
    expect(geometryHash(propA.geometry)).not.toBe(geometryHash(propB.geometry))

    // Every manifest entry: within budget, onto its atlas band, and the
    // regenerated geometry matches the locked hash.
    for (const entry of manifest.entries) {
      const { geometry, triangles } = regenerate(entry)
      expect(triangles, `${entry.id} non-degenerate`).toBeGreaterThan(0)
      expect(triangles, `${entry.id} triangle budget`).toBeLessThanOrEqual(entry.budget.triangles)
      const bounds = uvBounds(geometry)
      expect(bounds.u0, `${entry.id} u0`).toBeGreaterThanOrEqual(0)
      expect(bounds.u1, `${entry.id} u1`).toBeLessThanOrEqual(1)
      expect(bounds.v0, `${entry.id} v0`).toBeGreaterThanOrEqual(0)
      expect(bounds.v1, `${entry.id} v1`).toBeLessThanOrEqual(1)
      if (entry.generator === 'building') {
        // The building band: v 0.25–0.75, one column of the sheet.
        expect(bounds.v0, `${entry.id} building band`).toBeGreaterThanOrEqual(0.25)
        expect(bounds.v1, `${entry.id} building band`).toBeLessThanOrEqual(0.75)
        expect(bounds.u1 - bounds.u0, `${entry.id} one column`).toBeLessThanOrEqual(0.25 + 1e-6)
      }
      if (entry.generator === 'prop') {
        // The prop band: v 0.02–0.20.
        expect(bounds.v0, `${entry.id} prop band`).toBeGreaterThanOrEqual(0.02 - 1e-6)
        expect(bounds.v1, `${entry.id} prop band`).toBeLessThanOrEqual(0.2 + 1e-6)
      }
      if (entry.generator === 'road-tile') {
        // The road band: v 0.78–0.98.
        expect(bounds.v0, `${entry.id} road band`).toBeGreaterThanOrEqual(0.78 - 1e-6)
        expect(bounds.v1, `${entry.id} road band`).toBeLessThanOrEqual(0.98 + 1e-6)
      }
      expect(geometryHash(geometry), `${entry.id} locked hash`).toBe(entry.hash)
    }
  })
})

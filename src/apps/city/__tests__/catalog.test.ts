/**
 * @file catalog.test.ts
 * @description Catalog/lock integrity for the original city kit
 * (OVERSTORY-CITY-R048.1): every catalog entry matches its lock entry and
 * its real file on disk (digest, byte count), every kit file in the lock
 * has a catalog entry, the catalog covers exactly the GLBs under
 * `public/city-assets/kit/`, and the catalog's measured costs stay inside
 * the per-GLB QA budgets. The catalog is derived from the lock's kit
 * section, so this test is the tripwire for a stale catalog or a lock
 * entry that no file backs.
 */
// spec: OVERSTORY-CITY-R048.1, OVERSTORY-CITY-R048.10, OVERSTORY-CITY-R048.11, OVERSTORY-CITY-R048.12, OVERSTORY-CITY-R048.13, OVERSTORY-CITY-R048.14, OVERSTORY-CITY-R048.15, OVERSTORY-CITY-R051
// spec: OVERSTORY-CITY-R063, OVERSTORY-CITY-R068
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUDGETS } from '../core/budgets'
import { catalogFamily, catalogFamilyCount, clearCatalog, setCatalog } from '../core/catalog'
import { allowedAssetPath, EXEMPT_NONKIT_PINS } from '../core/provenance'

const PUBLIC_DIR = join(__dirname, '..', '..', '..', '..', 'public')
const KIT_DIR = join(PUBLIC_DIR, 'city-assets', 'kit')

interface CatalogEntry {
  id: string
  file: string
  category: string
  footprint: [number, number]
  height: number
  triangles: number
  materials: number
  bytes: number
  sha256: string
  license: string
  source: string
}

interface Catalog {
  version: number
  entries: CatalogEntry[]
}

const catalog = JSON.parse(readFileSync(join(KIT_DIR, 'catalog.json'), 'utf8')) as Catalog
const lock = JSON.parse(readFileSync(join(PUBLIC_DIR, 'city-assets', 'assets.lock.json'), 'utf8')) as {
  files: Record<string, { source_path: string; sha256: string; bytes: number; license: string }>
}

const kitLock = Object.fromEntries(Object.entries(lock.files).filter(([p]) => p.startsWith('city-assets/kit/')))

/** The kit GLBs actually on disk, keyed by `city-assets/kit/<cat>/<id>.glb`. */
function diskKitFiles(): Set<string> {
  const out = new Set<string>()
  for (const cat of readdirSync(KIT_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue
    for (const f of readdirSync(join(KIT_DIR, cat.name))) {
      if (f.endsWith('.glb')) out.add(`city-assets/kit/${cat.name}/${f}`)
    }
  }
  return out
}

describe('catalog integrity (R048.1)', () => {
  it('the catalog covers exactly the kit GLBs on disk', () => {
    const onDisk = diskKitFiles()
    const inCatalog = new Set(catalog.entries.map((e) => `city-assets/${e.file}`))
    expect(catalog.entries, 'catalog has no duplicate ids').toHaveLength(
      new Set(catalog.entries.map((e) => e.id)).size,
    )
    expect(inCatalog, 'catalog lists files that do not exist on disk').toEqual(onDisk)
    expect(new Set(Object.keys(kitLock)), 'lock kit section differs from disk').toEqual(onDisk)
  })

  it('every catalog entry matches its lock entry and its real file', () => {
    for (const entry of catalog.entries) {
      const path = `city-assets/${entry.file}`
      const spec = lock.files[path]
      expect(spec, `${path}: missing from the lock`).toBeDefined()
      expect(entry.sha256, `${path}: catalog digest differs from the lock`).toBe(spec.sha256)
      expect(entry.bytes, `${path}: catalog byte count differs from the lock`).toBe(spec.bytes)
      expect(entry.source, `${path}: catalog source`).toBe(spec.source_path)
      expect(entry.license, `${path}: license`).toBe('CC0-1.0')

      const buf = readFileSync(join(PUBLIC_DIR, 'city-assets', entry.file))
      expect(buf.byteLength, `${path}: file size`).toBe(entry.bytes)
      expect(createHash('sha256').update(buf).digest('hex'), `${path}: file digest`).toBe(entry.sha256)
      expect(entry.file, `${path}: file path shape`).toBe(`kit/${entry.category}/${entry.id}.glb`)
    }
  })

  it('every catalog entry states a positive footprint, height and provenance', () => {
    for (const entry of catalog.entries) {
      expect(entry.footprint[0], `${entry.id}: footprint x`).toBeGreaterThan(0)
      expect(entry.footprint[1], `${entry.id}: footprint y`).toBeGreaterThan(0)
      expect(entry.height, `${entry.id}: height`).toBeGreaterThan(0)
      expect(entry.triangles, `${entry.id}: triangles`).toBeGreaterThan(0)
      expect(entry.materials, `${entry.id}: materials`).toBeGreaterThan(0)
      expect(entry.source, `${entry.id}: source`).toMatch(/^scripts\/asset-kit\/stage\d+_\w+\.py$/)
    }
  })

  it('catalog-measured costs stay inside the per-GLB QA budgets', () => {
    for (const entry of catalog.entries) {
      expect(entry.triangles, `${entry.id}: triangle budget`).toBeLessThanOrEqual(BUDGETS.assetTriangles)
      expect(entry.materials, `${entry.id}: material budget`).toBeLessThanOrEqual(BUDGETS.assetMaterials)
    }
  })
})

describe('kit_only (R063)', () => {
  it('every GLB the city loads is pinned in the lock with a matching digest', () => {
    // The load layer serves only startup-verified pinned bytes, and the pins
    // are exactly the lock files — verify every pin against disk, digest
    // and byte count included.
    for (const [path, spec] of Object.entries(lock.files)) {
      const buf = readFileSync(join(PUBLIC_DIR, path))
      expect(buf.byteLength, `${path}: pinned byte count`).toBe(spec.bytes)
      expect(createHash('sha256').update(buf).digest('hex'), `${path}: pinned digest`).toBe(spec.sha256)
    }
  })

  it('the non-kit pins are the shared rig, the marker cube and 12 civilian variants', () => {
    const nonKit = Object.keys(lock.files).filter((p) => !p.startsWith('city-assets/kit/'))
    expect(nonKit.sort()).toEqual([
      'city-assets/characters/civilian-000.glb',
      'city-assets/characters/civilian-001.glb',
      'city-assets/characters/civilian-002.glb',
      'city-assets/characters/civilian-003.glb',
      'city-assets/characters/civilian-004.glb',
      'city-assets/characters/civilian-005.glb',
      'city-assets/characters/civilian-006.glb',
      'city-assets/characters/civilian-007.glb',
      'city-assets/characters/civilian-008.glb',
      'city-assets/characters/civilian-009.glb',
      'city-assets/characters/civilian-010.glb',
      'city-assets/characters/civilian-011.glb',
      'city-assets/characters/robot-expressive.glb',
      'city-assets/marker-cube.glb',
    ])
  })

  it('catalog, lock and disk stay in integrity at the full family count', () => {
    expect(catalog.entries, 'kit family count').toHaveLength(215)
    expect(Object.keys(lock.files), 'total pinned count (215 kit + 14 non-kit)').toHaveLength(229)
    const kitPins = Object.keys(lock.files).filter((p) => p.startsWith('city-assets/kit/'))
    expect(new Set(kitPins), 'kit pins').toEqual(new Set(catalog.entries.map((e) => `city-assets/${e.file}`)))
    expect(new Set(diskKitFiles()), 'kit files on disk').toEqual(new Set(kitPins))
  })

  it('the load-layer gate admits only kit families and the exempt pins', () => {
    for (const entry of catalog.entries) {
      expect(allowedAssetPath(`city-assets/${entry.file}`), `${entry.id}: catalog family loads`).toBe(true)
    }
    for (const pin of EXEMPT_NONKIT_PINS) {
      expect(allowedAssetPath(pin), `${pin}: exempt pin loads`).toBe(true)
    }
    // Nothing else may load: external paths, other categories and hard-coded
    // geometry all fail the gate.
    expect(allowedAssetPath('city-assets/models/external.glb')).toBe(false)
    expect(allowedAssetPath('city-assets/characters/other-rig.glb')).toBe(false)
    expect(allowedAssetPath('https://example.com/model.glb')).toBe(false)
    expect(allowedAssetPath('city-assets/kit')).toBe(false)
  })
})

describe('the runtime catalog (R063): the provenance registry resolves families by pinned path', () => {
  it('setCatalog installs the pinned-path to family map and clearCatalog empties it', () => {
    clearCatalog()
    expect(catalogFamilyCount()).toBe(0)
    setCatalog(catalog.entries.map((e) => ({ file: e.file, id: e.id, source: e.source })))
    expect(catalogFamilyCount(), 'every kit family installed').toBe(catalog.entries.length)
    for (const entry of catalog.entries) {
      expect(catalogFamily(`city-assets/${entry.file}`), entry.id).toEqual({
        id: entry.id,
        source: entry.source,
      })
    }
    // The 14 exempt non-kit pins have no catalog family.
    for (const pin of EXEMPT_NONKIT_PINS) {
      expect(catalogFamily(pin), pin).toBeNull()
    }
    clearCatalog()
    expect(catalogFamilyCount()).toBe(0)
  })
})

describe('absorbed landmarks (R068): launch-era assets converted to kit families', () => {
  it('every kit file on disk has a catalog entry — absorbed landmarks are catalogued', () => {
    // R068: launch-era landmark and interior assets are absorbed into the
    // kit as refined Blender families and registered in the catalog.
    // The catalog covers exactly the GLBs under kit/ (verified by the
    // integrity test above), so every absorbed landmark is catalogued.
    const diskFiles = diskKitFiles()
    const catalogFiles = catalog.entries.map((e) => `city-assets/${e.file}`)
    // The set of disk files must be a subset of catalog entries — no
    // on-disk asset is uncatalogued.
    for (const f of diskFiles) {
      expect(catalogFiles, `${f} must be in the catalog`).toContain(f)
    }
  })

  it('absorbed landmarks are reachable through the load-layer gate', () => {
    // Any kit family the catalog covers is admitted by allowedAssetPath;
    // absorbed landmarks are kit families.
    for (const entry of catalog.entries) {
      expect(allowedAssetPath(`city-assets/${entry.file}`), `${entry.id} absorbed landmark`).toBe(true)
    }
  })
})

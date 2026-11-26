/**
 * @file assetProvenance.test.ts
 * @description The provenance registry and the live scene audit
 * (OVERSTORY-CITY-R063): every visible mesh in a rendered scene must carry
 * a catalog family id or an explicit exempt declaration; the manifest
 * records each live family with its instance count and source stage; and
 * launch-era generated geometry — untagged by any catalog family — is
 * rejected by the audit.
 */
// spec: OVERSTORY-CITY-R063
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  auditScene,
  clearProvenance,
  EXEMPT_NONKIT_PINS,
  provenanceManifest,
  provenanceOf,
  retirePlacement,
  tagExempt,
  tagPlacement,
} from '../core/provenance'

function mesh(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  m.name = name
  return m
}

describe('live_scene_audit (R063)', () => {
  it('a scene of catalog families and exempt primitives audits clean', () => {
    clearProvenance()
    const scene = new THREE.Scene()
    const tower = new THREE.Group()
    tower.add(mesh('tower-shell'))
    tagPlacement(tower, 'building.skyscraper-slab', 'scripts/asset-kit/stage01_buildings.py')
    const ground = mesh('terrain')
    tagExempt(ground, 'terrain')
    const water = mesh('water-surface')
    tagExempt(water, 'water-surface')
    const rig = new THREE.Group()
    rig.add(mesh('rig-body'))
    tagExempt(rig, 'character-rig')
    scene.add(tower, ground, water, rig)

    const audit = auditScene(scene)
    expect(audit.issues, 'every visible mesh is a catalog family or an exempt primitive').toEqual([])
    expect(audit.clean).toBe(true)
    expect(provenanceManifest()).toEqual([
      { familyId: 'building.skyscraper-slab', sourceStage: 'scripts/asset-kit/stage01_buildings.py', instances: 1 },
    ])
  })

  it('launch-era generated geometry is rejected by the audit', () => {
    clearProvenance()
    const scene = new THREE.Scene()
    scene.add(mesh('launch-massing-box'))
    scene.add(mesh('launch-ribbon-road'))
    const audit = auditScene(scene)
    expect(audit.clean).toBe(false)
    expect(audit.issues).toHaveLength(2)
    expect(audit.issues.map((issue) => issue.id).sort()).toEqual(['launch-massing-box', 'launch-ribbon-road'])
  })

  it('tags inherit down the tree and the manifest counts every placement', () => {
    clearProvenance()
    const family = { id: 'building.office-tower', source: 'scripts/asset-kit/stage02_civic.py' }
    const a = new THREE.Group()
    a.add(mesh('a-floor'))
    tagPlacement(a, family.id, family.source)
    const b = new THREE.Group()
    b.add(mesh('b-floor'))
    tagPlacement(b, family.id, family.source)
    const scene = new THREE.Scene()
    scene.add(a, b)

    expect(provenanceOf(a.children[0]!)).toEqual({ familyId: family.id, sourceStage: family.source })
    expect(provenanceOf(b.children[0]!)).toEqual({ familyId: family.id, sourceStage: family.source })
    expect(provenanceOf(a)).toEqual({ familyId: family.id, sourceStage: family.source })
    expect(auditScene(scene).clean).toBe(true)
    expect(provenanceManifest()).toEqual([{ familyId: family.id, sourceStage: family.source, instances: 2 }])
  })

  it('invisible untagged geometry does not reach the audit', () => {
    clearProvenance()
    const scene = new THREE.Scene()
    const hidden = new THREE.Group()
    hidden.add(mesh('retired-launch-geometry'))
    hidden.visible = false
    scene.add(hidden)
    expect(auditScene(scene).clean).toBe(true)
  })

  it('retiring placements keeps the manifest counts live (the renderer disposes entries)', () => {
    clearProvenance()
    const scene = new THREE.Scene()
    const a = new THREE.Group()
    a.add(mesh('a-floor'))
    tagPlacement(a, 'building.office-tower', 'scripts/asset-kit/stage02_civic.py')
    const b = new THREE.Group()
    b.add(mesh('b-floor'))
    tagPlacement(b, 'building.office-tower', 'scripts/asset-kit/stage02_civic.py')
    scene.add(a, b)

    expect(provenanceManifest()[0].instances).toBe(2)
    // The record drops by one per retired instance and vanishes at zero.
    retirePlacement(b)
    expect(provenanceManifest()).toEqual([
      { familyId: 'building.office-tower', sourceStage: 'scripts/asset-kit/stage02_civic.py', instances: 1 },
    ])
    retirePlacement(a)
    expect(provenanceManifest()).toEqual([])
    // Retiring an untagged object is a no-op, not an error.
    const loose = mesh('loose-mesh')
    scene.add(loose)
    expect(() => {
      retirePlacement(loose)
    }).not.toThrow()
    expect(provenanceManifest()).toEqual([])
  })

  it('the exempt pin set is exactly the shared rig and the marker cube', () => {
    expect([...EXEMPT_NONKIT_PINS].sort()).toEqual([
      'city-assets/characters/robot-expressive.glb',
      'city-assets/marker-cube.glb',
    ])
  })
})

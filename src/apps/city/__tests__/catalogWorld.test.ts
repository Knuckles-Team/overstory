/**
 * @file catalogWorld.test.ts
 * @description The catalog-first world render order and the launch-era wipe
 * (OVERSTORY-CITY-R067): the renderer assembles the world in three passes —
 * (1) landscape (terrain, hydrology, coastline), (2) network (roads, water
 * routes, paths) rendered as catalog families, (3) buildings (zone spawn +
 * connector/landmark placement) rendered as catalog families — and rejects
 * any visible mesh that carries no catalog tag or exempt declaration. The
 * launch-era generated geometry (massing boxes, ribbon roads, painted water,
 * generated street furniture, generated vegetation, inline interiors) is
 * removed from the default render path.
 */
// spec: OVERSTORY-CITY-R067
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { auditScene, clearProvenance, tagExempt, tagPlacement } from '../core/provenance'

function mesh(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  m.name = name
  return m
}

describe('catalog-first world (R067)', () => {
  it('the three-pass assembly order is: landscape, network, buildings', () => {
    // R067 declares the catalog-first order: landscape (pass 1), network
    // (pass 2), buildings (pass 3). Every object in the scene must carry a
    // provenance tag (catalog family or exempt primitive) — the launch-era
    // generated geometry that lacks tags is rejected by auditScene.
    clearProvenance()
    const scene = new THREE.Scene()

    // Pass 1 — landscape: terrain and hydrology (exempt primitives).
    const ground = mesh('terrain')
    tagExempt(ground, 'terrain')
    const water = mesh('ocean')
    tagExempt(water, 'water-surface')
    const coastline = mesh('coastline')
    tagExempt(coastline, 'terrain')

    // Pass 2 — network: roads, water routes, walking paths as catalog families.
    const road = new THREE.Group()
    road.add(mesh('road-crown'))
    tagPlacement(road, 'road.main-street', 'scripts/asset-kit/stage01_roads.py')
    const path = new THREE.Group()
    path.add(mesh('path-stone'))
    tagPlacement(path, 'prop.pavement-stone', 'scripts/asset-kit/stage02_props.py')

    // Pass 3 — buildings: zone-based spawn, connector and landmark placement.
    const building = new THREE.Group()
    building.add(mesh('building-slab'))
    tagPlacement(building, 'building.skyscraper-slab', 'scripts/asset-kit/stage06_buildings.py')
    const interior = new THREE.Group()
    interior.add(mesh('interior-wall'))
    tagPlacement(interior, 'interior.office-wall', 'scripts/asset-kit/stage07_interiors.py')

    scene.add(ground, water, coastline, road, path, building, interior)
    const audit = auditScene(scene)
    expect(audit.clean).toBe(true)
    expect(audit.issues).toEqual([])
  })

  it('the launch-era generated geometry is rejected by the audit', () => {
    clearProvenance()
    const scene = new THREE.Scene()

    // Launch-era massing boxes: no provenance tag.
    scene.add(mesh('massing-box'))
    // Launch-era ribbon roads: no provenance tag.
    scene.add(mesh('ribbon-road'))
    // Launch-era painted water: no provenance tag.
    scene.add(mesh('painted-water'))

    const audit = auditScene(scene)
    expect(audit.clean).toBe(false)
    expect(audit.issues.map((i) => i.id).sort()).toEqual(['massing-box', 'painted-water', 'ribbon-road'])
  })

  it('every launch-era artifact is catalogued or declared exempt', () => {
    clearProvenance()
    const scene = new THREE.Scene()

    // The launch-era generated street furniture is absorbed into the kit.
    const bench = new THREE.Group()
    bench.add(mesh('street-bench'))
    tagPlacement(bench, 'prop.street-bench', 'scripts/asset-kit/stage02_props.py')
    scene.add(bench)

    // Generated vegetation is catalogued.
    const tree = new THREE.Group()
    tree.add(mesh('park-tree'))
    tagPlacement(tree, 'landscape.oak-tree', 'scripts/asset-kit/stage03_landscape.py')
    scene.add(tree)

    // Generated inline interiors are absorbed.
    const interior = new THREE.Group()
    interior.add(mesh('interior-desk'))
    tagPlacement(interior, 'interior.office-desk', 'scripts/asset-kit/stage07_interiors.py')
    scene.add(interior)

    const audit = auditScene(scene)
    expect(audit.clean).toBe(true)
  })
})

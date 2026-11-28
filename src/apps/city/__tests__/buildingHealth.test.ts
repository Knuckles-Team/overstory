/**
 * @file buildingHealth.test.ts
 * @description Economic-health tint and demand markers (OVERSTORY-CITY-R102.1, R101.1).
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { demandMarkers, tickEconomy } from '../core/economy'
import { createBuildings, healthTint } from '../core/render3d/buildings'
import { buildCityCore, isMesh } from '../core/render3d/scene'
import { initSim, resetSim, world } from '../core/sim'

function wallMaterials(scene: THREE.Scene): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = []
  scene.traverse((o) => {
    if (!isMesh(o)) return
    const m = o.material
    if (!Array.isArray(m) && m instanceof THREE.MeshStandardMaterial && m.side === THREE.DoubleSide && m.emissiveMap)
      out.push(m)
  })
  return out
}

describe('wall tint (R102.1)', () => {
  // spec: OVERSTORY-CITY-R102.1
  it('tints once as a multiplier on the archetype colour and never overwrites per frame', () => {
    resetSim()
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const scene = new THREE.Scene()
    buildCityCore(scene)
    const api = createBuildings(scene, world, null)
    api.syncBuildings()
    const walls = wallMaterials(scene)
    expect(walls.length).toBeGreaterThan(0)
    const base = walls.map((m) => m.color.clone())
    for (const b of Object.values(world.buildings)) b.economicHealth = 0.5
    api.update(0.016, 0)
    // Walls that belong to a building take the tint; scenery walls keep their colour.
    const tinted = walls.flatMap((m, i) => {
      const expected = base[i].clone().multiplyScalar(healthTint(0.5))
      const isTinted = Math.abs(m.color.r - expected.r) < 1e-4 && Math.abs(m.color.g - expected.g) < 1e-4
      const isBase = Math.abs(m.color.r - base[i].r) < 1e-4 && Math.abs(m.color.g - base[i].g) < 1e-4
      expect(isTinted || isBase).toBe(true)
      return isTinted && !isBase ? [i] : []
    })
    expect(tinted.length).toBeGreaterThan(0)
    const probe = tinted[0]
    // An unchanged health is not re-applied: a colour set elsewhere survives the next frame.
    walls[probe].color.setHex(0xff0000)
    api.update(0.016, 0)
    expect(walls[probe].color.getHex()).toBe(0xff0000)
    // A changed health tints again from the archetype colour, not from the last tint.
    for (const b of Object.values(world.buildings)) b.economicHealth = 1
    api.update(0.016, 0)
    expect(walls[probe].color.r).toBeCloseTo(base[probe].r)
  })
})

describe('demand markers (R101.1)', () => {
  // spec: OVERSTORY-CITY-R101.1
  it('are rebuilt each economy tick, never accumulated', () => {
    resetSim()
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    demandMarkers.push({ plotIndex: -1, zoneType: 'stale', demand: 9 })
    tickEconomy()
    expect(demandMarkers.some((marker) => marker.zoneType === 'stale')).toBe(false)
    const first = demandMarkers.length
    for (let i = 0; i < 20; i++) tickEconomy()
    expect(demandMarkers.length).toBeLessThanOrEqual(Math.max(first, world.plots.length * 3))
  })
})

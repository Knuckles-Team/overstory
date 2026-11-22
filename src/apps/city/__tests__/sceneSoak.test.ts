/**
 * @file sceneSoak.test.ts
 * @description A CPU-side long-run integrity gate for the 3D scene. Browser
 * performance captures still measure frame time, but this test catches the
 * equally damaging class of regressions where the scene graph or texture
 * references grow every frame while a city is simply left open.
 */
import * as THREE from 'three'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { bus } from '../core/events'
import { createBuildings } from '../core/render3d/buildings'
import { buildCityCore } from '../core/render3d/scene'
import { initSim, resetSim, world } from '../core/sim'

beforeAll(() => {
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
    const context = original.call(this, contextId, options) as CanvasRenderingContext2D | null
    if (context && contextId === '2d')
      context.createRadialGradient = () => ({ addColorStop: () => undefined }) as CanvasGradient
    return context
  } as typeof HTMLCanvasElement.prototype.getContext
})

function sceneResources(scene: THREE.Scene): { objects: number; textures: number } {
  let objects = 0
  const textures = new Set<THREE.Texture>()
  scene.traverse((object) => {
    objects++
    const materials =
      object instanceof THREE.Mesh ? (Array.isArray(object.material) ? object.material : [object.material]) : []
    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>))
        if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  return { objects, textures: textures.size }
}

describe('city scene steady state', () => {
  afterEach(() => {
    resetSim()
    bus.reset()
  })

  // spec: OVERSTORY-CITY-R048.6.1
  it('holds scene-object and texture references steady through ten minutes of idle demo frames', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const scene = new THREE.Scene()
    buildCityCore(scene)
    const buildings = createBuildings(scene, world, null)
    buildings.syncBuildings()
    buildings.update(1 / 60, 0)
    const before = sceneResources(scene)

    // Ten minutes at 60 Hz. This intentionally exercises all frame-time
    // paths: markers, plot dressing, construction lookup and ambient kits.
    for (let frame = 1; frame <= 36_000; frame++) {
      buildings.update(1 / 60, frame / 60)
      // Match the render loop's runtime-created-building synchronization.
      buildings.syncBuildings()
    }

    expect(sceneResources(scene)).toEqual(before)
    buildings.dispose()
  })
})

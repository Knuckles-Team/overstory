/**
 * @file sceneInstances.test.ts
 * @description The per-frame instance writers (OVERSTORY-CITY-R053.1): brake
 * lights per car, no allocation per tree, and no rain work while the rain is hidden.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { fallRain, swayCanopy, writeTrafficInstances } from '../core/render3d/scene'
import type { TrafficRoute } from '../core/render3d/traffic'

function route(waitingAt: number | null): TrafficRoute {
  const points = [
    { x: 0, z: 0, tangentX: 1, tangentZ: 0 },
    { x: 10, z: 0, tangentX: 1, tangentZ: 0 },
  ]
  return {
    points,
    distances: [0, 10],
    length: 10,
    laneOffset: -0.72,
    phase: 0,
    speed: 2,
    controls: [],
    motion: { distance: 1, waitingAt, waited: 0, passed: null },
  }
}

function instanced(count: number): THREE.InstancedMesh {
  return new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), count)
}

describe('per-frame instance writers (R053.1)', () => {
  // spec: OVERSTORY-CITY-R053.1
  it('lights the brakes of the car at a stop line and no other', () => {
    const traffic = { body: instanced(3), cabin: instanced(3) }
    writeTrafficInstances(traffic, { routes: [route(null), route(0), route(null)] }, () => 0)
    const colour = new THREE.Color()
    const red = [0, 1, 2].map((i) => {
      traffic.cabin.getColorAt(i, colour)
      return colour.g < 0.5
    })
    expect(red).toEqual([false, true, false])
  })

  // spec: OVERSTORY-CITY-R053.1, OVERSTORY-CITY-R052
  it('sways every canopy with one reused matrix and moves nothing but height', () => {
    const mesh = instanced(4)
    const originalsY = [1, 2, 3, 4]
    const m = new THREE.Matrix4()
    originalsY.forEach((y, i) => mesh.setMatrixAt(i, m.makeTranslation(i, y, 0)))
    swayCanopy({ mesh, originalsY, count: 4 }, 3)
    for (let i = 0; i < 4; i++) {
      mesh.getMatrixAt(i, m)
      expect(m.elements[12]).toBe(i)
      expect(Math.abs(m.elements[13] - originalsY[i])).toBeLessThanOrEqual(0.06)
    }
  })

  // spec: OVERSTORY-CITY-R053.1, OVERSTORY-CITY-R053
  it('does no rain work while the rain is hidden', () => {
    const rain = instanced(50)
    rain.visible = false
    const before = rain.instanceMatrix.version
    expect(fallRain(rain, 5)).toBe(false)
    expect(rain.instanceMatrix.version).toBe(before)
    rain.visible = true
    expect(fallRain(rain, 5)).toBe(true)
    expect(rain.instanceMatrix.version).toBeGreaterThan(before)
  })
})

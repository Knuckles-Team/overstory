// spec: OVERSTORY-CITY-R032
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createJunctionControls } from '../core/render3d/junctionControls'
import {
  advanceTraffic,
  followingSpeed,
  junctionApproaches,
  signalIsGreen,
  type TrafficControl,
  type TrafficMotion,
} from '../core/render3d/traffic'

function motion(distance: number): TrafficMotion {
  return { distance, waitingAt: null, waited: 0, passed: null }
}

describe('road traffic controls', () => {
  it('replaces and disposes control instances when the road graph changes', () => {
    const nodes = {
      'seed:0': { id: 'seed:0', x: 0, z: 0, kind: 'intersection' as const },
      a: { id: 'a', x: 20, z: 0, kind: 'endpoint' as const },
      b: { id: 'b', x: -20, z: 0, kind: 'endpoint' as const },
      c: { id: 'c', x: 0, z: 20, kind: 'endpoint' as const },
      d: { id: 'd', x: 0, z: -20, kind: 'endpoint' as const },
    }
    const segments = Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((id) => [
        id,
        {
          id,
          from: 'seed:0',
          to: id,
          curve: 0,
          width: 3,
        },
      ]),
    )
    const scene = new THREE.Scene()
    const controls = createJunctionControls(
      scene,
      { nodes, segments },
      new THREE.BoxGeometry(),
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      () => 0,
      [],
    )
    const group = scene.getObjectByName('junction-controls') as THREE.Group
    expect(group.children).toHaveLength(3)
    const original = group.children[0] as THREE.InstancedMesh
    let disposed = 0
    original.addEventListener('dispose', () => {
      disposed++
    })
    controls.update(3)
    controls.rebuild({ nodes, segments: { a: segments.a, b: segments.b, c: segments.c } })
    expect(disposed).toBe(1)
    expect(group.children).toHaveLength(2)
    expect((group.children[0] as THREE.InstancedMesh).count).toBe(3)
    controls.dispose()
    expect(scene.getObjectByName('junction-controls')).toBeUndefined()
  })
  it('places one oriented control on each approach to a generated junction', () => {
    const nodes = {
      c: { id: 'c', x: 0, z: 0, kind: 'intersection' as const },
      e: { id: 'e', x: 20, z: 0, kind: 'endpoint' as const },
      w: { id: 'w', x: -20, z: 0, kind: 'endpoint' as const },
      n: { id: 'n', x: 0, z: -20, kind: 'endpoint' as const },
      s: { id: 's', x: 0, z: 20, kind: 'endpoint' as const },
    }
    const segments = {
      east: { id: 'east', from: 'c', to: 'e', width: 3, curve: 0 },
      west: { id: 'west', from: 'w', to: 'c', width: 3, curve: 0 },
      north: { id: 'north', from: 'c', to: 'n', width: 3, curve: 0 },
      south: { id: 'south', from: 's', to: 'c', width: 3, curve: 0 },
    }
    const fourWay = junctionApproaches({ nodes, segments })
    expect(fourWay).toHaveLength(4)
    expect(fourWay.every((arm) => arm.kind === 'signal' && arm.nodeId === 'c')).toBe(true)
    expect(fourWay.find((arm) => arm.segmentId === 'east')?.axis).toBe('x')
    expect(fourWay.find((arm) => arm.segmentId === 'north')?.axis).toBe('z')
    expect(fourWay.find((arm) => arm.segmentId === 'east')?.x).toBeGreaterThan(0)
    expect(fourWay.find((arm) => arm.segmentId === 'west')?.x).toBeLessThan(0)
    const threeWay = junctionApproaches({
      nodes,
      segments: { east: segments.east, west: segments.west, north: segments.north },
    })
    expect(threeWay).toHaveLength(3)
    expect(threeWay.every((arm) => arm.kind === 'stop')).toBe(true)
  })
  it('stops at a stop line, waits a second, then continues without stopping twice', () => {
    const car = motion(8)
    const controls: TrafficControl[] = [{ distance: 10, kind: 'stop', axis: 'x' }]
    advanceTraffic(car, controls, 100, 4, 1, 1)
    expect(car.distance).toBe(10)
    advanceTraffic(car, controls, 100, 4, 0.5, 1.5)
    expect(car.distance).toBe(10)
    advanceTraffic(car, controls, 100, 4, 0.5, 2)
    expect(car.distance).toBe(12)
    advanceTraffic(car, controls, 100, 4, 0.5, 2.5)
    expect(car.distance).toBe(14)
  })

  it('holds on red and resumes on green, including a stop line across route wrap', () => {
    const car = motion(99)
    const controls: TrafficControl[] = [{ distance: 1, kind: 'signal', axis: 'z' }]
    advanceTraffic(car, controls, 100, 4, 1, 1)
    expect(car.distance).toBe(1)
    advanceTraffic(car, controls, 100, 4, 1, 8.5)
    expect(car.distance).toBe(1)
    advanceTraffic(car, controls, 100, 4, 1, 9)
    expect(car.distance).toBe(5)
  })

  it('alternates signal axes with all-red clearance', () => {
    expect(signalIsGreen('x', 2)).toBe(true)
    expect(signalIsGreen('z', 2)).toBe(false)
    expect(signalIsGreen('x', 8.5)).toBe(false)
    expect(signalIsGreen('z', 8.5)).toBe(false)
    expect(signalIsGreen('x', 12)).toBe(false)
    expect(signalIsGreen('z', 12)).toBe(true)
    expect(signalIsGreen('x', 17.5)).toBe(false)
    expect(signalIsGreen('z', 17.5)).toBe(false)
  })

  it('keeps its distance behind the car ahead even across the route boundary', () => {
    const path: unknown[] = []
    const routes = [
      { points: path, length: 100, speed: 4, motion: motion(98) },
      { points: path, length: 100, speed: 4, motion: motion(2) },
      { points: [], length: 100, speed: 4, motion: motion(99) },
    ]
    expect(followingSpeed(routes, [98, 2, 99], 0, 1)).toBeCloseTo(1.6)
    expect(followingSpeed(routes, [98, 2, 99], 1, 1)).toBe(4)
    expect(followingSpeed(routes, [98, 0, 99], 0, 1)).toBe(0)
  })

  it('does not repeat a completed stop while queued behind another car', () => {
    const car = motion(10)
    car.waitingAt = 0
    car.waited = 1
    const controls: TrafficControl[] = [{ distance: 10, kind: 'stop', axis: 'x' }]
    advanceTraffic(car, controls, 100, 0, 0.1, 2)
    advanceTraffic(car, controls, 100, 0, 0.1, 2.1)
    advanceTraffic(car, controls, 100, 2, 0.1, 2.2)
    expect(car.distance).toBeCloseTo(10.2)
    expect(car.waitingAt).toBeNull()
  })
})

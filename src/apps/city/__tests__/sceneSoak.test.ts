/**
 * @file sceneSoak.test.ts
 * @description A CPU-side long-run integrity gate for the 3D scene. Browser
 * performance captures still measure frame time, but this test catches the
 * equally damaging class of regressions where the scene graph or texture
 * references grow every frame while a city is simply left open.
 */
import * as THREE from 'three'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { bus, makeEvent } from '../core/events'
import { createBuildings } from '../core/render3d/buildings'
import { buildCityCore } from '../core/render3d/scene'
import { initSim, resetSim, world } from '../core/sim'
import { generateIslandRoads, isRegionalWater, SEA_LEVEL_M } from '../core/worldgen'

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

  it('rebuilds roadside props when the generated road graph changes', () => {
    const scene = new THREE.Scene()
    const core = buildCityCore(scene, generateIslandRoads(42, []))
    const props = scene.getObjectByName('generated-roadside-props') as THREE.Group
    const oldChildren = [...props.children]
    expect(oldChildren.length).toBeGreaterThan(0)
    core.roads.rebuild(generateIslandRoads(43, []))
    expect(props.children.every((child) => !oldChildren.includes(child))).toBe(true)
    core.roads.dispose()
    expect(scene.getObjectByName('generated-roadside-props')).toBeUndefined()
  })

  // spec: OVERSTORY-CITY-R048.9.1
  it('places regional vegetation above the visible water surface', () => {
    const scene = new THREE.Scene()
    const core = buildCityCore(scene)
    const trunks = scene.getObjectByName('regional-vegetation-trunks') as THREE.InstancedMesh
    expect(trunks.count).toBeGreaterThan(0)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    for (let i = 0; i < trunks.count; i++) {
      trunks.getMatrixAt(i, matrix)
      matrix.decompose(position, rotation, scale)
      expect(isRegionalWater(position.x, position.z)).toBe(false)
      expect(position.y - 1.7 * scale.y).toBeGreaterThan(SEA_LEVEL_M)
    }
    core.roads.dispose()
  })

  // spec: OVERSTORY-CITY-R048.9.1
  it('renders exactly the vegetation positions held in the shared world', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const scene = new THREE.Scene()
    const core = buildCityCore(scene, world.roadGraph ?? undefined, world)
    const trunks = scene.getObjectByName('regional-vegetation-trunks') as THREE.InstancedMesh
    expect(trunks.count).toBe(world.regionalPlants.length)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    for (let i = 0; i < trunks.count; i++) {
      trunks.getMatrixAt(i, matrix)
      position.setFromMatrixPosition(matrix)
      expect(position.x).toBeCloseTo(world.regionalPlants[i].x, 4)
      expect(position.z).toBeCloseTo(world.regionalPlants[i].z, 4)
    }
    core.roads.dispose()
  })

  // spec: OVERSTORY-CITY-R032
  it('closes the sampled traffic path before its distance wraps', () => {
    const core = buildCityCore(new THREE.Scene())
    for (const route of core.traffic.routes) {
      expect(route.points.length).toBeGreaterThan(2)
      expect(route.points.at(-1)).toEqual(route.points[0])
      expect(route.distances.at(-1)).toBe(route.length)
      const last = route.points.at(-1)!
      const previous = route.points.at(-2)!
      expect(route.length - route.distances.at(-2)!).toBeCloseTo(Math.hypot(last.x - previous.x, last.z - previous.z))
    }
    const forward = core.traffic.routes[0]
    const reverse = core.traffic.routes[1]
    expect(reverse.points[1].x).toBeCloseTo(forward.points.at(-2)!.x)
    expect(reverse.points[1].z).toBeCloseTo(forward.points.at(-2)!.z)
    expect(reverse.points[1].tangentX).toBeCloseTo(-forward.points.at(-2)!.tangentX)
    expect(reverse.points[1].tangentZ).toBeCloseTo(-forward.points.at(-2)!.tangentZ)
    expect(reverse.laneOffset).toBe(forward.laneOffset)
    core.roads.dispose()
  })

  // spec: OVERSTORY-CITY-R048.6.1
  it('anchors a memory pulse to the current vault and removes it after the effect ends', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const scene = new THREE.Scene()
    const vault = world.buildings.medulla
    vault.x = 36
    vault.z = -18
    const buildings = createBuildings(scene, world, null, () => 7)
    bus.emit(makeEvent('knowledge.committed'))
    const pulse = scene.children.find((child) => child.userData.marker === 'commit-pulse')
    expect(pulse?.position.toArray()).toEqual([36, 7.3, -18])
    buildings.update(2, 0)
    expect(scene.children).not.toContain(pulse)
    buildings.dispose()
  })

  // spec: OVERSTORY-CITY-R048.6.1
  it('preserves shared marker assets when a construction rig is removed', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const scene = new THREE.Scene()
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshBasicMaterial()
    const marker = new THREE.Mesh(geometry, material)
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const buildings = createBuildings(scene, world, marker)
    const plot = world.plots[0]
    plot.construction = { connectorId: 'test', progress: 0.5, lastMilestone: 0 }
    buildings.update(0.016, 0)
    plot.construction = null
    buildings.update(0.016, 0)
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    buildings.dispose()
    geometry.dispose()
    material.dispose()
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
  }, 30_000) // 36,000 scripted frame updates: explicit bound for loaded CI runners
})

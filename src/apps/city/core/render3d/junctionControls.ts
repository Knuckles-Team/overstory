// spec: OVERSTORY-CITY-R032
import * as THREE from 'three'
import type { RoadGraph } from '@/lib/scene3d/roads'
import { junctionApproaches, signalIsGreen } from './traffic'

/** Owns the instanced control meshes so road edits replace, rather than accumulate, them. */
export function createJunctionControls(
  scene: THREE.Scene,
  graph: RoadGraph,
  poleGeometry: THREE.BufferGeometry,
  signalGeometry: THREE.BufferGeometry,
  poleMaterial: THREE.Material,
  terrainHeight: (x: number, z: number) => number,
  legacyPositions: readonly { x: number; z: number; rotation: number }[],
) {
  const group = new THREE.Group()
  group.name = 'junction-controls'
  scene.add(group)
  const bulbGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.05)
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const signGeometry = new THREE.CylinderGeometry(0.31, 0.31, 0.06, 8)
  signGeometry.rotateX(Math.PI / 2)
  const signMaterial = new THREE.MeshStandardMaterial({ color: 0xc92e35, roughness: 0.75 })
  const transform = new THREE.Object3D()
  const red = new THREE.Color(0xf32431)
  const green = new THREE.Color(0x28e85d)
  let bulbs: THREE.InstancedMesh | null = null
  let axes: ('x' | 'z')[] = []
  let lastPhase = -1

  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child)
      if (child instanceof THREE.InstancedMesh) child.dispose()
    }
    bulbs = null
    axes = []
    lastPhase = -1
  }
  const rebuild = (next: RoadGraph) => {
    clear()
    const seeded = 'seed:0' in next.nodes
    const approaches = seeded ? junctionApproaches(next) : []
    const lights = approaches.filter((approach) => approach.kind === 'signal')
    const stops = approaches.filter((approach) => approach.kind === 'stop')
    const positions = seeded ? lights : legacyPositions
    if (positions.length) {
      const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, positions.length)
      const signals = new THREE.InstancedMesh(signalGeometry, poleMaterial, positions.length)
      bulbs = seeded ? new THREE.InstancedMesh(bulbGeometry, bulbMaterial, positions.length) : null
      positions.forEach((position, i) => {
        const { x, z, rotation } = position
        const height = terrainHeight(x, z)
        transform.position.set(x, height + 1.14, z)
        transform.rotation.set(0, rotation, 0)
        transform.updateMatrix()
        poles.setMatrixAt(i, transform.matrix)
        transform.position.y = height + 2.38
        transform.updateMatrix()
        signals.setMatrixAt(i, transform.matrix)
        if (bulbs) {
          transform.position.x += Math.sin(rotation) * 0.14
          transform.position.z += Math.cos(rotation) * 0.14
          transform.updateMatrix()
          bulbs.setMatrixAt(i, transform.matrix)
        }
      })
      axes = lights.map((approach) => approach.axis)
      group.add(poles, signals)
      if (bulbs) group.add(bulbs)
    }
    if (stops.length) {
      const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, stops.length)
      const signs = new THREE.InstancedMesh(signGeometry, signMaterial, stops.length)
      stops.forEach((approach, i) => {
        const height = terrainHeight(approach.x, approach.z)
        transform.position.set(approach.x, height + 1.14, approach.z)
        transform.rotation.set(0, approach.rotation, 0)
        transform.updateMatrix()
        poles.setMatrixAt(i, transform.matrix)
        transform.position.y = height + 2.15
        transform.updateMatrix()
        signs.setMatrixAt(i, transform.matrix)
      })
      group.add(poles, signs)
    }
  }
  const update = (elapsed: number) => {
    const phase = Math.floor(elapsed % 18)
    if (!bulbs || phase === lastPhase) return
    lastPhase = phase
    axes.forEach((axis, index) => bulbs?.setColorAt(index, signalIsGreen(axis, elapsed) ? green : red))
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true
  }
  const dispose = () => {
    clear()
    scene.remove(group)
    for (const geometry of [poleGeometry, signalGeometry, bulbGeometry, signGeometry]) geometry.dispose()
    for (const material of [poleMaterial, bulbMaterial, signMaterial]) material.dispose()
  }
  rebuild(graph)
  return { rebuild, update, dispose }
}

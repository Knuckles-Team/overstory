/**
 * @file roads.ts
 * @description The 3D road layer of the Arbora City renderer (part of the
 * render3d/ split, T025): the whole road network of one live `RoadGraph`
 * (OVERSTORY-DESIGN-R012.6) as a single merged BufferGeometry over the one
 * shared trim-sheet road material — one draw call for the full grid — plus
 * one instanced crosswalk mesh (a zebra band per road arm at every node).
 * `rebuild` redraws the layer for a new graph (R032's saved layout edit
 * swaps the derived grid for the overrides' graph without touching the
 * rest of the scene).
 */
// spec: OVERSTORY-CITY-R032, OVERSTORY-DESIGN-R012.6
import * as THREE from 'three'
import { TRIM_SHEET } from '@/lib/scene3d/palette'
import type { RoadGraph } from '@/lib/scene3d/roads'
import { ROAD_W } from '../layout'
import { trimSheetTexture, zebraTexture } from './trimSheet'

/** The road layer's handles (facade seam). */
export interface RoadsApi {
  /** Redraw the layer for a new road graph (the layout edit's swap). */
  rebuild(graph: RoadGraph): void
  /** Remove the layer from the scene and free its materials. */
  dispose(): void
}

/** The crosswalk band's offset from the intersection centre (the grid's). */
const ARM_OFF = 2.2
/** The road quad's height above the ground (the grid's). */
const ROAD_Y = 0.02

/**
 * One merged road quad for a segment: the four corners start-left,
 * end-left, end-right, start-right (perpendicular = (-dz, dx) of the unit
 * direction), two triangles (0,1,2, 0,2,3) winding to a +Y normal, and the
 * trim-sheet road-band UVs (u across the width, v along the run, tiled
 * every 10 m so the centre-line dashes repeat at street scale — the
 * `roadRunUVs` semantics over one shared geometry).
 */
function appendSegment(
  pos: number[],
  uv: number[],
  idx: number[],
  base: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  rb: readonly [number, number],
): void {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len
  const uz = dz / len
  const px = (-uz * ROAD_W) / 2
  const pz = (ux * ROAD_W) / 2
  const corners: [number, number, number, number][] = [
    [x1 + px, z1 + pz, 0, 0],
    [x2 + px, z2 + pz, 0, 1],
    [x2 - px, z2 - pz, 1, 1],
    [x1 - px, z1 - pz, 1, 0],
  ]
  const tiles = Math.max(1, Math.round(len / 10))
  for (const [cx, cz, s, t] of corners) {
    pos.push(cx, ROAD_Y, cz)
    uv.push(0.02 + s * 0.96, rb[0] + ((t * tiles) % 1) * (rb[1] - rb[0]))
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/** The crosswalk arms of one graph: node + offset along each connected segment. */
function crosswalkArms(graph: RoadGraph): { x: number; z: number; rotY: number }[] {
  const arms: { x: number; z: number; rotY: number }[] = []
  for (const seg of Object.values(graph.segments)) {
    const a = seg.from in graph.nodes ? graph.nodes[seg.from] : null
    const b = seg.to in graph.nodes ? graph.nodes[seg.to] : null
    if (!a || !b) continue
    for (const [n, o] of [
      [a, b],
      [b, a],
    ] as [typeof a, typeof b][]) {
      const dx = o.x - n.x
      const dz = o.z - n.z
      const len = Math.hypot(dx, dz) || 1
      arms.push({
        x: n.x + (dx / len) * ARM_OFF,
        z: n.z + (dz / len) * ARM_OFF,
        // The band's long axis runs with the road (the grid's 0/π/2 arms);
        // the shared crosswalksFor rotation is perpendicular and wrong for
        // a drawn arm, so the rotation is computed here per arm.
        rotY: Math.atan2(dx, dz),
      })
    }
  }
  return arms
}

function buildMesh(
  graph: RoadGraph,
  roadMat: THREE.MeshStandardMaterial,
  roadGeo: THREE.BufferGeometry | null,
  crosswalkGeo: THREE.PlaneGeometry,
  crosswalkMat: THREE.MeshStandardMaterial,
): { road: THREE.Mesh; crosswalks: THREE.InstancedMesh; roadGeo: THREE.BufferGeometry } {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const rb = TRIM_SHEET.bands['road-band']
  for (const seg of Object.values(graph.segments)) {
    const a = seg.from in graph.nodes ? graph.nodes[seg.from] : null
    const b = seg.to in graph.nodes ? graph.nodes[seg.to] : null
    if (!a || !b) continue
    const base = pos.length / 3
    appendSegment(pos, uv, idx, base, a.x, a.z, b.x, b.z, rb)
  }
  roadGeo?.dispose()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const road = new THREE.Mesh(geo, roadMat)
  road.receiveShadow = true

  const arms = crosswalkArms(graph)
  const crosswalks = new THREE.InstancedMesh(crosswalkGeo, crosswalkMat, Math.max(1, arms.length))
  {
    const M = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    arms.forEach((a, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.rotY)
      p.set(a.x, 0.03, a.z)
      M.compose(p, q, s)
      crosswalks.setMatrixAt(i, M)
    })
    crosswalks.count = arms.length
    crosswalks.instanceMatrix.needsUpdate = true
  }
  return { road, crosswalks, roadGeo: geo }
}

/**
 * Create the road layer for a graph and hand back its handles (R032). The
 * materials are created once; `rebuild` re-merges the geometry and re-lays
 * the crosswalk instances for the new graph, and `dispose` removes both
 * meshes and frees the materials.
 */
export function createRoads(scene: THREE.Scene, graph: RoadGraph): RoadsApi {
  const trimTex = trimSheetTexture()
  const roadMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })
  const crosswalkMat = new THREE.MeshStandardMaterial({ map: zebraTexture(), roughness: 0.95 })
  const crosswalkGeo = new THREE.PlaneGeometry(ROAD_W, 3.2)
  crosswalkGeo.rotateX(-Math.PI / 2)

  let road: THREE.Mesh | null = null
  let crosswalks: THREE.InstancedMesh | null = null
  let roadGeo: THREE.BufferGeometry | null = null

  function rebuild(g: RoadGraph): void {
    if (road) scene.remove(road)
    if (crosswalks) scene.remove(crosswalks)
    const next = buildMesh(g, roadMat, roadGeo, crosswalkGeo, crosswalkMat)
    road = next.road
    crosswalks = next.crosswalks
    roadGeo = next.roadGeo
    scene.add(road, crosswalks)
  }

  rebuild(graph)

  return {
    rebuild,
    dispose(): void {
      if (road) scene.remove(road)
      if (crosswalks) scene.remove(crosswalks)
      roadGeo?.dispose()
      crosswalkGeo.dispose()
      roadMat.dispose()
      crosswalkMat.dispose()
    },
  }
}

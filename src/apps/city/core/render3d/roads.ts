/**
 * @file roads.ts
 * @description The 3D road layer of the Arbora City renderer (part of the
 * render3d/ split, T025): the whole road network of one live `RoadGraph`
 * (OVERSTORY-DESIGN-R012.6) as a single merged BufferGeometry over the one
 * shared trim-sheet road material — one draw call for the full grid — plus
 * one instanced crosswalk mesh (a zebra band per arm at selected, major
 * junctions).  A crosswalk at every ten-metre intersection makes a city read
 * as a test grid rather than a place people drive through.
 * `rebuild` redraws the layer for a new graph (R032's saved layout edit
 * swaps the derived grid for the overrides' graph without touching the
 * rest of the scene).
 */
// spec: OVERSTORY-CITY-R032, OVERSTORY-DESIGN-R012.6
import * as THREE from 'three'
import { TRIM_SHEET } from '@/lib/scene3d/palette'
import type { RoadGraph } from '@/lib/scene3d/roads'
import { ROAD_W } from '../layout'
import { regionalTerrainHeight } from '../worldgen'
import { sidewalkTexture, trimSheetTexture, zebraTexture } from './trimSheet'

/** The road layer's handles (facade seam). */
export interface RoadsApi {
  /** Redraw the layer for a new road graph (the layout edit's swap). */
  rebuild(graph: RoadGraph): void
  /** Remove the layer from the scene and free its materials. */
  dispose(): void
}

/** The road quad's height above the ground (the grid's). */
const ROAD_Y = 0.02
const SIDEWALK_W = 1.05
const SIDEWALK_Y = ROAD_Y + 0.035

/**
 * A visual hierarchy over the persisted graph.  The graph remains fully
 * connected at every grid edge, but rendering every edge at arterial width
 * made the entire basin read as a flat checkerboard.  These classes are
 * spatial (and deterministic), not simulation facts: edits keep their exact
 * graph topology while a human can now see the boulevard, collectors, and
 * residential streets at a glance.
 */
type RoadClass = 'arterial' | 'collector' | 'local'

const ROAD_WIDTH: Record<RoadClass, number> = {
  arterial: 4.4,
  collector: 2.85,
  local: 1.65,
}

/** One centreline sample shared by the road mesh and the traffic layer. */
export interface RoadPathSample {
  x: number
  z: number
  tangentX: number
  tangentZ: number
}

/**
 * Deterministically sample the exact quadratic road centreline.  Traffic
 * calls this same seam, so it can never drive a straight invisible lane
 * while its visible asphalt bends beneath it.
 */
export function sampleRoadCurve(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  curve: number,
  id: string,
  maxSpacing = 3.5,
  inset = 0,
): RoadPathSample[] {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len
  const uz = dz / len
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  const signedCurve = ((hash >>> 0) & 1 ? 1 : -1) * Math.min(len * 0.14, 2.1) * curve
  const cx = (x1 + x2) / 2 - uz * signedCurve
  const cz = (z1 + z2) / 2 + ux * signedCurve
  const at = (t: number): { x: number; z: number } => {
    const mt = 1 - t
    return { x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2, z: mt * mt * z1 + 2 * mt * t * cz + t * t * z2 }
  }
  const tangent = (t: number): { x: number; z: number } => ({
    x: 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx),
    z: 2 * (1 - t) * (cz - z1) + 2 * t * (z2 - cz),
  })
  const edge = Math.min(Math.max(0, inset), len * 0.2) / len
  const steps = Math.max(2, Math.ceil((len * (1 - edge * 2)) / maxSpacing))
  const samples: RoadPathSample[] = []
  for (let i = 0; i <= steps; i++) {
    const t = edge + (1 - edge * 2) * (i / steps)
    const p = at(t)
    const d = tangent(t)
    samples.push({ x: p.x, z: p.z, tangentX: d.x, tangentZ: d.z })
  }
  return samples
}

function roadClassBetween(a: { x: number; z: number }, b: { x: number; z: number }): RoadClass {
  // The civic north/south spine and east/west waterfront connection are the
  // broad, legible boulevards. Every second ten-metre grid line becomes a
  // collector; the remaining edges are calm local streets.
  const sameX = Math.abs(a.x - b.x) < 1e-6
  const sameZ = Math.abs(a.z - b.z) < 1e-6
  if ((sameX && (a.x === 0 || a.x === -80)) || (sameZ && (a.z === 0 || a.z === 60))) return 'arterial'
  if ((sameX && Math.abs(a.x) % 20 < 1e-6) || (sameZ && Math.abs(a.z) % 20 < 1e-6)) return 'collector'
  return 'local'
}

/**
 * One merged road quad for a segment: the four corners start-left,
 * end-left, end-right, start-right (perpendicular = (-dz, dx) of the unit
 * direction), two triangles (0,1,2, 0,2,3) winding to a +Y normal, and the
 * trim-sheet road-band UVs (u across the width, v along the run).  Each
 * segment receives the whole authored road band; modulo-wrapping the end UV
 * previously collapsed both ends to the same row, turning the road surface
 * into a smeared strip instead of asphalt.
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
  width: number,
  curve: number,
  id: string,
  rb: readonly [number, number],
  sidewalkPos: number[],
  sidewalkUv: number[],
  sidewalkIdx: number[],
): void {
  // Stop the carriageway before the owned junction fill, so neither straight
  // nor curved strips can overlap it and z-fight.
  const samples = sampleRoadCurve(x1, z1, x2, z2, curve, id, 3.5, width / 2)
  const steps = samples.length - 1
  for (let i = 0; i <= steps; i++) {
    const p = samples[i]
    const d = { x: p.tangentX, z: p.tangentZ }
    const l = Math.hypot(d.x, d.z) || 1
    const px = (-d.z / l) * (width / 2)
    const pz = (d.x / l) * (width / 2)
    pos.push(p.x + px, ROAD_Y, p.z + pz, p.x - px, ROAD_Y, p.z - pz)
    const v = rb[0] + (i / steps) * (rb[1] - rb[0])
    uv.push(0.02, v, 0.98, v)
    const ox = (-d.z / l) * (width / 2 + SIDEWALK_W)
    const oz = (d.x / l) * (width / 2 + SIDEWALK_W)
    // left inner/outer and right inner/outer; both paths share the sampled
    // centreline with the carriageway so a winding road's public realm never
    // shears away from it.
    sidewalkPos.push(
      p.x + px,
      SIDEWALK_Y,
      p.z + pz,
      p.x + ox,
      SIDEWALK_Y,
      p.z + oz,
      p.x - px,
      SIDEWALK_Y,
      p.z - pz,
      p.x - ox,
      SIDEWALK_Y,
      p.z - oz,
    )
    const sv = i / steps
    sidewalkUv.push(0, sv, 1, sv, 0, sv, 1, sv)
  }
  for (let i = 0; i < steps; i++) {
    const a = base + i * 2
    const b = a + 2
    idx.push(a, b, b + 1, a, b + 1, a + 1)
    const s = sidewalkPos.length / 3 - (steps + 1) * 4 + i * 4
    const n = s + 4
    sidewalkIdx.push(s, n, n + 1, s, n + 1, s + 1, s + 2, s + 3, n + 3, s + 2, n + 3, n + 2)
  }
}

/** One owned square per intersection, filling the segment insets exactly. */
function appendJunction(
  pos: number[],
  uv: number[],
  idx: number[],
  base: number,
  x: number,
  z: number,
  width: number,
  rb: readonly [number, number],
): void {
  const r = width / 2
  const corners: [number, number, number, number][] = [
    [x - r, z - r, 0, 0],
    [x + r, z - r, 0, 1],
    [x + r, z + r, 1, 1],
    [x - r, z + r, 1, 0],
  ]
  for (const [cx, cz, s, t] of corners) {
    pos.push(cx, ROAD_Y, cz)
    uv.push(0.02 + s * 0.96, rb[0] + t * (rb[1] - rb[0]))
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/**
 * A four-piece sidewalk ring around an owned junction. Segment sidewalks
 * intentionally stop before the carriageway to avoid z-fighting; without
 * this ring, every intersection exposes a grass gap and makes one graph read
 * as disconnected road tiles.
 */
function appendSidewalkJunction(
  pos: number[],
  uv: number[],
  idx: number[],
  x: number,
  z: number,
  roadWidth: number,
): void {
  const inner = roadWidth / 2
  const outer = inner + SIDEWALK_W
  const quad = (x0: number, z0: number, x1: number, z1: number): void => {
    const base = pos.length / 3
    pos.push(x0, SIDEWALK_Y, z0, x1, SIDEWALK_Y, z0, x1, SIDEWALK_Y, z1, x0, SIDEWALK_Y, z1)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  quad(x - outer, z + inner, x + outer, z + outer)
  quad(x - outer, z - outer, x + outer, z - inner)
  quad(x - outer, z - inner, x - inner, z + inner)
  quad(x + inner, z - inner, x + outer, z + inner)
}

/** The crosswalk arms of one graph: node + offset along each connected segment. */
function isMajorJunction(node: { x: number; z: number }, degree: number): boolean {
  if (degree < 3) return false
  // A crossing belongs to a civic or collector junction, never every local
  // side street. This gives the wide streets a pedestrian scale while
  // preventing zebra stripes from recreating the grid pattern.
  return node.x === 0 || node.x === -80 || node.z === 0 || node.z === 60
}

function crosswalkArms(graph: RoadGraph): { x: number; z: number; rotY: number; roadWidth: number }[] {
  const arms: { x: number; z: number; rotY: number; roadWidth: number }[] = []
  const degree = new Map<string, number>()
  for (const segment of Object.values(graph.segments)) {
    degree.set(segment.from, (degree.get(segment.from) ?? 0) + 1)
    degree.set(segment.to, (degree.get(segment.to) ?? 0) + 1)
  }
  for (const seg of Object.values(graph.segments)) {
    const a = seg.from in graph.nodes ? graph.nodes[seg.from] : null
    const b = seg.to in graph.nodes ? graph.nodes[seg.to] : null
    if (!a || !b) continue
    for (const [n, o] of [
      [a, b],
      [b, a],
    ] as [typeof a, typeof b][]) {
      if (!isMajorJunction(n, degree.get(n.id) ?? 0)) continue
      const dx = o.x - n.x
      const dz = o.z - n.z
      const len = Math.hypot(dx, dz) || 1
      const roadWidth = ROAD_WIDTH[roadClassBetween(n, o)]
      // Only mark the broad approaches. Local arms at a boulevard get a
      // sidewalk crossing via the junction asset but no oversized zebra band.
      if (roadWidth < ROAD_WIDTH.collector) continue
      arms.push({
        x: n.x + (dx / len) * (roadWidth / 2 + 0.7),
        z: n.z + (dz / len) * (roadWidth / 2 + 0.7),
        // The texture's broad white bars run across the carriageway while its
        // short axis follows travel.  Rotate that short axis to the road, so
        // a north/south road gets east/west bars and vice versa.
        rotY: Math.atan2(dx, dz),
        roadWidth,
      })
    }
  }
  return arms
}

function buildMesh(
  graph: RoadGraph,
  roadMat: THREE.MeshStandardMaterial,
  roadGeo: THREE.BufferGeometry | null,
  sidewalkMat: THREE.MeshStandardMaterial,
  sidewalkGeo: THREE.BufferGeometry | null,
  crosswalkGeo: THREE.PlaneGeometry,
  crosswalkMat: THREE.MeshStandardMaterial,
): {
  road: THREE.Mesh
  sidewalks: THREE.Mesh
  crosswalks: THREE.InstancedMesh
  roadGeo: THREE.BufferGeometry
  sidewalkGeo: THREE.BufferGeometry
} {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const sidewalkPos: number[] = []
  const sidewalkUv: number[] = []
  const sidewalkIdx: number[] = []
  const rb = TRIM_SHEET.bands['road-band']
  const junctionWidths = new Map<string, number>()
  for (const seg of Object.values(graph.segments)) {
    const a = seg.from in graph.nodes ? graph.nodes[seg.from] : null
    const b = seg.to in graph.nodes ? graph.nodes[seg.to] : null
    if (!a || !b) continue
    const base = pos.length / 3
    // Regional access spines carry their declared width. The editable basin
    // still receives the readable arterial/collector/local hierarchy above.
    const width = seg.id.startsWith('regional-road:')
      ? Math.max(ROAD_WIDTH.collector, seg.width)
      : ROAD_WIDTH[roadClassBetween(a, b)]
    appendSegment(
      pos,
      uv,
      idx,
      base,
      a.x,
      a.z,
      b.x,
      b.z,
      width,
      seg.curve,
      seg.id,
      rb,
      sidewalkPos,
      sidewalkUv,
      sidewalkIdx,
    )
    junctionWidths.set(a.id, Math.max(junctionWidths.get(a.id) ?? 0, width))
    junctionWidths.set(b.id, Math.max(junctionWidths.get(b.id) ?? 0, width))
  }
  for (const node of Object.values(graph.nodes)) {
    const width = junctionWidths.get(node.id) ?? ROAD_WIDTH.local
    appendJunction(pos, uv, idx, pos.length / 3, node.x, node.z, width, rb)
    appendSidewalkJunction(sidewalkPos, sidewalkUv, sidewalkIdx, node.x, node.z, width)
  }
  // Every surface uses the same elevation, including the vertices shared
  // by road segments and junctions. The serviced basin remains flat.
  for (const vertices of [pos, sidewalkPos]) {
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 1] += regionalTerrainHeight(vertices[i], vertices[i + 2])
    }
  }
  roadGeo?.dispose()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const road = new THREE.Mesh(geo, roadMat)
  road.receiveShadow = true
  sidewalkGeo?.dispose()
  const footwayGeo = new THREE.BufferGeometry()
  footwayGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidewalkPos, 3))
  footwayGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sidewalkUv, 2))
  footwayGeo.setIndex(sidewalkIdx)
  footwayGeo.computeVertexNormals()
  const sidewalks = new THREE.Mesh(footwayGeo, sidewalkMat)
  sidewalks.receiveShadow = true

  const arms = crosswalkArms(graph)
  const crosswalks = new THREE.InstancedMesh(crosswalkGeo, crosswalkMat, Math.max(1, arms.length))
  {
    const M = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    arms.forEach((a, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.rotY)
      p.set(a.x, regionalTerrainHeight(a.x, a.z) + 0.03, a.z)
      s.set(a.roadWidth / ROAD_W, 1, 1)
      M.compose(p, q, s)
      crosswalks.setMatrixAt(i, M)
    })
    crosswalks.count = arms.length
    crosswalks.instanceMatrix.needsUpdate = true
  }
  return { road, sidewalks, crosswalks, roadGeo: geo, sidewalkGeo: footwayGeo }
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
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.92 })
  const crosswalkMat = new THREE.MeshStandardMaterial({ map: zebraTexture(), roughness: 0.95 })
  // A crossing belongs to the junction asset, not an entire road tile: narrow
  // it to the carriageway and keep it compact enough that adjacent arms do
  // not collide in a ten-metre block.
  const crosswalkGeo = new THREE.PlaneGeometry(ROAD_W * 0.76, 1.45)
  crosswalkGeo.rotateX(-Math.PI / 2)

  let road: THREE.Mesh | null = null
  let sidewalks: THREE.Mesh | null = null
  let crosswalks: THREE.InstancedMesh | null = null
  let roadGeo: THREE.BufferGeometry | null = null
  let sidewalkGeo: THREE.BufferGeometry | null = null

  function rebuild(g: RoadGraph): void {
    if (road) scene.remove(road)
    if (sidewalks) scene.remove(sidewalks)
    if (crosswalks) scene.remove(crosswalks)
    const next = buildMesh(g, roadMat, roadGeo, sidewalkMat, sidewalkGeo, crosswalkGeo, crosswalkMat)
    road = next.road
    sidewalks = next.sidewalks
    crosswalks = next.crosswalks
    roadGeo = next.roadGeo
    sidewalkGeo = next.sidewalkGeo
    scene.add(sidewalks, road, crosswalks)
  }

  rebuild(graph)

  return {
    rebuild,
    dispose(): void {
      if (road) scene.remove(road)
      if (sidewalks) scene.remove(sidewalks)
      if (crosswalks) scene.remove(crosswalks)
      roadGeo?.dispose()
      sidewalkGeo?.dispose()
      crosswalkGeo.dispose()
      roadMat.dispose()
      sidewalkMat.dispose()
      crosswalkMat.dispose()
    },
  }
}

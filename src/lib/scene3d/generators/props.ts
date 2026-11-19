/**
 * @file generators/props.ts
 * @description The street-furniture generator (OVERSTORY-DESIGN-R012.10):
 * seeded, parametric low-poly props — trees, streetlamps, benches, signs
 * and bins — the street edges carry at a declared density per block
 * (R012.3). Each prop is clean geometry onto the shared atlas, deterministic
 * for its seed, and within its triangle budget. Instanced rendering is the
 * default for the repeated pieces on the city side.
 */
import * as THREE from 'three'
import { geometryHash } from './buildings'
import { mulberry32 } from './rng'

/** The street-furniture kinds the kit produces (R012.3). */
export type PropKind = 'tree' | 'streetlamp' | 'bench' | 'sign' | 'bin'

/** The trim-sheet row each prop kind maps onto (the prop band: v 0.02–0.20). */
const PROP_ROW: Record<PropKind, number> = { tree: 0, streetlamp: 1, bench: 2, sign: 3, bin: 4 }
const PROP_BAND_V0 = 0.02
const PROP_ROW_H = 0.036

export interface PropParams {
  seed: number
  kind: PropKind
  /** The overall scale in metres (1 = the kit's nominal size). */
  scale?: number
}

export interface PropAsset {
  geometry: THREE.BufferGeometry
  triangles: number
  hash: number
}

/** The triangle budget a street-furniture prop must stay within (R012.8/asset QA). */
export const PROP_TRIANGLE_BUDGET = 200

/** Map a primitive's unit v into its kind's trim-sheet row (the prop band). */
function rowUV(g: THREE.BufferGeometry, row: number): void {
  const uv = g.getAttribute('uv')
  const arr = uv.array as Float32Array
  for (let i = 0; i < arr.length; i += 2) {
    arr[i + 1] = PROP_BAND_V0 + row * PROP_ROW_H + arr[i + 1] * PROP_ROW_H
  }
  uv.needsUpdate = true
}

/** A low-poly cone: the crown, a foliage patch, a lamp head. */
function cone(radius: number, height: number, segments: number, row: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, height, segments)
  rowUV(g, row)
  return g
}

/** A low-poly cylinder: a trunk, a pole. */
function cylinder(rTop: number, rBottom: number, height: number, segments: number, row: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, segments)
  rowUV(g, row)
  return g
}

function box(w: number, h: number, d: number, row: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  rowUV(g, row)
  return g
}

/**
 * Generate one street-furniture prop (R012.10): a merged, clean low-poly
 * mesh from the kit's primitives, seeded per instance so repeated pieces
 * vary (canopy width, lamp head tilt) without ever leaving the budget.
 */
export function propAsset(params: PropParams): PropAsset {
  const { seed, kind, scale = 1 } = params
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, rotZ = 0): void => {
    g.rotateY(rotY)
    g.rotateZ(rotZ)
    g.translate(x, y, z)
    parts.push(g)
  }
  const row = PROP_ROW[kind]
  switch (kind) {
    case 'tree': {
      const trunkH = 0.9 + rand() * 0.2
      place(cylinder(0.1, 0.16, trunkH, 5, row), 0, trunkH / 2, 0)
      const crownR = 0.7 + rand() * 0.25
      place(cone(crownR, 1.8, 6, row), 0, trunkH + 0.8, 0)
      break
    }
    case 'streetlamp': {
      place(cylinder(0.05, 0.08, 3.2, 5, row), 0, 1.6, 0)
      place(cone(0.16, 0.18, 8, row), 0, 3.25, 0, 0, Math.PI)
      break
    }
    case 'bench': {
      place(box(1.6, 0.08, 0.45, row), 0, 0.45, 0)
      place(box(1.6, 0.5, 0.06, row), 0, 0.75, -0.2, Math.PI / 8)
      place(box(0.08, 0.45, 0.4, row), -0.7, 0.22, 0)
      place(box(0.08, 0.45, 0.4, row), 0.7, 0.22, 0)
      break
    }
    case 'sign': {
      place(cylinder(0.04, 0.04, 1.1, 5, row), 0, 0.55, 0)
      place(box(0.7, 0.45, 0.04, row), 0, 1.2, 0, rand() * Math.PI)
      break
    }
    case 'bin': {
      place(cylinder(0.16, 0.13, 0.5, 6, row), 0, 0.25, 0)
      place(cylinder(0.17, 0.17, 0.05, 6, row), 0, 0.52, 0)
      break
    }
  }

  const merged = parts.length === 1 ? parts[0] : mergeParts(parts)
  merged.scale(scale, scale, scale)
  let triangles = 0
  merged.computeVertexNormals()
  for (const p of parts) {
    const idx = p.getIndex()
    const count = idx ? idx.count : p.getAttribute('position').count
    triangles += count / 3
  }
  for (const p of parts) p.dispose()
  return { geometry: merged, triangles: Math.round(triangles), hash: geometryHash(merged) }
}

/** Merge a set of geoms that share the position/uv attribute layout. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const part of parts) {
    const pos = part.getAttribute('position')
    const uv = part.getAttribute('uv')
    const idx = part.getIndex()
    const base = positions.length / 3
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      uvs.push(uv.getX(i), uv.getY(i))
    }
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base)
    else for (let i = 0; i < pos.count; i++) indices.push(base + i)
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  out.setIndex(indices)
  return out
}

/**
 * @file generators/roads.ts
 * @description The road generator (OVERSTORY-DESIGN-R012.10): seeded,
 * parametric code that emits clean road-tile geometry — the ribbon of a
 * curved segment with kerbs, lane markings baked into the UVs and
 * crosswalk bands at its ends — onto the shared atlas. The same seed always
 * produces the same tile; the geometry stays within its triangle budget.
 */
import * as THREE from 'three'
import { geometryHash } from './buildings'
import { mulberry32 } from './rng'

export interface RoadTileParams {
  seed: number
  /** The run length in metres. */
  length: number
  /** The run width in metres (lane pair). */
  width: number
  /** The lateral bow in metres (0 = straight). */
  curve: number
  /** Crosswalk bands at both ends (the intersections' bands). */
  crosswalks: boolean
}

export interface RoadTileAsset {
  geometry: THREE.BufferGeometry
  triangles: number
  hash: number
}

/**
 * Generate one road tile (R012.10): a ribbon swept along a gentle arc,
 * with kerb shoulders and a dashed centre line carried in the UVs (the
 * trim sheet's road row). Crosswalk bands are quads across the ends.
 * The seed drives the lane-marking phase, so two tiles of the same shape
 * never start their dash pattern at the same offset — while remaining
 * deterministic for their seed.
 */
export function roadTileAsset(params: RoadTileParams): RoadTileAsset {
  const { seed, length, width, curve, crosswalks } = params
  const segments = Math.max(4, Math.round(length / 2))
  const half = width / 2
  const rand = mulberry32(seed)
  const phase = rand() // lane-marking phase in the trim sheet's road row

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const push = (x: number, y: number, z: number, u: number, v: number): number => {
    positions.push(x, y, z)
    uvs.push(u, v)
    return positions.length / 3 - 1
  }

  // The arc: the run bows laterally by `curve` metres at its midpoint.
  // Each step pushes the left kerb vertex then the right kerb vertex, so
  // step i's vertices are 2i and 2i+1. The quad (prevLeft, prevRight,
  // curRight, curLeft) triangulates with an up-facing normal (+y), the
  // side a material with one face sees from the ground plane up.
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const z = t * length
    const bow = curve * (4 * t * (1 - t))
    // The road band of the trim sheet (v 0.78–0.98): u across the width
    // (lane markings), v along the run (the dash pattern tiles).
    const v = 0.78 + ((t + phase) % 1) * 0.2
    const a = push(bow - half, 0.02, z, 0, v) // left kerb
    const b = push(bow + half, 0.02, z, 1, v) // right kerb
    if (i > 0) {
      const pl = a - 2 // previous left
      const pr = a - 1 // previous right
      indices.push(pl, b, pr, pl, a, b)
    }
  }

  // Crosswalk bands: zebra quads across each end. Both ends use z0 < z1 so
  // every stripe shares the same up-facing winding.
  if (crosswalks) {
    const stripes = 4
    for (const [z0, z1] of [
      [0, 0.9],
      [length - 0.9, length],
    ] as [number, number][]) {
      for (let s = 0; s < stripes; s++) {
        const x0 = -half + ((s + 0.2) * width) / stripes
        const x1 = -half + ((s + 0.8) * width) / stripes
        const p0 = push(x0, 0.03, z0, 0, 0.78)
        const p1 = push(x1, 0.03, z0, 1, 0.78)
        const p2 = push(x0, 0.03, z1, 1, 0.98)
        const p3 = push(x1, 0.03, z1, 0, 0.98)
        indices.push(p0, p2, p1, p0, p2, p3)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const idx = geometry.getIndex()
  const triangles = idx ? idx.count / 3 : positions.length / 9
  return { geometry, triangles: Math.round(triangles), hash: geometryHash(geometry) ^ (seed & 0xffff) }
}

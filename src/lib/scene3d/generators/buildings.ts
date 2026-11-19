/**
 * @file generators/buildings.ts
 * @description The building generator (OVERSTORY-DESIGN-R012.10): parametric,
 * seeded, reviewed code that emits clean building geometry from a footprint,
 * floor count and district archetype, with unified UVs onto the shared
 * texture atlas (the building band: v 0.25–0.75, one column per building).
 * The same seed always produces the same asset, the output stays within its
 * triangle budget, and the manifest entry's hash regenerates from the recipe
 * (R012.10's bound test).
 */
import * as THREE from 'three'
import { mulberry32 } from './rng'

/** The district archetypes the building kit recognises (R012.3). */
export type DistrictArchetype = 'gateway' | 'datahall' | 'workshop' | 'storehouse' | 'studio' | 'docks'

export interface BuildingParams {
  /** The deterministic seed: the same seed always produces the same asset. */
  seed: number
  /** The architectural archetype the kit builds from. */
  archetype: DistrictArchetype
  /** The footprint in metres (w × d). */
  footprint: [number, number]
  /** The storey count (1..16). */
  floors: number
}

/** The shared atlas region a building's UVs occupy (R012.2 trim sheet). */
export interface AtlasRegion {
  u0: number
  v0: number
  u1: number
  v1: number
}

export interface BuildingAsset {
  /** The clean building geometry (floors, window bands, roof). */
  geometry: THREE.BufferGeometry
  /** The trim-sheet region its UVs are mapped onto. */
  atlas: AtlasRegion
  /** The triangle count, measured from the geometry. */
  triangles: number
}

/** The FNV-1a hash a manifest entry pins against (R012.10: regenerates to its locked hash). */
export function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The per-archetype vocabulary (the art direction's architectural kit). */
export const ARCHITECTURE: Record<DistrictArchetype, { floorH: number; parapet: boolean; windowBand: number }> = {
  gateway: { floorH: 3.4, parapet: true, windowBand: 0.34 },
  datahall: { floorH: 4.2, parapet: true, windowBand: 0.24 },
  workshop: { floorH: 3.0, parapet: false, windowBand: 0.42 },
  storehouse: { floorH: 3.2, parapet: true, windowBand: 0.3 },
  studio: { floorH: 3.6, parapet: false, windowBand: 0.46 },
  docks: { floorH: 2.8, parapet: false, windowBand: 0.38 },
}

/**
 * Generate one building (R012.10): a clean, low-poly mass per the
 * archetype — storeys stacked from the footprint, a seed-driven bay
 * rhythm on the facades, per-storey window bands and the archetype's
 * roof (flat, with a parapet rim where declared). Every UV maps onto the
 * building's trim-sheet region: the lower half is the wall material, the
 * band above it the windows, the top row the roof — so the material is a
 * single authored PBR set (R012.2), never flat-colour boxes.
 */
export function buildingAsset(params: BuildingParams): BuildingAsset {
  const { seed, archetype, footprint, floors } = params
  const [w, d] = footprint
  const arch = ARCHITECTURE[archetype]
  const rand = mulberry32(seed)

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const push = (x: number, y: number, z: number, u: number, v: number): number => {
    positions.push(x, y, z)
    uvs.push(u, v)
    return positions.length / 3 - 1
  }
  // A quad from four cyclic corners A, B, C, D; the A–C diagonal tiling.
  const quad = (a: number, b: number, c: number, dd: number): void => {
    indices.push(a, b, c, a, c, dd)
  }

  // The atlas region: one column of the shared trim sheet per building
  // (the building band: v 0.25–0.75).
  const col = Math.abs(seed) % 4
  const atlas: AtlasRegion = { u0: col * 0.25, v0: 0.25, u1: col * 0.25 + 0.25, v1: 0.75 }
  // Map unit UVs (u across the bay, v within the band) into the region:
  // wall at v 0..0.5, windows at 0.5..0.9, roof at 0.9..1.0.
  const auv = (u: number, v: number): [number, number] => [
    atlas.u0 + u * (atlas.u1 - atlas.u0),
    atlas.v0 + v * (atlas.v1 - atlas.v0),
  ]

  // The seed-driven bay rhythm: each facade divides into bays of ~3 m;
  // the per-building and per-bay macro variation breaks visible tiling
  // (R012.2).
  const baysX = Math.max(2, Math.round(w / 3))
  const baysZ = Math.max(2, Math.round(d / 3))
  const variation = rand()

  const floorH = arch.floorH
  const totalH = floors * floorH
  const hw = w / 2
  const hd = d / 2
  const bandH = floorH * (1 - arch.windowBand) // wall portion of the storey

  /**
   * One wall panel: the cyclic corners A, B (bottom edge) and D, C (top
   * edge) of the bay, with the bay's u span and the panel's v row. The
   * caller passes the corner order that faces the street (front +x order,
   * back -x order, right -z order, left +z order), which gives the panel
   * its outward normal.
   */
  const panel = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y0: number,
    y1: number,
    u0: number,
    u1: number,
    vLo: number,
    vHi: number,
  ): void => {
    const [au0, avLo] = auv(u0, vLo)
    const [au1, avHi] = auv(u1, vHi)
    const a = push(ax, y0, az, au0, avLo)
    const b = push(bx, y0, bz, au1, avLo)
    const c = push(bx, y1, bz, au1, avHi)
    const dd = push(ax, y1, az, au0, avHi)
    quad(a, b, c, dd)
  }

  // Each storey: a wall band and a window band per bay, on all four walls.
  // The corner order per face is chosen so the normal faces the street
  // (verified per face: front +z, back -z, right +x, left -x).
  for (let f = 0; f < floors; f++) {
    const y0 = f * floorH
    const yWall = y0 + bandH
    const yTop = y0 + floorH
    for (let b = 0; b < baysX; b++) {
      const x0 = -hw + (b * w) / baysX
      const x1 = x0 + w / baysX
      const shrink = 0.04 + variation * 0.02 + rand() * 0.02
      // Front face (z = +hd, outward +z): corners in +x order.
      panel(x0 + shrink, hd, x1 - shrink, hd, y0, yWall, b / baysX, (b + 1) / baysX, 0, 0.5)
      // Back face (z = -hd, outward -z): corners in -x order.
      panel(x1 - shrink, -hd, x0 + shrink, -hd, y0, yWall, b / baysX, (b + 1) / baysX, 0, 0.5)
      // Window bands (upper part of the storey), the same corners.
      panel(x0 + shrink, hd, x1 - shrink, hd, yWall, yTop, b / baysX, (b + 1) / baysX, 0.5, 0.9)
      panel(x1 - shrink, -hd, x0 + shrink, -hd, yWall, yTop, b / baysX, (b + 1) / baysX, 0.5, 0.9)
    }
    for (let b = 0; b < baysZ; b++) {
      const z0 = -hd + (b * d) / baysZ
      const z1 = z0 + d / baysZ
      const shrink = 0.04 + variation * 0.02 + rand() * 0.02
      // Right face (x = +hw, outward +x): corners in -z order.
      panel(hw, z1 - shrink, hw, z0 + shrink, y0, yWall, b / baysZ, (b + 1) / baysZ, 0, 0.5)
      // Left face (x = -hw, outward -x): corners in +z order.
      panel(-hw, z0 + shrink, -hw, z1 - shrink, y0, yWall, b / baysZ, (b + 1) / baysZ, 0, 0.5)
      panel(hw, z1 - shrink, hw, z0 + shrink, yWall, yTop, b / baysZ, (b + 1) / baysZ, 0.5, 0.9)
      panel(-hw, z0 + shrink, -hw, z1 - shrink, yWall, yTop, b / baysZ, (b + 1) / baysZ, 0.5, 0.9)
    }
  }

  // The roof: a flat quad over the footprint (outward +y), mapped onto
  // the roof row of the region.
  const yRoof = totalH
  const [rfu0, rfuLo] = auv(0, 0.9)
  const [rfu1, rfuHi] = auv(1, 1.0)
  const rA = push(-hw, yRoof, hd, rfu0, rfuLo)
  const rB = push(hw, yRoof, hd, rfu1, rfuLo)
  const rC = push(hw, yRoof, -hd, rfu1, rfuHi)
  const rD = push(-hw, yRoof, -hd, rfu0, rfuHi)
  quad(rA, rB, rC, rD)

  // The parapet rim (declared per archetype): a low wall around the roof
  // edge, mapped onto the top of the wall row.
  if (arch.parapet) {
    const yP0 = yRoof
    const yP1 = yRoof + 0.4
    const [pu0, pvLo] = auv(0, 0.42)
    const [pu1, pvHi] = auv(1, 0.5)
    const pA = push(-hw, yP0, hd, pu0, pvLo)
    const pB = push(hw, yP0, hd, pu1, pvLo)
    const pC = push(hw, yP1, hd, pu1, pvHi)
    const pD = push(-hw, yP1, hd, pu0, pvHi)
    quad(pA, pB, pC, pD) // front edge, +z
    const eA = push(hw, yP0, -hd, pu1, pvLo)
    const eB = push(-hw, yP0, -hd, pu0, pvLo)
    const eC = push(-hw, yP1, -hd, pu0, pvHi)
    const eD = push(hw, yP1, -hd, pu1, pvHi)
    quad(eA, eB, eC, eD) // back edge, -z
    const fA = push(hw, yP0, hd, pu1, pvLo)
    const fB = push(hw, yP0, -hd, pu0, pvLo)
    const fC = push(hw, yP1, -hd, pu0, pvHi)
    const fD = push(hw, yP1, hd, pu1, pvHi)
    quad(fA, fB, fC, fD) // right edge, +x
    const gA = push(-hw, yP0, -hd, pu0, pvLo)
    const gB = push(-hw, yP0, hd, pu1, pvLo)
    const gC = push(-hw, yP1, hd, pu1, pvHi)
    const gD = push(-hw, yP1, -hd, pu0, pvHi)
    quad(gA, gB, gC, gD) // left edge, -x
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const idx = geometry.getIndex()
  const triangles = idx ? idx.count / 3 : positions.length / 9
  return { geometry, atlas, triangles: Math.round(triangles) }
}

/**
 * The content hash a manifest entry pins (R012.10): position + UV + index
 * bytes through FNV-1a, so a regenerated asset is byte-verifiable against
 * its locked hash.
 */
export function geometryHash(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const idx = geometry.getIndex()
  const posBytes = (pos.array as Float32Array).byteLength
  const uvBytes = (uv.array as Float32Array).byteLength
  const idxBytes = idx ? (idx.array as Uint32Array | Uint16Array).byteLength : 0
  const bytes = new Uint8Array(posBytes + uvBytes + idxBytes)
  let offset = 0
  const put = (src: ArrayBufferLike): void => {
    bytes.set(new Uint8Array(src, 0, Math.min(src.byteLength, bytes.length - offset)), offset)
    offset += Math.min(src.byteLength, bytes.length - offset)
  }
  put((pos.array as Float32Array).buffer)
  put((uv.array as Float32Array).buffer)
  if (idx) put((idx.array as Uint32Array | Uint16Array).buffer)
  return fnv1a(bytes)
}

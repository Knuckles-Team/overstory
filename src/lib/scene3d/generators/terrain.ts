/**
 * @file terrain.ts
 * @description The seeded terrain generator (OVERSTORY-CITY-R041,
 * constitution R-G7). Terrain ships as about 1 KB of parameters, not a
 * model: a seeded value-noise heightmap with thermal erosion, built at
 * load time. The same parameters always give the same heightmap.
 */
import { mulberry32 } from './rng'

export interface TerrainParams {
  seed: number
  /** Grid cells per side. */
  size: number
  /** Noise octaves. */
  octaves: number
  /** Amplitude falloff per octave. */
  persistence: number
  /** Base feature size in cells. */
  scale: number
  /** Heights at or below this are water. */
  seaLevel: number
  /** Thermal erosion passes. */
  erosion: number
  /** Largest height difference a cell keeps against a neighbour. */
  talus: number
}

export const DEFAULT_TERRAIN: TerrainParams = {
  seed: 20261120,
  size: 64,
  octaves: 4,
  persistence: 0.5,
  scale: 24,
  seaLevel: 0.42,
  erosion: 12,
  talus: 0.02,
}

export interface Heightmap {
  size: number
  heights: Float32Array
}

function lattice(seed: number, n: number): Float32Array {
  const r = mulberry32(seed)
  const out = new Float32Array(n * n)
  for (let i = 0; i < out.length; i++) out[i] = r()
  return out
}

const smooth = (t: number): number => t * t * (3 - 2 * t)

function sample(grid: Float32Array, n: number, x: number, z: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = smooth(x - x0)
  const fz = smooth(z - z0)
  const at = (i: number, j: number): number => grid[(((j % n) + n) % n) * n + (((i % n) + n) % n)]
  const a = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * fx
  const b = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * fx
  return a + (b - a) * fz
}

/** Build the heightmap in [0, 1]. Pure and deterministic. */
export function generateTerrain(p: TerrainParams = DEFAULT_TERRAIN): Heightmap {
  const n = p.size
  const h = new Float32Array(n * n)
  const L = 64
  const grids = Array.from({ length: p.octaves }, (_, o) => lattice(p.seed + o * 7919, L))
  let max = 0
  let min = Infinity
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      let amp = 1
      let freq = 1 / p.scale
      let v = 0
      let norm = 0
      for (let o = 0; o < p.octaves; o++) {
        v += amp * sample(grids[o], L, x * freq, z * freq)
        norm += amp
        amp *= p.persistence
        freq *= 2
      }
      v /= norm
      h[z * n + x] = v
      max = Math.max(max, v)
      min = Math.min(min, v)
    }
  }
  const span = max - min || 1
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - min) / span
  for (let pass = 0; pass < p.erosion; pass++) {
    const next = Float32Array.from(h)
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
        ]) {
          const xx = x + dx
          const zz = z + dz
          if (xx >= n || zz >= n) continue
          const j = zz * n + xx
          const d = next[i] - next[j]
          if (Math.abs(d) > p.talus) {
            const move = (Math.abs(d) - p.talus) / 2
            const s = d > 0 ? 1 : -1
            next[i] -= s * move
            next[j] += s * move
          }
        }
      }
    }
    h.set(next)
  }
  return { size: n, heights: h }
}

/** The steepest height difference between neighbouring cells. */
export function maxSlope(m: Heightmap): number {
  const { size: n, heights: h } = m
  let s = 0
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      if (x + 1 < n) s = Math.max(s, Math.abs(h[z * n + x] - h[z * n + x + 1]))
      if (z + 1 < n) s = Math.max(s, Math.abs(h[z * n + x] - h[(z + 1) * n + x]))
    }
  return s
}

/** The fraction of cells at or below sea level. */
export function waterFraction(m: Heightmap, seaLevel: number): number {
  let w = 0
  for (const v of m.heights) if (v <= seaLevel) w++
  return w / m.heights.length
}

/**
 * @file assetQa.test.ts
 * @description Automated asset QA for the locked city assets
 * (OVERSTORY-CITY-R013/R028): every pinned GLB is parsed from its real
 * bytes and checked against the one budgets table — triangles, material
 * count and texture size — so a failing asset never enters the lock. The
 * GLB container is read directly (glTF 2.0 binary layout), no renderer
 * required.
 */
// spec: OVERSTORY-CITY-R013, OVERSTORY-CITY-R028, OVERSTORY-CITY-R048.1, OVERSTORY-CITY-R048.2, OVERSTORY-CITY-R048.4
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUDGETS } from '../core/budgets'

const PUBLIC_DIR = join(__dirname, '..', '..', '..', '..', 'public')

interface GltfJson {
  meshes?: { primitives?: { indices?: number; attributes: Record<string, number> }[] }[]
  accessors?: { count: number }[]
  materials?: unknown[]
  images?: { width?: number; height?: number; uri?: string }[]
}

/** Parse the glTF JSON chunk out of a GLB binary (glTF 2.0 layout). */
function parseGlb(buf: Buffer): GltfJson {
  expect(buf.subarray(0, 4).toString('hex')).toBe('676c5446') // 'glTF' magic
  expect(buf.readUInt32LE(4)).toBe(2) // container version
  expect(buf.readUInt32LE(8)).toBe(buf.length) // declared length == file size
  let off = 12
  let json: GltfJson | null = null
  while (off < buf.length) {
    const chunkLength = buf.readUInt32LE(off)
    const chunkType = buf.readUInt32LE(off + 4)
    const data = buf.subarray(off + 8, off + 8 + chunkLength)
    if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString('utf8')) // JSON chunk
    off += 8 + chunkLength
  }
  if (!json) throw new Error('GLB has no JSON chunk')
  return json
}

/** Total triangle count: indexed primitives divide by 3, else the position accessor. */
function trianglesOf(g: GltfJson): number {
  let total = 0
  for (const mesh of g.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const accessor = g.accessors?.[prim.indices ?? prim.attributes.POSITION]
      total += accessor ? Math.floor(accessor.count / 3) : 0
    }
  }
  return total
}

describe('asset QA budgets (R013/R028)', () => {
  it('the budgets table states the per-locked-GLB QA limits', () => {
    expect(BUDGETS.assetTriangles).toBe(4000)
    expect(BUDGETS.assetMaterials).toBe(16)
    expect(BUDGETS.assetTexturePx).toBe(2048)
  })

  it('every pinned GLB clears the triangle, material and texture budgets', () => {
    const raw = JSON.parse(readFileSync(join(PUBLIC_DIR, 'city-assets', 'assets.lock.json'), 'utf8')) as {
      files: Record<string, unknown>
    }
    const paths = Object.keys(raw.files)
    for (const path of paths) {
      expect(path, 'every pin lives under city-assets/').toMatch(/^city-assets\//)
    }
    expect(paths).toContain('city-assets/characters/robot-expressive.glb')
    expect(paths).toContain('city-assets/marker-cube.glb')
    for (const path of paths) {
      const g = parseGlb(readFileSync(join(PUBLIC_DIR, path)))
      expect(trianglesOf(g), `${path} triangle budget`).toBeLessThanOrEqual(BUDGETS.assetTriangles)
      expect(g.materials?.length ?? 0, `${path} material budget`).toBeLessThanOrEqual(BUDGETS.assetMaterials)
      for (const img of g.images ?? []) {
        expect(Math.max(img.width ?? 0, img.height ?? 0), `${path} texture size budget`).toBeLessThanOrEqual(
          BUDGETS.assetTexturePx,
        )
      }
    }
  })

  it('the v1 asset set carries no embedded images (audit: zero textures)', () => {
    const raw = JSON.parse(readFileSync(join(PUBLIC_DIR, 'city-assets', 'assets.lock.json'), 'utf8')) as {
      files: Record<string, unknown>
    }
    for (const path of Object.keys(raw.files)) {
      const g = parseGlb(readFileSync(join(PUBLIC_DIR, path)))
      expect(g.images?.length ?? 0, `${path} has embedded images`).toBe(0)
    }
  })
})

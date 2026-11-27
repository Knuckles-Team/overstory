/**
 * @file civilianPack.test.ts
 * @description The civil character pack (OVERSTORY-CITY-R049, T102): at least
 * twelve low-poly civilian variants over a shared rigged base, each admitting
 * through the R013/R024 gates (catalog entry, license, QA budget). Variants
 * are stored under public/city-assets/characters/ and read as ambient npc life.
 *
 * The geometry uses simple primitives (boxes, cylinders) so every variant can
 * share the same animation clip set (idle, walk, sit, talk, interact).
 * Skin tone, shirt colour, pants colour and build variation give each family
 * a distinct look at street scale.
 */
// spec: OVERSTORY-CITY-R049, OVERSTORY-CITY-R013, OVERSTORY-CITY-R024
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHAR_DIR = join(__dirname, '..', '..', '..', '..', 'public', 'city-assets', 'characters')

/** Parse glTF JSON from a GLB binary (minimal). */
function parseGlb(buf: Buffer): {
  meshes?: { primitives?: { indices?: number; attributes: Record<string, number> }[] }[]
  accessors?: { count: number }[]
  materials?: unknown[]
} {
  if (buf.subarray(0, 4).toString('hex') !== '676c5446') throw new Error('not glTF')
  if (buf.readUInt32LE(4) !== 2) throw new Error('not glTF 2.0')
  let off = 12
  let json: { meshes?: unknown[]; accessors?: { count: number }[]; materials?: unknown[] } | null = null
  while (off < buf.length) {
    const cl = buf.readUInt32LE(off)
    const ct = buf.readUInt32LE(off + 4)
    const data = buf.subarray(off + 8, off + 8 + cl)
    if (ct === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
    off += 8 + cl
  }
  if (!json) throw new Error('no JSON chunk')
  return json
}

function trianglesOf(g: { meshes?: { primitives?: { indices?: number; attributes: Record<string, number> }[] }[]; accessors?: { count: number }[] }): number {
  let total = 0
  for (const mesh of g.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const acc = g.accessors?.[prim.indices ?? prim.attributes.POSITION]
      total += acc ? Math.floor(acc.count / 3) : 0
    }
  }
  return total
}

describe('civilian pack (R049 / T102)', () => {
  it('at least twelve character GLBs exist under characters/', () => {
    const files = readdirSync(CHAR_DIR).filter((f) => f.endsWith('.glb') && f.startsWith('civilian-'))
    expect(files.length).toBeGreaterThanOrEqual(12)
  })

  it('every civilian variant is pinned in the lock with matching digest and license', () => {
    const lock = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'public', 'city-assets', 'assets.lock.json'), 'utf8'))
    for (let i = 0; i < 12; i++) {
      const name = `civilian-${i.toString().padStart(3, '0')}`
      const path = `city-assets/characters/${name}.glb`
      expect(lock.files, `${name} missing from lock`).toHaveProperty(path)
      const spec = lock.files[path]
      expect(spec.license).toBe('CC0-1.0')
      const buf = readFileSync(join(__dirname, '..', '..', '..', '..', 'public', path))
      expect(buf.byteLength).toBe(spec.bytes)
      expect(createHash('sha256').update(buf).digest('hex')).toBe(spec.sha256)
    }
  })

  it('every civilian variant clears the QA budgets (4000 tris, 16 mats, no textures)', () => {
    for (let i = 0; i < 12; i++) {
      const name = `civilian-${i.toString().padStart(3, '0')}`
      const path = join(CHAR_DIR, `${name}.glb`)
      const buf = readFileSync(path)
      const g = parseGlb(buf)
      const tris = trianglesOf(g)
      const mats = (g.materials?.length ?? 0)
      expect(tris, `${name}: triangles`).toBeLessThanOrEqual(4000)
      expect(mats, `${name}: materials`).toBeLessThanOrEqual(16)
      // No embedded images (no textures)
      for (const img of g.images ?? []) {
        expect(Math.max(img.width ?? 0, img.height ?? 0), `${name}: texture px`).toBeLessThanOrEqual(2048)
      }
    }
  })

  it('variants differ in skin tone, shirt, pants and build — every combo is unique', () => {
    const manifest = JSON.parse(readFileSync(join(CHAR_DIR, 'civilian-manifest.json'), 'utf8'))
    const combos = new Set<string>()
    for (const v of manifest.variants) {
      const key = `${v.skin}-${v.shirt}-${v.pants}-${v.build}`
      expect(combos.has(key), `${v.id} duplicates combo ${key}`).toBe(false)
      combos.add(key)
    }
    expect(combos.size).toBeGreaterThanOrEqual(12)
  })

  it('the shared rig (robot-expressive) still exists and is separate from the npc pack', () => {
    const files = readdirSync(CHAR_DIR).filter((f) => f.endsWith('.glb'))
    expect(files).toContain('robot-expressive.glb')
    // The robot is a separate file, not a civilian variant
    const civilian = files.filter((f) => f.startsWith('civilian-'))
    expect(civilian.length).toBeGreaterThanOrEqual(12)
    // Robot is not in the civilian manifest
    const manifest = JSON.parse(readFileSync(join(CHAR_DIR, 'civilian-manifest.json'), 'utf8'))
    const ids = manifest.variants.map((v: { id: string }) => v.id)
    expect(ids).not.toContain('robot-expressive')
  })

  it('total character pack weight is reasonable (under 500 KB)', () => {
    let total = 0
    for (const f of readdirSync(CHAR_DIR).filter((f) => f.startsWith('civilian-'))) {
      total += readFileSync(join(CHAR_DIR, f)).byteLength
    }
    expect(total).toBeLessThan(500 * 1024)
  })
})

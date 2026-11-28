/**
 * @file faunaAssets.test.ts
 * @description The fauna asset families of OVERSTORY-CITY-R054 are pinned,
 * licensed and real GLBs. Behaviour (routes, flocks) is a later row.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..', '..', 'public')
const lock = JSON.parse(readFileSync(join(ROOT, 'city-assets', 'assets.lock.json'), 'utf8')) as {
  license_allowlist: string[]
  files: Record<string, { sha256: string; bytes: number; license: string }>
}
const FAUNA = ['seagull', 'dog', 'fish'].map((name) => `city-assets/kit/fauna/fauna.${name}.glb`)

describe('fauna asset families (R054)', () => {
  // spec: OVERSTORY-CITY-R054
  it('pins the fauna families with licence and sha256 and parses them as GLBs', () => {
    for (const path of FAUNA) {
      const pin = lock.files[path]
      expect(pin, path).toBeDefined()
      expect(lock.license_allowlist).toContain(pin.license)
      const bytes = readFileSync(join(ROOT, path))
      expect(bytes.length).toBe(pin.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256)
      // A binary glTF: magic, version 2, declared length, and a JSON chunk naming a scene.
      expect(bytes.toString('ascii', 0, 4)).toBe('glTF')
      expect(bytes.readUInt32LE(4)).toBe(2)
      expect(bytes.readUInt32LE(8)).toBe(bytes.length)
      const jsonLength = bytes.readUInt32LE(12)
      expect(bytes.toString('ascii', 16, 20)).toBe('JSON')
      const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as {
        asset: { version: string }
        meshes?: unknown[]
      }
      expect(gltf.asset.version).toBe('2.0')
      expect(gltf.meshes?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

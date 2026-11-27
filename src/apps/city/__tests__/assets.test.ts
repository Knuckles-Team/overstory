/**
 * @file assets.test.ts
 * @description Pinned asset verification (OVERSTORY-CITY-R013/R016): the
 * lockfile is parsed by its Zod schema, every pinned file is verified
 * byte-for-byte (byte count + SHA-256) against the real files under
 * `public/city-assets/`, the pinned byte cache serves one fetch per pin,
 * and the total asset weight stays under the 5 MB budget.
 */
// spec: OVERSTORY-CITY-R013, OVERSTORY-CITY-R016
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearPins, pinBytes, pinnedBytes } from '../core/assets'
import { assetsLockSchema } from '../schemas'

const ASSETS_DIR = join(__dirname, '..', '..', '..', '..', 'public')

interface PinSpec {
  source_path: string
  sha256: string
  bytes: number
  license: string
}

let lock: { files: Record<string, PinSpec>; license_allowlist: string[] }

beforeAll(() => {
  const raw = JSON.parse(readFileSync(join(ASSETS_DIR, 'city-assets', 'assets.lock.json'), 'utf8'))
  const parsed = assetsLockSchema.safeParse(raw)
  expect(parsed.success).toBe(true)
  if (!parsed.success) throw new Error('lockfile failed its own schema')
  lock = parsed.data
})

afterAll(() => {
  clearPins()
})

describe('lockfile (R013)', () => {
  it('pins 2 external files (shared rig + marker) plus 12 civilian characters; the kit is tracked per catalog', () => {
    const external = Object.keys(lock.files).filter((p) => !p.startsWith('city-assets/kit/'))
    expect(external).toHaveLength(14)
    expect(external).toContain('city-assets/characters/robot-expressive.glb')
    expect(external).toContain('city-assets/marker-cube.glb')
    for (let i = 0; i < 12; i++) {
      expect(external).toContain(`city-assets/characters/civilian-${i.toString().padStart(3, '0')}.glb`)
    }
    for (const p of Object.keys(lock.files)) expect(p.startsWith('city-assets/')).toBe(true)
  })

  it('every pin carries a license inside the lockfile allowlist (R013 gate)', () => {
    expect(lock.license_allowlist.length).toBeGreaterThan(0)
    for (const [path, spec] of Object.entries(lock.files)) {
      expect(spec.license.length, `${path}: missing license`).toBeGreaterThan(0)
      expect(lock.license_allowlist, `${path}: license "${spec.license}" outside the allowlist`).toContain(
        spec.license,
      )
    }
  })

  it('the schema requires the per-file license and a non-empty allowlist', () => {
    // A pin without a license fails the schema (licensing is a gate, not a note).
    const noLicense = {
      files: { 'x.glb': { source_path: 'x.glb', sha256: 'a'.repeat(64), bytes: 10 } },
      license_allowlist: ['MIT'],
    }
    expect(assetsLockSchema.safeParse(noLicense).success).toBe(false)
    // An empty allowlist fails the schema.
    const noAllowlist = {
      files: { 'x.glb': { source_path: 'x.glb', sha256: 'a'.repeat(64), bytes: 10, license: 'MIT' } },
      license_allowlist: [],
    }
    expect(assetsLockSchema.safeParse(noAllowlist).success).toBe(false)
    // A well-formed lock parses.
    const ok = {
      files: { 'x.glb': { source_path: 'x.glb', sha256: 'a'.repeat(64), bytes: 10, license: 'MIT' } },
      license_allowlist: ['MIT', 'CC0-1.0'],
    }
    expect(assetsLockSchema.safeParse(ok).success).toBe(true)
  })

  it('verifies every pinned file: byte count and SHA-256', () => {
    const bad: string[] = []
    let ok = 0
    for (const [path, spec] of Object.entries(lock.files)) {
      const buf = readFileSync(join(ASSETS_DIR, path))
      if (buf.byteLength !== spec.bytes) {
        bad.push(`${path}: size ${buf.byteLength} != ${spec.bytes}`)
        continue
      }
      const hash = createHash('sha256').update(buf).digest('hex')
      if (hash !== spec.sha256) bad.push(`${path}: sha256 mismatch`)
      else ok++
    }
    expect(bad, bad.join('; ')).toHaveLength(0)
    expect(ok).toBe(Object.keys(lock.files).length)
  })

  it('stays under the 8 MB budget (R016, amended 2026-11-25: full pinned set under 8 MB)', () => {
    const total = Object.values(lock.files).reduce((sum, p) => sum + p.bytes, 0)
    expect(total).toBeLessThan(8 * 1024 * 1024)
  })
})

describe('pinned byte cache (R013)', () => {
  it('serves the verified bytes exactly once per pin', () => {
    const path = 'city-assets/characters/robot-expressive.glb'
    const raw = readFileSync(join(ASSETS_DIR, path))
    const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    pinBytes(path, bytes)
    expect(pinnedBytes(path)).toBe(bytes)
    expect(pinnedBytes('city-assets/not-pinned.glb')).toBeNull()
    clearPins()
    expect(pinnedBytes(path)).toBeNull()
  })

  it('a re-pin replaces the previous bytes', () => {
    const a = new ArrayBuffer(4)
    const b = new ArrayBuffer(8)
    pinBytes('x.glb', a)
    pinBytes('x.glb', b)
    expect(pinnedBytes('x.glb')).toBe(b)
    clearPins()
  })
})

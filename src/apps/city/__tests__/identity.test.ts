/**
 * @file identity.test.ts
 * @description Original identity (OVERSTORY-CITY-R046): licensed assets,
 * synthesized audio, pseudonymous names, and the interim third-party rig
 * flagged for replacement.
 */
// spec: OVERSTORY-CITY-R046
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROSTER } from '../core/ecosystem'

const ROOT = join(__dirname, '..', '..', '..', '..')
const lock = JSON.parse(readFileSync(join(ROOT, 'public/city-assets/assets.lock.json'), 'utf8')) as {
  license_allowlist: string[]
  files: Record<string, { license: string; source_path: string }>
}

describe('identity', () => {
  it('admits only allowlisted licenses, each with a recorded source', () => {
    for (const [p, f] of Object.entries(lock.files)) {
      expect(lock.license_allowlist, p).toContain(f.license)
      expect(f.source_path.length, p).toBeGreaterThan(0)
    }
  })

  it('names every character by its pseudonymous id, never from a retired roster', () => {
    for (const r of ROSTER) expect(r.id).toMatch(/^(agent|operator)-\d{2}$/)
    const retired = ['kevin', 'mayor', 'officer', 'nightshift', 'speedwell', 'pruitt', 'dalrymple']
    const text = JSON.stringify(ROSTER).toLowerCase()
    for (const n of retired) expect(text.includes(n), n).toBe(false)
  })

  it('synthesizes its audio: the audio module carries no sample reference', () => {
    const src = readFileSync(join(ROOT, 'src/apps/city/core/audio.ts'), 'utf8')
    expect(src).not.toMatch(/\.(mp3|ogg|wav)['"]/)
    expect(src).not.toMatch(/fetch\(|decodeAudioData/)
  })

  it('flags the interim third-party rig for replacement by a generated rig', () => {
    const sources = readFileSync(join(ROOT, 'public/city-assets/SOURCES.md'), 'utf8').toLowerCase()
    expect(Object.keys(lock.files).length).toBeLessThanOrEqual(2)
    expect(sources).toMatch(/interim|replace/)
  })
})

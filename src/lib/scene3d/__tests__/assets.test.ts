/**
 * @file assets.test.ts
 * @description The art-direction conformance (OVERSTORY-DESIGN-R012.8):
 * every locked asset carries a style-guide archetype, palette conformance
 * (every scene colour derives from a browser design token), and triangle,
 * texture and material budgets within its tier. The tokens are read from
 * `src/index.css` — the source of truth the design-system page documents —
 * so the style guide cannot drift from the tokens, and the documented
 * archetype vocabulary pins the generator code it is written for.
 */
// spec: OVERSTORY-DESIGN-R012.8
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { ARCHITECTURE, buildingAsset, propAsset, roadTileAsset, type DistrictArchetype } from '../generators'
import {
  ASSET_BUDGETS,
  ARCHETYPE_GUIDE,
  FAMILY_MATERIALS,
  PROP_KINDS,
  SCENE_COLORS,
  TEXTURE_BUDGET_BYTES,
  TRIM_SHEET,
} from '../palette'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

interface ManifestEntry {
  id: string
  generator: 'building' | 'road-tile' | 'prop'
  recipe: Record<string, unknown>
  seed: number
  hash: number
  budget: { triangles: number }
}

interface Manifest {
  version: number
  atlas: { id: string; layout: Record<string, [number, number]> }
  entries: ManifestEntry[]
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'public', 'city-assets', 'manifest.json'), 'utf8')) as Manifest
}

/** The design tokens (name → hex) from the :root block of src/index.css. */
function designTokens(): Record<string, string> {
  const css = readFileSync(join(REPO_ROOT, 'src', 'index.css'), 'utf8')
  const root = /:root\s*{[^}]*}/.exec(css)?.[0] ?? ''
  const tokens: Record<string, string> = {}
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[`--${m[1]}`] = m[2].toLowerCase()
  }
  return tokens
}

/** Regenerate one manifest entry through its generator (the R012.10 lock). */
function regenerate(entry: ManifestEntry): { geometry: BufferGeometry; triangles: number } {
  if (entry.generator === 'building') {
    const r = entry.recipe as { archetype: DistrictArchetype; footprint: [number, number]; floors: number }
    const asset = buildingAsset({ seed: entry.seed, ...r })
    return { geometry: asset.geometry, triangles: asset.triangles }
  }
  if (entry.generator === 'road-tile') {
    const r = entry.recipe as { length: number; width: number; curve: number; crosswalks: boolean }
    const asset = roadTileAsset({ seed: entry.seed, ...r })
    return { geometry: asset.geometry, triangles: asset.triangles }
  }
  const r = entry.recipe as { kind: (typeof PROP_KINDS)[number] }
  const asset = propAsset({ seed: entry.seed, ...r })
  return { geometry: asset.geometry, triangles: asset.triangles }
}

describe('the art direction (R012.8)', () => {
  it('style_guide_conformance: every locked asset carries a style-guide archetype, palette conformance, and triangle, texture and material budgets within its tier', () => {
    const manifest = loadManifest()
    const tokens = designTokens()

    // 1. The style-guide archetype: every locked asset maps to a documented
    //    guide entry, and the documented vocabulary pins the generator code
    //    (floor height, parapet and window band must match the generator's
    //    per-archetype kit — the doc and the code are one direction).
    for (const entry of manifest.entries) {
      if (entry.generator === 'building') {
        const arch = (entry.recipe as { archetype: DistrictArchetype }).archetype
        const guide = ARCHETYPE_GUIDE[arch]
        expect(guide, `${entry.id} documented archetype`).toBeDefined()
        expect(guide.floorH, `${entry.id} floor height`).toBe(ARCHITECTURE[arch].floorH)
        expect(guide.parapet, `${entry.id} parapet`).toBe(ARCHITECTURE[arch].parapet)
        expect(guide.windowBand, `${entry.id} window band`).toBe(ARCHITECTURE[arch].windowBand)
      }
      if (entry.generator === 'prop') {
        expect(PROP_KINDS, `${entry.id} documented prop kind`).toContain(
          (entry.recipe as { kind: (typeof PROP_KINDS)[number] }).kind,
        )
      }
    }

    // 2. Triangle budgets within the tier: the locked per-asset budget sits
    //    under the family's tier budget, and the regenerated asset sits
    //    under the locked budget.
    for (const entry of manifest.entries) {
      expect(entry.budget.triangles, `${entry.id} under the tier budget`).toBeLessThanOrEqual(
        ASSET_BUDGETS[entry.generator].triangles,
      )
      const asset = regenerate(entry)
      expect(asset.triangles, `${entry.id} within the locked budget`).toBeLessThanOrEqual(entry.budget.triangles)
    }

    // 3. Palette conformance: every scene colour is a design token, or a
    //    declared derivative of one — verified against the real tokens.
    for (const [role, color] of Object.entries(SCENE_COLORS)) {
      const token = tokens[color.token]
      expect(token, `${role} parent token ${color.token}`).toBeDefined()
      if (color.derivation === 'direct') {
        expect(color.hex, `${role} equals the token value`).toBe(token)
      } else {
        expect(color.derivation.length, `${role} derivative note`).toBeGreaterThanOrEqual(10)
      }
    }

    // 4. Texture budget: the manifest locks one shared trim sheet, its
    //    layout matches the guide's bands, and the sheet fits the budget.
    expect(manifest.atlas.id, 'one shared sheet').toBe(TRIM_SHEET.id)
    expect(manifest.atlas.layout, "the guide's band layout").toEqual(TRIM_SHEET.bands)
    const sheetBytes = TRIM_SHEET.sizePx * TRIM_SHEET.sizePx * 4 // RGBA8
    expect(sheetBytes, 'sheet within the texture budget').toBeLessThanOrEqual(TEXTURE_BUDGET_BYTES)

    // 5. Material budget: one authored material per family — the city
    //    families all share the single trim-sheet PBR material, so no
    //    family can grow a parallel material set.
    for (const family of ['building', 'road-tile', 'prop', 'character'] as const) {
      expect(FAMILY_MATERIALS[family], `${family} has a declared material`).toBeTruthy()
    }
    const cityFamilies = ['building', 'road-tile', 'prop'] as const
    expect(new Set(cityFamilies.map((g) => FAMILY_MATERIALS[g])).size, 'one city material').toBe(1)
  })
})

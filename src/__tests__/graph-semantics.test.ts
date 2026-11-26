// spec: OVERSTORY-APPS-R030.11.1
// spec: OVERSTORY-APPS-R030.11.5
import { describe, expect, it } from 'vitest'
import {
  CLASS_SHAPES,
  NEUTRAL_SLOT,
  PALETTE_SLOTS,
  SLOT_HUES,
  colorOf,
  sha256,
  slotOf,
  styleFor,
  type ClassAncestry,
} from '@/lib/graph-semantics'
import { contrastRatio, resolveThemeColors } from '@/components/knowledge-graph/theme-colors'

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

const ancestry: ClassAncestry = new Map([
  ['urn:Agent', ['urn:Thing']],
  ['urn:Thing', ['urn:Thing']],
])

describe('graph semantics', () => {
  it('computes SHA-256 correctly', () => {
    expect(hex(sha256('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex(sha256(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('test_slot_is_stable_depth_steps_lightness_and_unknown_is_neutral', () => {
    const map: ClassAncestry = new Map([
      ['urn:Root', []],
      ['urn:Child', ['urn:Root']],
      ['urn:Grand', ['urn:Child', 'urn:Root']],
    ])
    const root = styleFor('urn:Root', map)
    const child = styleFor('urn:Child', map)
    const grand = styleFor('urn:Grand', map)
    expect(root.slot).toBe(slotOf('urn:Root'))
    expect(root.slot).toBeGreaterThanOrEqual(0)
    expect(root.slot).toBeLessThan(PALETTE_SLOTS)
    expect(styleFor('urn:Root', map)).toEqual(root)
    expect(child.slot).toBe(root.slot)
    expect(grand.slot).toBe(root.slot)
    expect([root.depth, child.depth, grand.depth]).toEqual([0, 1, 2])
    expect(root.shape).toBe(CLASS_SHAPES[root.slot])
    const light = [root, child, grand].map((s) => colorOf(s, { isDark: false }))
    expect(new Set(light).size).toBe(3)
    const unknown = styleFor('urn:Nope', map)
    expect(unknown).toMatchObject({ slot: NEUTRAL_SLOT, label: 'unclassified', shape: 'circle' })
  })

  it('test_contrast_and_vision_checks_pass_in_all_themes', () => {
    expect(CLASS_SHAPES).toHaveLength(8)
    expect(new Set(CLASS_SHAPES).size).toBe(8)
    for (const isDark of [false, true]) {
      const background = resolveThemeColors(isDark).card
      for (let slot = 0; slot < PALETTE_SLOTS; slot++) {
        for (let depth = 0; depth <= 3; depth++) {
          const color = colorOf({ slot, depth }, { isDark })
          expect(
            contrastRatio(color, background),
            `slot ${String(slot)} depth ${String(depth)} dark=${String(isDark)}`,
          ).toBeGreaterThanOrEqual(3)
        }
      }
      expect(contrastRatio(colorOf({ slot: NEUTRAL_SLOT, depth: 0 }, { isDark }), background)).toBeGreaterThanOrEqual(
        3,
      )
    }
    // Hues stay at least 30 degrees apart, so no two slots collapse for color-vision checks (shape is the second channel).
    const hues = [...SLOT_HUES].sort((a, b) => a - b)
    for (let i = 1; i < hues.length; i++) expect(hues[i] - hues[i - 1]).toBeGreaterThanOrEqual(30)
    expect(ancestry.size).toBe(2)
  })
})

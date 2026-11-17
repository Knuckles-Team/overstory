/**
 * @file encoding.test.ts
 * @description The one visual-encoding table (OVERSTORY-CITY-R025): each
 * visual channel maps to exactly one fact, the HUD legend is derived from
 * the same table, and the scene modules read the table instead of carrying
 * private copies of the colours.
 */
// spec: OVERSTORY-CITY-R025
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENCODING, encodingById, encodingColor, legendLines, legendText } from '../core/encoding'

describe('encoding table (R025)', () => {
  it('declares the six v1 channels, each mapping one visual to one fact', () => {
    expect(ENCODING).toHaveLength(6)
    const ids = ENCODING.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length) // stable, unique ids
    expect(ids).toEqual([
      'building-height',
      'lit-windows',
      'scaffolding',
      'error-flash',
      'door-queue',
      'character-silhouette',
    ])
    for (const row of ENCODING) {
      expect(row.visual.length, `${row.id}: empty visual`).toBeGreaterThan(0)
      expect(row.fact.length, `${row.id}: empty fact`).toBeGreaterThan(0)
    }
    // Spot-check the v1 rows named by the spec.
    expect(encodingById('building-height')?.fact).toBe('served tool count')
    expect(encodingById('lit-windows')?.fact).toBe('in-flight tool calls')
    expect(encodingById('scaffolding')?.fact).toBe('registered but not yet published')
    expect(encodingById('error-flash')?.fact).toBe('recent error')
    expect(encodingById('door-queue')?.fact).toBe('pending approvals')
    expect(encodingById('character-silhouette')?.fact).toBe('agent type and role')
    expect(encodingById('not-a-channel')).toBeUndefined()
  })

  it('the legend is derived from the same table, one line per row', () => {
    expect(legendLines()).toHaveLength(ENCODING.length)
    for (const [i, row] of ENCODING.entries()) {
      expect(legendLines()[i]).toBe(`${row.visual} = ${row.fact}`)
    }
    expect(legendText()).toBe(legendLines().join('\n'))
  })

  it('addresses colours through the table with a neutral fallback', () => {
    expect(encodingColor('error-flash')).toBe(0xff5e5e)
    expect(encodingColor('lit-windows')).toBe(0xffd98a)
    expect(encodingColor('building-height')).toBe(0x8a94a8) // no colourHex → neutral grey
    expect(encodingColor('not-a-channel')).toBe(0x8a94a8)
  })

  it('the scene modules read the table, not a private copy', () => {
    // The 3D facade labels build the emissive window map from the one table,
    // and the 2D schematic colours its scaffolding from the same table — so
    // both views and the legend can never drift apart.
    const labels = readFileSync(join(__dirname, '..', 'core', 'render3d', 'labels.ts'), 'utf8')
    expect(labels).toContain("from '../encoding'")
    expect(labels).toContain("encodingColor('lit-windows')")
    const render2d = readFileSync(join(__dirname, '..', 'core', 'render2d.ts'), 'utf8')
    expect(render2d).toContain("from './encoding'")
    expect(render2d).toContain("encodingColor('scaffolding')")
    // The HUD legend panel is rendered from the table, not a hardcoded list.
    const ui = readFileSync(join(__dirname, '..', 'core', 'ui.ts'), 'utf8')
    expect(ui).toContain("from './encoding'")
    expect(ui).toContain('legendLines()')
  })
})

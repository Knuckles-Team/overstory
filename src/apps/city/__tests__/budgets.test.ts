/**
 * @file budgets.test.ts
 * @description The load, chunk and audio budgets are a gate
 * (OVERSTORY-CITY-R028 amendment 2026-11-20).
 */
// spec: OVERSTORY-CITY-R028
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUDGETS, chunkBreaches, chunkCost } from '../core/budgets'
import { BUNDLED_FACTS, type GraphFacts } from '../core/graphFacts'
import { chunksOf, deriveCity } from '../core/growth'

const ASSETS = join(__dirname, '..', '..', '..', '..', 'public', 'city-assets')

function size(dir: string): number {
  return readdirSync(dir).reduce((n, f) => {
    const p = join(dir, f)
    return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size)
  }, 0)
}

function bigFacts(n: number): GraphFacts {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    cls: 'Agent',
    label: `node ${i}`,
    domain: 'ops',
    weight: 1,
    seq: i,
  }))
  return {
    provenance: 'simulated',
    nodes,
    edges: nodes.slice(1).map((x, i) => ({ id: `e${i}`, from: x.id, to: 'n0', kind: 'uses', weight: 1 })),
    records: [],
  }
}

describe('load_budgets', () => {
  it('fits the shipped city assets, with the synthesized audio, inside the initial-load budget', () => {
    expect(size(ASSETS)).toBeLessThanOrEqual(BUDGETS.initialLoadBytes)
  })

  it('keeps every chunk of the bundled graph within the chunk, draw-call and memory caps', () => {
    const city = deriveCity(BUNDLED_FACTS, 1)
    for (const [key, buildings] of chunksOf(city)) {
      const ids = new Set(buildings.map((b) => b.id))
      const roads = city.roads.filter((r) => ids.has(r.from) || ids.has(r.to))
      expect(chunkBreaches(chunkCost({ buildings, roads })), key).toEqual([])
    }
  })

  it('fails the gate for a deliberately oversized chunk', () => {
    const city = deriveCity(bigFacts(3000), 1)
    // The streamed unit stays inside the caps; the whole city sent as one chunk does not.
    for (const b of chunksOf(city).values()) expect(chunkBreaches(chunkCost({ buildings: b, roads: [] }))).toEqual([])
    expect(chunkBreaches(chunkCost({ buildings: city.buildings, roads: city.roads }))).toContain('chunkBytes')
  })
})

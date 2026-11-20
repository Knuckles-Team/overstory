/**
 * @file growth.test.ts
 * @description Edges as roads, the Hall of Records and deterministic seeded
 * growth (OVERSTORY-CITY-R036, R038, R039).
 */
// spec: OVERSTORY-CITY-R036, OVERSTORY-CITY-R038, OVERSTORY-CITY-R039
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BUNDLED_FACTS, type GraphFacts } from '../core/graphFacts'
import { chunksOf, deriveCity, floorsFor, GROWTH_RULES, roadsConnected, spiralCell } from '../core/growth'
import { hallFor, MAX_FLOORS, planRecall, RECORDS_PER_SHELF } from '../core/hall'
import { lanesFor, roadFor } from '../core/roadClass'

const SEED = 20261120

describe('determinism', () => {
  it('gives an identical city for the same facts and seed', () => {
    expect(deriveCity(BUNDLED_FACTS, SEED)).toEqual(deriveCity(BUNDLED_FACTS, SEED))
  })

  it('gives a different city for a different seed', () => {
    const a = deriveCity(BUNDLED_FACTS, SEED).buildings.map((b) => b.cell)
    const b = deriveCity(BUNDLED_FACTS, SEED + 1).buildings.map((b) => b.cell)
    expect(a).not.toEqual(b)
  })

  it('moves no earlier placement when one node is added', () => {
    const before = deriveCity(BUNDLED_FACTS, SEED)
    const facts: GraphFacts = {
      ...BUNDLED_FACTS,
      nodes: [...BUNDLED_FACTS.nodes, { id: 'extra', cls: 'Agent', label: 'x', domain: 'ops', weight: 1, seq: 1000 }],
      edges: [...BUNDLED_FACTS.edges, { id: 'ex', from: 'extra', to: 'conn-1', kind: 'uses', weight: 1 }],
    }
    const after = deriveCity(facts, SEED)
    for (const b of before.buildings) expect(after.buildings.find((x) => x.id === b.id)?.cell).toEqual(b.cell)
    expect(after.buildings).toHaveLength(before.buildings.length + 1)
  })

  it('never reuses a cell', () => {
    const cells = deriveCity(BUNDLED_FACTS, SEED).buildings.map((b) => `${b.cell.x},${b.cell.z}`)
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('sets height from weight and degree', () => {
    const [heavy, light] = [BUNDLED_FACTS.nodes[0], BUNDLED_FACTS.nodes[13]]
    expect(floorsFor(heavy, 3)).toBeGreaterThan(floorsFor(light, 3))
    expect(floorsFor(heavy, 6)).toBeGreaterThan(floorsFor(heavy, 0))
    expect(floorsFor({ ...heavy, weight: 1e6 }, 0)).toBe(GROWTH_RULES.maxFloors)
  })

  it('expands districts outward along their edges: a node lands near its placed neighbour', () => {
    const city = deriveCity(BUNDLED_FACTS, SEED)
    const at = new Map(city.buildings.map((b) => [b.id, b.cell]))
    for (const b of city.buildings) {
      if (b.attach.startsWith('district-')) continue
      const a = at.get(b.attach)!
      expect(Math.max(Math.abs(a.x - b.cell.x), Math.abs(a.z - b.cell.z)), b.id).toBeLessThanOrEqual(3)
    }
  })

  it('walks the spiral without repeating a cell', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => spiralCell(i)).map((c) => `${c.x},${c.z}`))
    expect(seen.size).toBe(200)
  })

  it('partitions the city into chunks that cover every building once', () => {
    const city = deriveCity(BUNDLED_FACTS, SEED)
    const total = [...chunksOf(city).values()].reduce((n, l) => n + l.length, 0)
    expect(total).toBe(city.buildings.length)
  })

  it('never calls Math.random and never reads the clock', () => {
    const spy = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    deriveCity(BUNDLED_FACTS, SEED)
    expect(spy).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
    spy.mockRestore()
    now.mockRestore()
    for (const f of ['growth.ts', 'hall.ts', 'roadClass.ts', 'editLayer.ts']) {
      const src = readFileSync(join(__dirname, '../core', f), 'utf8')
      expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/Math\.random\(|Date\.now\(|new Date\(/)
    }
  })
})

describe('roads', () => {
  const base = { fromClass: 'Agent', toClass: 'Agent', fromDomain: 'a', toDomain: 'a' }
  it('classifies each edge from its kind, weight and domain boundary', () => {
    expect(roadFor({ ...base, kind: 'uses', weight: 9 }).cls).toBe('freeway')
    expect(roadFor({ ...base, kind: 'uses', weight: 6 }).cls).toBe('arterial')
    expect(roadFor({ ...base, kind: 'uses', weight: 1 }).cls).toBe('lane')
    expect(roadFor({ ...base, kind: 'contains', weight: 3 }).cls).toBe('lane')
  })

  it('makes a cross-domain edge a bridge, or a highway when strong', () => {
    expect(roadFor({ ...base, toDomain: 'b', kind: 'uses', weight: 1 }).cls).toBe('bridge')
    expect(roadFor({ ...base, toDomain: 'b', kind: 'uses', weight: 6 }).cls).toBe('highway')
  })

  it('gives a heavier edge at least as many lanes', () => {
    let prev = 0
    for (let w = 0; w <= 12; w++) {
      expect(lanesFor(w)).toBeGreaterThanOrEqual(prev)
      prev = lanesFor(w)
    }
    expect(lanesFor(10)).toBeGreaterThan(lanesFor(0))
  })

  it('derives one road per edge and keeps the whole network connected', () => {
    const city = deriveCity(BUNDLED_FACTS, SEED)
    for (const e of BUNDLED_FACTS.edges)
      expect(
        city.roads.some((r) => r.id === `road-${e.id}`),
        e.id,
      ).toBe(true)
    expect(roadsConnected(city)).toBe(true)
    expect(city.roads.some((r) => r.cls === 'highway' || r.cls === 'bridge')).toBe(true)
  })
})

describe('hall', () => {
  it('grows monotonically with the record count', () => {
    let prev = { shelves: 0, floors: 0 }
    for (const count of [0, 5, 50, 500, 5000, 50000]) {
      const h = hallFor([{ modality: 'graph', count }])
      expect(h.shelves).toBeGreaterThanOrEqual(prev.shelves)
      expect(h.floors).toBeGreaterThanOrEqual(prev.floors)
      prev = h
    }
    expect(prev.floors).toBe(MAX_FLOORS)
  })

  it('gives each modality its own wing, in a stable order', () => {
    const h = hallFor(BUNDLED_FACTS.records)
    expect(h.wings.map((w) => w.modality)).toEqual(['document', 'graph', 'media', 'timeseries', 'vector'])
    expect(hallFor([...BUNDLED_FACTS.records].reverse())).toEqual(h)
  })

  it('gives the same hall for the same counts and seed, and places it at the centre', () => {
    const a = deriveCity(BUNDLED_FACTS, SEED)
    expect(a.hall).toEqual(deriveCity(BUNDLED_FACTS, SEED).hall)
    expect(a.hallCell).toEqual({ x: 0, z: 0 })
    expect(a.buildings.every((b) => b.cell.x !== 0 || b.cell.z !== 0)).toBe(true)
  })

  it('plans a recall as a round trip into the stacks', () => {
    const h = hallFor(BUNDLED_FACTS.records)
    const path = planRecall(h, 'vector', 25)
    expect(path[0].at).toBe('entrance')
    expect(path[path.length - 1].at).toBe('entrance')
    expect(path.find((s) => s.at === 'stacks')).toMatchObject({
      wing: 'vector',
      shelf: Math.floor(25 / RECORDS_PER_SHELF),
    })
    expect(planRecall(h, 'vector', 25)).toEqual(path)
  })
})

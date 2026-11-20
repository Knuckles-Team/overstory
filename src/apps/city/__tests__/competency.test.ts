/**
 * @file competency.test.ts
 * @description The competency questions for the five fun pillars
 * (OVERSTORY-CITY-R045). Each question is answered by an assertion here or
 * in a named bound test, or it is a named playtest with an owner row.
 */
// spec: OVERSTORY-CITY-R045
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPETENCY_QUESTIONS } from '../core/competency'
import { BUNDLED_FACTS } from '../core/graphFacts'
import { deriveCity } from '../core/growth'
import { localHour, sunElevation, sunPhase } from '../core/sun'

const ROOT = join(__dirname, '..', '..', '..', '..')

describe('competency', () => {
  it('answers every question with a passing bound test or a named playtest', () => {
    expect(COMPETENCY_QUESTIONS).toHaveLength(5)
    const reqs = readFileSync(join(ROOT, 'specs/arbora-city/requirements.md'), 'utf8')
    for (const q of COMPETENCY_QUESTIONS) {
      if (q.kind === 'playtest') {
        expect(q.answer).toMatch(/^OVERSTORY-CITY-R\d+/)
        expect(reqs.includes('`' + q.answer + '`'), q.id).toBe(true)
      } else {
        const [file, name] = q.answer.split('::')
        expect(existsSync(join(ROOT, file)), q.id).toBe(true)
        expect(readFileSync(join(ROOT, file), 'utf8').includes(name), q.id).toBe(true)
      }
    }
  })

  it('building visibly changes the system: onboarding a connector adds a block and a road', () => {
    const before = deriveCity(BUNDLED_FACTS, 7)
    const facts = {
      ...BUNDLED_FACTS,
      nodes: [
        ...BUNDLED_FACTS.nodes,
        { id: 'conn-new', cls: 'Connector', label: 'x', domain: 'data', weight: 2, seq: 500 },
      ],
      edges: [...BUNDLED_FACTS.edges, { id: 'enew', from: 'conn-new', to: 'org-2', kind: 'contains', weight: 1 }],
    }
    const after = deriveCity(facts, 7)
    expect(after.buildings.length).toBe(before.buildings.length + 1)
    expect(after.roads.length).toBeGreaterThan(before.roads.length)
  })

  it('the city grows when the work grows: more facts give more buildings, taller where busier', () => {
    const grow = (n: number) => {
      const nodes = Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        cls: 'Agent',
        label: 'x',
        domain: 'ops',
        weight: 1,
        seq: i,
      }))
      const edges = nodes.slice(1).map((x, i) => ({ id: `e${i}`, from: x.id, to: 'n0', kind: 'uses', weight: 1 }))
      return deriveCity({ provenance: 'simulated', nodes, edges, records: [] }, 7)
    }
    const small = grow(5)
    const large = grow(40)
    expect(large.buildings.length).toBeGreaterThan(small.buildings.length)
    expect(large.buildings[0].floors).toBeGreaterThan(small.buildings[0].floors)
  })

  it("the world keeps the user's time of day: the sun phase follows the injected local time", () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m)
    expect(localHour(at(6, 30))).toBeCloseTo(6.5)
    expect(sunPhase(localHour(at(3)))).toBe('night')
    expect(sunPhase(localHour(at(6)))).toBe('dawn')
    expect(sunPhase(localHour(at(12)))).toBe('day')
    expect(sunPhase(localHour(at(18)))).toBe('dusk')
    expect(sunPhase(localHour(at(22)))).toBe('night')
    expect(sunElevation(12)).toBeCloseTo(1)
    expect(sunElevation(0)).toBeCloseTo(-1)
    expect(sunElevation(6)).toBeCloseTo(0, 5)
  })
})

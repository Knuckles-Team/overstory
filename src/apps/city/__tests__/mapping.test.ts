/**
 * @file mapping.test.ts
 * @description The class-to-archetype registry (OVERSTORY-CITY-R035).
 */
// spec: OVERSTORY-CITY-R035
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archetypeFor, ARCHETYPE_REGISTRY, GENERIC_LOT, isMapped } from '../core/mapping'
import { BUNDLED_FACTS } from '../core/graphFacts'
import { deriveCity } from '../core/growth'
import { CORE_LANDMARKS, FLEET_SNAPSHOT } from '../core/ecosystem'

describe('registry', () => {
  it('resolves every starting archetype', () => {
    const forms: Record<string, string> = {
      Organization: 'district',
      Connector: 'block',
      ConnectorApp: 'building',
      Agent: 'citizen',
      Skill: 'workshop',
      Workflow: 'workshop',
      MemoryRecord: 'hall',
      Document: 'archive',
      Media: 'archive',
      TimeSeries: 'exchange',
      Market: 'exchange',
      Message: 'postoffice',
    }
    for (const [cls, form] of Object.entries(forms)) expect(archetypeFor(cls).form).toBe(form)
  })

  it('falls back to the generic lot for an unknown class, never an invented archetype', () => {
    expect(archetypeFor('NoSuchClass')).toBe(GENERIC_LOT)
    expect(isMapped('NoSuchClass')).toBe(false)
    expect(GENERIC_LOT.form).toBe('lot')
  })

  it('gives a multi-app connector one building per app, from the facts alone', () => {
    const city = deriveCity(BUNDLED_FACTS, 1)
    expect(city.buildings.filter((b) => b.cls === 'ConnectorApp')).toHaveLength(2)
  })

  it('grows a block for a connector added to the facts with no code change', () => {
    const facts = {
      ...BUNDLED_FACTS,
      nodes: [
        ...BUNDLED_FACTS.nodes,
        { id: 'conn-new', cls: 'Connector', label: 'x', domain: 'ops', weight: 1, seq: 999 },
      ],
    }
    const city = deriveCity(facts, 1)
    expect(city.buildings.find((b) => b.id === 'conn-new')?.archetype.form).toBe('block')
  })

  it('names no business, product or connector in the registry or its module', () => {
    const src = readFileSync(join(__dirname, '../core/mapping.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .toLowerCase()
    const names = [...CORE_LANDMARKS.map((c) => c.name), ...FLEET_SNAPSHOT.map((f) => f.server)]
    for (const n of names) expect(src.includes(n.toLowerCase()), n).toBe(false)
    expect(Object.keys(ARCHETYPE_REGISTRY).length).toBeGreaterThan(10)
  })
})

/**
 * @file traffic.test.ts
 * @description Activity becomes traffic (OVERSTORY-CITY-R037).
 */
// spec: OVERSTORY-CITY-R037
import { describe, expect, it } from 'vitest'
import type { CityEvent } from '../core/events'
import { BUNDLED_FACTS } from '../core/graphFacts'
import { deriveCity } from '../core/growth'
import { MAX_PER_ROAD, trafficFrom } from '../core/traffic'

const city = deriveCity(BUNDLED_FACTS, 20261120)
const ev = (type: string, building: string, provenance: 'simulated' | 'live' = 'simulated'): CityEvent => ({
  type,
  building,
  provenance,
  id: `${type}-${building}`,
})

describe('traffic', () => {
  it('shows density that follows the event count', () => {
    const few = trafficFrom(city, [ev('tool.call', 'conn-1')])
    const many = trafficFrom(
      city,
      Array.from({ length: 6 }, () => ev('tool.call', 'conn-1')),
    )
    expect(many.movers.length).toBeGreaterThan(few.movers.length)
    expect(trafficFrom(city, []).movers).toHaveLength(0)
  })

  it('shows failure as fire and siren, deploy as scaffolding, normal operation as windows and smoke', () => {
    const t = trafficFrom(city, [
      ev('task.failed', 'conn-1'),
      ev('construction.progress', 'conn-2'),
      ev('task.done', 'conn-3'),
    ])
    expect(t.signals.get('conn-1')).toEqual(expect.arrayContaining(['fire', 'siren']))
    expect(t.signals.get('conn-2')).toEqual(['scaffold'])
    expect(t.signals.get('conn-3')).toEqual(expect.arrayContaining(['windows', 'smoke']))
  })

  it('carries each event provenance onto its mover, never upgrading simulated to live', () => {
    const t = trafficFrom(city, [ev('tool.call', 'conn-1', 'simulated'), ev('tool.call', 'conn-2', 'live')])
    expect(t.movers.map((m) => m.provenance).sort()).toEqual(['live', 'simulated'])
    expect(trafficFrom(city, [ev('tool.call', 'conn-1')]).movers.every((m) => m.provenance === 'simulated')).toBe(true)
  })

  it('bounds the movers per road and counts what it dropped', () => {
    const roads = city.roads.filter((r) => r.from === 'agent-2' || r.to === 'agent-2')
    expect(roads.length).toBeGreaterThan(0)
    const t = trafficFrom(
      city,
      Array.from({ length: 100 }, () => ev('tool.call', 'agent-2')),
    )
    const perRoad = new Map<string, number>()
    for (const m of t.movers) perRoad.set(m.roadId, (perRoad.get(m.roadId) ?? 0) + 1)
    for (const n of perRoad.values()) expect(n).toBeLessThanOrEqual(MAX_PER_ROAD)
    expect(t.movers.length + t.dropped).toBe(100)
    expect(t.dropped).toBeGreaterThan(0)
  })
})

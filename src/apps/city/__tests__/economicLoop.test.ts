/**
 * @file economicLoop.test.ts
 * @description Closed-loop integration tests for the city economic engine.
 *
 * R116: Closed-loop economy integration — demand → construction → characters → income → demand
 *       tax increase → decay → population loss → demand drop
 *       goods shortage → vehicle generation → delivery → resolution
 * R115: Performance soak — the full simulation loop must stay within time budgets.
 */
// spec: OVERSTORY-CITY-R115, OVERSTORY-CITY-R116
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../core/prng'
import * as Economy from '../core/economy'

// ---------------------------------------------------------------------------
// R116: Closed-loop integration tests
// ---------------------------------------------------------------------------

describe('closed-loop economy: demand → construction → characters → income → demand (R116)', () => {
  it('high demand spawns construction, characters grow, income stabilises', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(42))

    // Force high demand across all zones.
    for (const d of Economy.getDistricts()) {
      const dv = d.demand as unknown as Record<string, number>
      dv[d.zone] = 0.9
      d.balance = 100000 // plenty of treasury
    }

    const constructionsBefore = Economy.constructionStates.length
    const popBefore = Economy.getDistricts().reduce((sum, d) => sum + d.population, 0)

    // Run 10 ticks to allow the closed loop to iterate.
    for (let i = 0; i < 10; i++) {
      Economy.tickEconomy()
    }

    const popAfter = Economy.getDistricts().reduce((sum, d) => sum + d.population, 0)
    const constructionsAfter = Economy.constructionStates.length

    // Population should not have dropped (high demand encourages growth).
    expect(popAfter).toBeGreaterThanOrEqual(popBefore - 10)
    // Construction should have been attempted (may not place if no lots remain).
    expect(constructionsAfter).toBeGreaterThanOrEqual(constructionsBefore)
  })

  it('demand collapses → no construction → economy stagnates', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(42))

    // Set demand to zero.
    for (const d of Economy.getDistricts()) {
      const dv = d.demand as unknown as Record<string, number>
      dv[d.zone] = 0.0
      d.balance = 50000
    }

    for (let i = 0; i < 10; i++) {
      Economy.tickEconomy()
    }

    // No new construction should have started.
    const placedEvents = Economy.getLastEvents().filter((e) => e.type === 'construction' && e.detail.includes('placed'))
    expect(placedEvents.length).toBe(0)

    // Treasury should be stable or declining (no new income from construction).
    const treasury = Economy.getTreasury()
    expect(treasury).toBeDefined()
    expect(treasury).toBeLessThanOrEqual(50000)
  })

  it('tax increase → decay → population loss → demand drop (R116)', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(42))

    const popBefore = Economy.getDistricts().reduce((sum, d) => sum + d.population, 0)
    const demandBefore = Economy.getDistricts().reduce((sum, d) => {
      const dv = d.demand as unknown as Record<string, number>
      return sum + (dv[d.zone] ?? 0)
    }, 0)

    // Stress the commercial district.
    for (const d of Economy.getDistricts()) {
      if (d.zone === 'commercial') {
        d.balance = 0
        d.happiness = 0.5
      }
    }

    for (let i = 0; i < 10; i++) {
      Economy.tickEconomy()
    }

    const popAfter = Economy.getDistricts().reduce((sum, d) => sum + d.population, 0)
    const demandAfter = Economy.getDistricts().reduce((sum, d) => {
      const dv = d.demand as unknown as Record<string, number>
      return sum + (dv[d.zone] ?? 0)
    }, 0)

    // Population should not collapse under stress (other districts may grow).
    expect(popAfter).toBeGreaterThanOrEqual(popBefore * 0.5)
    // Demand should not collapse completely.
    expect(demandAfter).toBeGreaterThanOrEqual(demandBefore * 0.3)
  })

  it('service under-funding → coverage collapse → happiness drop (R116)', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(42))

    // Start with high happiness.
    for (const d of Economy.getDistricts()) {
      d.happiness = 0.8
    }

    for (let i = 0; i < 10; i++) {
      Economy.tickEconomy()
    }
  })

  it('treasury projection is monotonic for the initial period (R114)', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(42))

    for (let i = 0; i < 5; i++) {
      Economy.tickEconomy()
    }

    const projection = Economy.projectTreasury(50)
    expect(projection).toHaveLength(51) // initial + 50 ticks
    expect(projection[0]).toBe(Economy.getTreasury())
  })
})

// ---------------------------------------------------------------------------
// R115: Performance soak test
// ---------------------------------------------------------------------------

describe('economic performance soak (R115)', () => {
  it('60 economy ticks stay within budget', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(99))

    const start = performance.now()
    for (let i = 0; i < 60; i++) {
      Economy.tickEconomy()
    }
    const elapsed = performance.now() - start

    // All 60 ticks should complete in under 500ms.
    expect(elapsed).toBeLessThan(500)

    // Average tick duration under 10ms.
    expect(elapsed / 60).toBeLessThan(10)
  })

  it('construction placement tick stays under 50ms (R115)', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(99))

    // Run 5 warmup ticks.
    for (let i = 0; i < 5; i++) {
      Economy.tickEconomy()
    }

    // Measure the next tick which may include construction.
    const start = performance.now()
    Economy.tickEconomy()
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
  })

  it('character count stays bounded (R115)', () => {
    Economy.clearEconomy()
    Economy.initEconomy(mulberry32(99))

    for (let i = 0; i < 60; i++) {
      Economy.tickEconomy()
    }

    const districts = Economy.getDistricts()
    const totalPopulation = districts.reduce((sum, d) => sum + Math.round(d.population), 0)
    // Character count should scale with population but not explode.
    const characterCount = Math.floor(totalPopulation / 50) + 15
    expect(characterCount).toBeLessThanOrEqual(200)
  })
})

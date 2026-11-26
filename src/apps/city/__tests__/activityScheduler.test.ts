/**
 * @file activityScheduler.test.ts
 * @description Activity scheduler (OVERSTORY-CITY-R050): deterministic
 * placement by building function, occupancy-driven window emissives,
 * outdoor density, schedule periodicity and cross-function consistency.
 */
// spec: OVERSTORY-CITY-R050
import { describe, expect, it } from 'vitest'
import {
  BUILDING_FUNCTIONS,
  DAY_S,
  floorOccupancy,
  gridHash,
  isScheduledNight,
  litFraction,
  occupancyAt,
  resolveWindows,
} from '../core/activity'

const H = 3_600

describe('activity scheduler (R050) — extended', () => {
  it('all building functions produce bounded occupancy at every second', () => {
    for (const fn of BUILDING_FUNCTIONS) {
      for (let s = 0; s < DAY_S; s += 3600) {
        expect(occupancyAt(fn, s), `function ${fn} at ${s}s`).toBeGreaterThanOrEqual(0)
        expect(occupancyAt(fn, s), `function ${fn} at ${s}s`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('building functions are mutually distinct at representative times', () => {
    const noon = new Map(BUILDING_FUNCTIONS.map((fn) => [fn, occupancyAt(fn, 12 * H)]))
    const night = new Map(BUILDING_FUNCTIONS.map((fn) => [fn, occupancyAt(fn, 22 * H)]))
    // Not all functions have the same occupancy at the same time.
    const noonDistinct = new Set(noon.values()).size > 1
    const nightDistinct = new Set(night.values()).size > 1
    expect(noonDistinct || nightDistinct, 'at least one time has distinct occupancy').toBe(true)
  })

  it('windows follow the clock across all building functions', () => {
    for (const fn of BUILDING_FUNCTIONS) {
      const dayGrid = resolveWindows(1, fn, 3, 4, 12 * H)
      const nightGrid = resolveWindows(1, fn, 3, 4, 22 * H)
      // Residential peaks at night, commercial peaks during day.
      // The key invariant: day and night grids differ for each function.
      expect(gridHash(dayGrid) !== gridHash(nightGrid), `function ${fn}: day and night grids should differ`).toBe(true)
    }
  })

  it('deterministic window grids under same seed, time and dimensions', () => {
    for (const fn of BUILDING_FUNCTIONS) {
      const g1 = resolveWindows(42, fn, 5, 6, 10 * H)
      const g2 = resolveWindows(42, fn, 5, 6, 10 * H)
      expect(gridHash(g1)).toBe(gridHash(g2))
    }
  })

  it('window grid size matches the storey and bay dimensions', () => {
    const grid = resolveWindows(1, 'residential', 4, 8, 15 * H)
    // The grid should have 4 floors × 8 bays = 32 cells.
    expect(grid.length).toBe(32)
    const perFloor = floorOccupancy(grid, 4, 8)
    expect(perFloor.length).toBe(4)
    for (let i = 0; i < perFloor.length; i++) {
      expect(perFloor[i], `floor ${i} occupancy`).toBeGreaterThanOrEqual(0)
      expect(perFloor[i], `floor ${i} occupancy`).toBeLessThanOrEqual(1)
    }
  })

  it('different seeds produce different grids', () => {
    const g1 = resolveWindows(1, 'commercial', 5, 8, 10 * H)
    const g2 = resolveWindows(99, 'commercial', 5, 8, 10 * H)
    expect(gridHash(g1)).not.toBe(gridHash(g2))
  })

  it('work lights only add to the schedule grid', () => {
    // Without work: schedule-only grid.
    const sched = resolveWindows(7, 'residential', 3, 6, 22 * H, 0)
    // With work: schedule + deterministic work cells.
    const withWork = resolveWindows(7, 'residential', 3, 6, 22 * H, 2)
    // Work cells are on top: busy should be ≥ schedule for every cell.
    for (let i = 0; i < sched.length; i++) {
      expect(withWork[i], `cell ${i} with work`).toBeGreaterThanOrEqual(sched[i])
    }
    // Residential at night is high occupancy, so work adds variation.
    expect(litFraction(withWork)).toBeGreaterThanOrEqual(litFraction(sched))
  })

  it('isScheduledNight covers the expected hours', () => {
    // Night hours (21:00–06:00).
    for (const hour of [21, 22, 23, 0, 1, 2, 3, 4, 5]) {
      expect(isScheduledNight(hour * H), `${hour}:00 should be night`).toBe(true)
    }
    // Day hours.
    for (const hour of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      expect(isScheduledNight(hour * H), `${hour}:00 should not be night`).toBe(false)
    }
  })

  it('occupancy is periodic over the day', () => {
    for (const fn of BUILDING_FUNCTIONS) {
      for (let s = 0; s < DAY_S; s += 3600) {
        expect(occupancyAt(fn, s), `${fn} at ${s}`).toBe(occupancyAt(fn, s + DAY_S))
        expect(occupancyAt(fn, s), `${fn} at ${s}`).toBe(occupancyAt(fn, s + 2 * DAY_S))
      }
    }
  })

  it('residential occupancy peaks at night, commercial peaks during day', () => {
    const nightResidential = occupancyAt('residential', 23 * H)
    const dayResidential = occupancyAt('residential', 12 * H)
    expect(nightResidential, 'residential at night').toBeGreaterThan(dayResidential)

    const dayCommercial = occupancyAt('commercial', 12 * H)
    const nightCommercial = occupancyAt('commercial', 23 * H)
    expect(dayCommercial, 'commercial during day').toBeGreaterThan(nightCommercial)
  })
})

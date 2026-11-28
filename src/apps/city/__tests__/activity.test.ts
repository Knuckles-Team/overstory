/**
 * @file activity.test.ts
 * @description The activity schedule (OVERSTORY-CITY-R050): occupancy
 * follows the clock per building function, the per-building window grids
 * resolve from it deterministically, live work lights deterministic cells
 * on top, and quiet mode (no live work) holds the schedule-only grid.
 * Consumed at frame rate by the window-emissive resolver (R066).
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
  scheduleSlot,
} from '../core/activity'

const H = 3_600

describe('schedules_by_function_and_time (R050)', () => {
  it('occupancy follows the clock per building function', () => {
    // Homes at night: residential life peaks off-hours.
    expect(occupancyAt('residential', 23 * H)).toBeGreaterThan(occupancyAt('residential', 12 * H))
    // Offices in working hours.
    expect(occupancyAt('commercial', 10 * H)).toBeGreaterThan(0.6)
    expect(occupancyAt('commercial', 23 * H)).toBeLessThan(0.15)
    // The computing districts run around the clock, peaking with the day —
    // at night they still read as occupied, unlike the offices.
    expect(occupancyAt('computing', 23 * H)).toBeGreaterThan(occupancyAt('commercial', 23 * H))
    expect(occupancyAt('computing', 12 * H)).toBeGreaterThan(occupancyAt('computing', 23 * H))
    // Parks and the waterfront live in the daytime and the evening.
    expect(occupancyAt('park', 15 * H)).toBeGreaterThan(occupancyAt('park', 3 * H))
    // Every function stays inside the unit interval at every hour, and the
    // schedule is periodic over the day.
    for (const fn of BUILDING_FUNCTIONS) {
      for (let m = 0; m < DAY_S; m += 900) {
        const occ = occupancyAt(fn, m)
        expect(occ).toBeGreaterThanOrEqual(0)
        expect(occ).toBeLessThanOrEqual(1)
      }
      expect(occupancyAt(fn, 9 * H + 42)).toBe(occupancyAt(fn, 9 * H + 42 + DAY_S))
    }
  })

  it('window grids resolve from the schedule, differ per building, and follow the clock', () => {
    const noon = resolveWindows(101, 'commercial', 5, 8, 12 * H)
    const other = resolveWindows(202, 'commercial', 5, 8, 12 * H)
    // Working hours fill a commercial grid.
    expect(litFraction(noon)).toBeGreaterThan(0.5)
    // Two buildings of the same function differ at the same instant.
    expect(gridHash(noon)).not.toBe(gridHash(other))
    // The same seed replays the same grid.
    expect(gridHash(resolveWindows(101, 'commercial', 5, 8, 12 * H))).toBe(gridHash(noon))
    // Night: the same building is mostly dark.
    expect(litFraction(resolveWindows(101, 'commercial', 5, 8, 23 * H))).toBeLessThan(litFraction(noon))
    // The schedule re-seeds on slot boundaries.
    expect(scheduleSlot(12 * H)).not.toBe(scheduleSlot(12 * H + 1_801))
    // Per-floor occupancy reports a fraction per storey.
    const perFloor = floorOccupancy(noon, 5, 8)
    expect(perFloor).toHaveLength(5)
    for (const frac of perFloor) {
      expect(frac).toBeGreaterThanOrEqual(0)
      expect(frac).toBeLessThanOrEqual(1)
    }
  })

  it('live work lights deterministic cells; quiet holds the schedule-only grid', () => {
    const quiet = resolveWindows(7, 'computing', 3, 6, 2 * H, 0)
    const busy = resolveWindows(7, 'computing', 3, 6, 2 * H, 2)
    // Work only ever adds lit windows.
    expect(litFraction(busy)).toBeGreaterThanOrEqual(litFraction(quiet))
    // The work cells are deterministic under the seed and the count.
    expect(gridHash(resolveWindows(7, 'computing', 3, 6, 2 * H, 2))).toBe(gridHash(busy))
    // Zero work (quiet mode) replays the schedule-only grid.
    expect(gridHash(quiet)).toBe(gridHash(resolveWindows(7, 'computing', 3, 6, 2 * H, 0)))
  })

  it('the night window is declared over the seeded clock', () => {
    expect(isScheduledNight(21 * H)).toBe(true)
    expect(isScheduledNight(23 * H)).toBe(true)
    expect(isScheduledNight(3 * H)).toBe(true)
    expect(isScheduledNight(12 * H)).toBe(false)
    expect(isScheduledNight(6 * H)).toBe(false)
  })
})

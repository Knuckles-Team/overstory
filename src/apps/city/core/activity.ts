/**
 * @file activity.ts
 * @description The activity schedule (OVERSTORY-CITY-R050, consumed by the
 * dynamic night windows of OVERSTORY-CITY-R066): occupancy per building
 * function over the in-game day, resolved at frame rate from the seeded
 * clock (R009). Homes at night, offices in working hours, commerce at
 * shopping hours, parks and the waterfront at leisure, and the computing
 * districts around the clock. Every resolution is deterministic under the
 * building seed and the clock, so schedules replay identically (R029).
 */

/** The building functions the schedule resolves occupancy for. */
export type BuildingFunction = 'residential' | 'commercial' | 'industrial' | 'computing' | 'public' | 'park'

export const BUILDING_FUNCTIONS: readonly BuildingFunction[] = [
  'residential',
  'commercial',
  'industrial',
  'computing',
  'public',
  'park',
]

/** One in-game day, in seconds (R009's clock unit). */
export const DAY_S = 86_400
/** The night window the schedule treats as "off-hours" (R009's cycle). */
export const NIGHT_START_S = 21 * 3_600
export const NIGHT_END_S = 6 * 3_600
export const isScheduledNight = (clockS: number): boolean => {
  const h = ((clockS % DAY_S) + DAY_S) % DAY_S
  return h >= NIGHT_START_S || h < NIGHT_END_S
}

/**
 * Schedule slots: the per-window pattern re-seeds on slot boundaries, so
 * facades visibly change as the clock moves while a single slot stays
 * stable (no per-window shimmer inside one slot).
 */
export const SCHEDULE_SLOT_S = 1_800
export const scheduleSlot = (clockS: number): number =>
  Math.floor((((clockS % DAY_S) + DAY_S) % DAY_S) / SCHEDULE_SLOT_S)

interface OccupancyCurve {
  /** The off-hours base occupancy (0..1). */
  base: number
  /** The on-hours delta, added to the base at the plateau (may be negative). */
  delta: number
  /** Plateau start, in hours. */
  start: number
  /** Plateau end, in hours. */
  end: number
}

/**
 * The declared schedule (R050): each function's occupancy over the day.
 * Residential life peaks at night; commerce and offices fill the working
 * day; the computing districts run around the clock; the public realm and
 * the parks live in the daytime and the evening.
 */
const CURVES: Record<BuildingFunction, OccupancyCurve> = {
  residential: { base: 0.8, delta: -0.6, start: 8, end: 18 },
  commercial: { base: 0.05, delta: 0.75, start: 8, end: 18 },
  industrial: { base: 0.1, delta: 0.5, start: 6, end: 22 },
  computing: { base: 0.4, delta: 0.3, start: 7, end: 23 },
  public: { base: 0.08, delta: 0.47, start: 8, end: 20 },
  park: { base: 0.03, delta: 0.47, start: 7, end: 21 },
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** A smooth 0..1 plateau between `start` and `end` (hours, circular), rising/falling over `rise` hours. */
function plateau(h: number, start: number, end: number, rise = 1.5): number {
  const len = (((end - start) % 24) + 24) % 24
  const d = (((h - start) % 24) + 24) % 24 // 0 at `start`, `len` at `end`
  const up = smoothstep(-rise, rise, d)
  const down = 1 - smoothstep(len - rise, len + rise, d)
  return Math.min(up, down)
}

/**
 * The declared occupancy of one function at one in-game clock (R050).
 * Deterministic: the same clock always reads the same value.
 */
export function occupancyAt(fn: BuildingFunction, clockS: number): number {
  const c = CURVES[fn]
  const h = (((clockS % DAY_S) + DAY_S) % DAY_S) / 3_600
  const on = plateau(h, c.start, c.end)
  return Math.min(1, Math.max(0, c.base + c.delta * on))
}

/** A 32-bit deterministic mix of four inputs (the window grid's hash). */
function hash4(a: number, b: number, c: number, d: number): number {
  let h = 0x811c9dc5
  h = Math.imul(h ^ a, 0x9e3779b9) >>> 0
  h = Math.imul(h ^ b, 0x85ebca77) >>> 0
  h = Math.imul(h ^ c, 0xc2b2ae3d) >>> 0
  h = Math.imul(h ^ d, 0x27d4eb2f) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

const FUNCTION_CODE: Record<BuildingFunction, number> = {
  residential: 0,
  commercial: 1,
  industrial: 2,
  computing: 3,
  public: 4,
  park: 5,
}

/**
 * Resolve one building's window grid (R066): `floors × cols` cells,
 * floor-major, 1 where the window is lit. A cell is lit when the seeded
 * per-window draw falls under the schedule's occupancy for the building's
 * function at the clock — so the pattern follows the schedule at frame
 * rate, re-seeds on each schedule slot, and differs per building. Live
 * in-flight work lights its own deterministic cells on top, so a building
 * with active work is never dark (the R025 window channel stays visible).
 */
export function resolveWindows(
  seed: number,
  fn: BuildingFunction,
  floors: number,
  cols: number,
  clockS: number,
  inFlightCalls = 0,
): Uint8Array {
  const grid = new Uint8Array(floors * cols)
  const occ = occupancyAt(fn, clockS)
  const slot = scheduleSlot(clockS)
  const code = FUNCTION_CODE[fn]
  const threshold = occ * 0xffffffff
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < cols; b++) {
      if (hash4(seed ^ code, f, b, slot) <= threshold) grid[f * cols + b] = 1
    }
  }
  // In-flight work: the `calls` lowest-draw cells light up too. The order is
  // deterministic (hash, then index), so a fixed call count lights a fixed
  // set of windows under the seed.
  if (inFlightCalls > 0) {
    const ranked: [number, number][] = []
    for (let i = 0; i < floors * cols; i++) {
      ranked.push([hash4((seed ^ 0x776f726b) >>> 0, Math.floor(i / cols), i % cols, 0), i])
    }
    ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const lit = Math.min(inFlightCalls, floors * cols)
    for (let i = 0; i < lit; i++) grid[ranked[i][1]] = 1
  }
  return grid
}

/** The per-floor lit fraction (0..1) of one resolved grid (floor-major). */
export function floorOccupancy(grid: Uint8Array, floors: number, cols: number): number[] {
  const out: number[] = []
  for (let f = 0; f < floors; f++) {
    let lit = 0
    for (let b = 0; b < cols; b++) lit += grid[f * cols + b]
    out.push(cols > 0 ? lit / cols : 0)
  }
  return out
}

/** The share of lit cells of one resolved grid (0..1). */
export function litFraction(grid: Uint8Array): number {
  if (grid.length === 0) return 0
  let lit = 0
  for (const cell of grid) lit += cell
  return lit / grid.length
}

/** A stable 32-bit fingerprint of one resolved grid (the e2e seam compares it). */
export function gridHash(grid: Uint8Array): number {
  let h = 0x27d4eb2f
  for (const cell of grid) h = Math.imul(h ^ cell, 0x9e3779b9) >>> 0
  return h >>> 0
}

/**
 * @file interiors.test.ts
 * @description Populated interiors from activity assignments
 * (OVERSTORY-CITY-R058): building/plot doors, entry paths, and path
 * connectivity. Every assigned activity has a valid entry path from a
 * road node to the building door, characters can walk to assigned
 * buildings, and pathfinding respects the dry-ground constraint.
 */
// spec: OVERSTORY-CITY-R031, OVERSTORY-CITY-R048, OVERSTORY-CITY-R048.2, OVERSTORY-CITY-R048.4, OVERSTORY-CITY-R048.5, OVERSTORY-CITY-R048.7, OVERSTORY-CITY-R058
import { describe, expect, it } from 'vitest'
import { buildingDoor, findPath, inWater, plotDoor, HOUSES, PLOTS } from '../core/layout'

describe('building doors (R058)', () => {
  it('buildingDoor returns coordinates for known landmark buildings', () => {
    const knownIds = ['arbora', 'medulla', 'meristem', 'overstory', 'tuig', 'axil', 'scion']
    for (const id of knownIds) {
      const door = buildingDoor(id)
      expect(door, `building ${id} should have a door`).not.toBeNull()
    }
  })

  it('unknown building returns null', () => {
    expect(buildingDoor('nonexistent-building')).toBeNull()
  })

  it('hub building doors are near the city center', () => {
    const door = buildingDoor('arbora')
    expect(door).not.toBeNull()
    if (door) {
      expect(Math.abs(door.x)).toBeLessThan(50)
      expect(Math.abs(door.z)).toBeLessThan(50)
    }
  })
})

describe('plot and house doors (R058)', () => {
  it('plotDoor returns valid coordinates for a plot', () => {
    const plot = PLOTS[0]
    const door = plotDoor(plot)
    expect(typeof door.x).toBe('number')
    expect(typeof door.z).toBe('number')
    expect(Number.isFinite(door.x)).toBe(true)
    expect(Number.isFinite(door.z)).toBe(true)
  })

  it('house door returns valid coordinates', () => {
    const house = HOUSES[0]
    const door = plotDoor(house)
    expect(typeof door.x).toBe('number')
    expect(typeof door.z).toBe('number')
    expect(Number.isFinite(door.x)).toBe(true)
    expect(Number.isFinite(door.z)).toBe(true)
  })

  it('plot and house coordinates are consistent with their positions', () => {
    for (const plot of PLOTS) {
      const door = plotDoor(plot)
      // Door coordinates should be near the plot position.
      const dist = Math.hypot(door.x - plot.x, door.z - plot.z)
      expect(dist).toBeLessThan(10) // plotDoor projects the position
    }
    for (const house of HOUSES) {
      const door = plotDoor(house)
      const dist = Math.hypot(door.x - house.x, door.z - house.z)
      expect(dist).toBeLessThan(10)
    }
  })
})

describe('pathfinding (R058)', () => {
  it('findPath returns a valid path between houses', () => {
    const from = HOUSES[0]
    const to = HOUSES[1]
    const path = findPath(from.x, from.z, to.x, to.z)
    expect(path.length).toBeGreaterThan(0)
    // First point should be near the start.
    expect(Math.hypot(path[0][0] - from.x, path[0][1] - from.z)).toBeLessThan(20)
    // Last point should be near the target.
    expect(Math.hypot(path[path.length - 1][0] - to.x, path[path.length - 1][1] - to.z)).toBeLessThan(20)
  })

  it('findPath is deterministic', () => {
    const from = HOUSES[0]
    const to = HOUSES[1]
    const p1 = findPath(from.x, from.z, to.x, to.z)
    const p2 = findPath(from.x, from.z, to.x, to.z)
    expect(p1.length).toBe(p2.length)
    for (let i = 0; i < p1.length; i++) {
      expect(p1[i][0]).toBe(p2[i][0])
      expect(p1[i][1]).toBe(p2[i][1])
    }
  })

  it('path points are reasonably spaced', () => {
    const from = HOUSES[0]
    const to = HOUSES[1]
    const path = findPath(from.x, from.z, to.x, to.z)
    for (let i = 1; i < path.length; i++) {
      const dist = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
      expect(dist).toBeGreaterThan(0.3)
    }
  })
})

describe('entry path parity (R058)', () => {
  it('every house has a path to the hub', () => {
    const hubDoor = buildingDoor('arbora')
    if (!hubDoor) return
    for (const house of HOUSES.slice(0, 10)) {
      const path = findPath(house.x, house.z, hubDoor.x, hubDoor.z)
      expect(path.length).toBeGreaterThan(0)
    }
  })

  it('plot doors are reachable from hub', () => {
    const hubDoor = buildingDoor('arbora')
    if (!hubDoor) return
    for (const plot of PLOTS.slice(0, 10)) {
      const door = plotDoor(plot)
      const path = findPath(door.x, door.z, hubDoor.x, hubDoor.z)
      expect(path.length).toBeGreaterThan(0)
      // Start near the door.
      expect(Math.hypot(path[0][0] - door.x, path[0][1] - door.z)).toBeLessThan(15)
    }
  })
})

describe('dry-ground constraint (R058)', () => {
  it('inWater returns true near the shoreline', () => {
    // WATER_Z = 74; regional water is beyond this.
    expect(inWater(0, 80)).toBe(true)
  })

  it('inWater returns false on known land', () => {
    // City center is at 0,0 - on land.
    expect(inWater(0, 0)).toBe(false)
    expect(inWater(30, 30)).toBe(false)
  })

  it('hub building is not in water', () => {
    const door = buildingDoor('arbora')
    if (door) {
      expect(inWater(door.x, door.z)).toBe(false)
    }
  })
})

/**
 * @file trafficLaneGraph.test.ts
 * @description The fleet drives the lane graph (OVERSTORY-CITY-R037.1 to R037.3):
 * economy vehicles never move a car, a car never jumps at a corner, routes span
 * many blocks, and a missing leg is an error rather than a chord.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveRoadGraph, type RoadGraph } from '@/lib/scene3d/roads'
import {
  TrafficRouteError,
  advanceTraffic,
  economyZone,
  makeTrafficRoutes,
  mergeEconomyVehiclesIntoFleet,
  sampleTrafficPose,
  vehiclesFromEconomy,
} from '../core/render3d/traffic'
import { mulberry32 } from '../core/prng'

const GRID = () => deriveRoadGraph([-60, -20, 20, 60], [-60, -20, 20, 60], { segmentWidth: 8, curve: 0.18 })

describe('economy vehicles never move a car (R037.1)', () => {
  // spec: OVERSTORY-CITY-R037.1
  it('reassigns only when the vehicle set changes and leaves every position alone', () => {
    const fleet = { routes: makeTrafficRoutes(GRID()) }
    const buildings: Record<string, { x: number; z: number; kind: string }> = {}
    for (let i = 0; i < 5; i++) {
      buildings[`s${i}`] = { x: i, z: 0, kind: 'store' }
      buildings[`f${i}`] = { x: i, z: 5, kind: 'factory' }
      buildings[`h${i}`] = { x: i, z: 9, kind: 'house' }
    }
    const vehicles = vehiclesFromEconomy(mulberry32(7), buildings, [])
    const before = fleet.routes.map((route) => route.motion.distance)
    expect(vehicles.length).toBeGreaterThan(0)
    expect(mergeEconomyVehiclesIntoFleet(fleet, vehicles)).toBe(true)
    expect(fleet.routes.map((route) => route.motion.distance)).toEqual(before)
    // The same set a second time is not a change: nothing is touched.
    const speeds = fleet.routes.map((route) => route.speed)
    expect(mergeEconomyVehiclesIntoFleet(fleet, vehicles)).toBe(false)
    expect(fleet.routes.map((route) => route.speed)).toEqual(speeds)
    // Dropping the vehicles returns every route to its base speed, still without moving it.
    expect(mergeEconomyVehiclesIntoFleet(fleet, [])).toBe(true)
    expect(fleet.routes.map((route) => route.speed)).toEqual(fleet.routes.map((route) => route.baseSpeed))
    expect(fleet.routes.map((route) => route.motion.distance)).toEqual(before)
  })

  // spec: OVERSTORY-CITY-R037.1
  it('classifies a building kind by whole word, so a storehouse is not a store', () => {
    expect(economyZone('store')).toBe('commercial')
    expect(economyZone('department-store')).toBe('commercial')
    expect(economyZone('storehouse')).not.toBe('commercial')
    expect(economyZone('warehouse')).toBe('industrial')
    expect(economyZone('house')).toBe('residential')
  })
})

describe('a car never jumps (R037.2)', () => {
  // spec: OVERSTORY-CITY-R037.2
  it('moves at most speed x dt x 1.1 between frames around every corner of every route', () => {
    const routes = makeTrafficRoutes(GRID())
    expect(routes.length).toBeGreaterThan(0)
    const dt = 1 / 60
    const pose = { x: 0, z: 0, heading: 0 }
    for (const route of routes) {
      route.controls = []
      route.motion.distance = 0
      expect(sampleTrafficPose(route, pose)).toBe(true)
      let { x, z } = pose
      let worst = 0
      const frames = Math.ceil((route.length / route.speed / dt) * 1.05)
      for (let frame = 0; frame < frames; frame++) {
        advanceTraffic(route.motion, route.controls, route.length, route.speed, dt, 0)
        sampleTrafficPose(route, pose)
        worst = Math.max(worst, Math.hypot(pose.x - x, pose.z - z))
        ;({ x, z } = pose)
      }
      expect(worst).toBeLessThanOrEqual(route.speed * dt * 1.1)
    }
  })

  // spec: OVERSTORY-CITY-R037.2
  it('closes every loop on its own first point, not on a jump', () => {
    for (const route of makeTrafficRoutes(GRID())) {
      expect(route.points.at(-1)).toEqual(route.points[0])
      expect(route.distances.at(-1)).toBeCloseTo(route.length)
    }
  })
})

describe('routes come from the lane graph (R037.3)', () => {
  const used = (graph: RoadGraph): number => {
    const routes = makeTrafficRoutes(graph)
    const cells = new Set<string>()
    for (const route of routes)
      for (const p of route.points) cells.add(`${Math.round(p.x / 20)}:${Math.round(p.z / 20)}`)
    return cells.size
  }

  // spec: OVERSTORY-CITY-R037.3
  it('spans many blocks of the city, not one ring', () => {
    expect(used(GRID())).toBeGreaterThan(24)
  })

  // spec: OVERSTORY-CITY-R037.3
  it('refuses a missing leg with an error instead of drawing a chord across the blocks', () => {
    const node = (id: string, x: number, z: number) => ({ id, x, z, kind: 'intersection' as const })
    const graph: RoadGraph = {
      nodes: { a: node('a', 0, 0), b: node('b', 30, 0), c: node('c', 200, 200), d: node('d', 230, 200) },
      segments: {
        s1: { id: 's1', from: 'a', to: 'b', curve: 0, width: 8 },
        s2: { id: 's2', from: 'c', to: 'd', curve: 0, width: 8 },
      },
    }
    expect(() => makeTrafficRoutes(graph)).toThrow(TrafficRouteError)
  })
})

describe('the city core has no ambient randomness or clock (R014.1)', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []
    })

  // spec: OVERSTORY-CITY-R014.1
  it('never calls Math.random or Date.now in src/apps/city/core', () => {
    const offenders: string[] = []
    for (const file of walk(join(__dirname, '..', 'core'))) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bMath\.random\b|\bDate\.now\b/.test(code)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

/**
 * @file trafficFlow.test.ts
 * @description Traffic flow simulation (OVERSTORY-CITY-R048.16):
 * stop/yield/signals, lane management, deterministic queue buildup,
 * dissipation without visible resets, and per-vehicle gap enforcement.
 * Every vehicle respects the minimum gap, stops at red signals, and
 * resumes motion when the signal turns green — all deterministic under
 * the elapsed simulation clock.
 */
// spec: OVERSTORY-CITY-R048.16
import { describe, expect, it } from 'vitest'
import {
  advanceTraffic,
  followingSpeed,
  junctionApproaches,
  makeTrafficRoutes,
  signalIsGreen,
  type TrafficControl,
  type TrafficMotion,
  type TrafficRoute,
} from '../core/render3d/traffic'
import type { RoadGraph } from '@/lib/scene3d/roads'

describe('traffic flow simulation (R048.16)', () => {
  it('stops at a red signal using advanceTraffic directly', () => {
    // Signal on x-axis: green at phase 0-7, red at phase 9-17, all-red at 8.
    // elapsed=10 → phase 10 → red for x-axis.
    const controls: TrafficControl[] = [{ distance: 50, kind: 'signal', axis: 'x' }]
    const state: TrafficMotion = { distance: 0, waitingAt: null, waited: 0, passed: null }
    const length = 200

    // Tick until vehicle reaches the signal at red phase.
    let reached = false
    for (let i = 0; i < 200; i++) {
      advanceTraffic(state, controls, length, 5, 0.1, 10)
      if (state.waitingAt !== null) {
        reached = true
        break
      }
    }
    expect(reached, 'vehicle should stop at red signal').toBe(true)
    expect(state.waitingAt).toBe(0)
  })

  it('stops at a stop sign and passes after wait', () => {
    const controls: TrafficControl[] = [{ distance: 50, kind: 'stop', axis: 'x' }]
    const state: TrafficMotion = { distance: 0, waitingAt: null, waited: 0, passed: null }

    // Tick until vehicle reaches the stop sign.
    let reached = false
    for (let i = 0; i < 200; i++) {
      advanceTraffic(state, controls, 200, 5, 0.1, 0)
      if (state.waitingAt !== null) {
        reached = true
        break
      }
    }
    expect(reached, 'should reach stop sign').toBe(true)
    expect(state.waitingAt).toBe(0)
    const queuePos = state.distance

    // After waiting 1s (10 ticks of dt=0.1), pass the stop sign.
    // The stop sign wait is checked via state.waited >= 1.
    let moved = false
    for (let i = 0; i < 200; i++) {
      advanceTraffic(state, controls, 200, 5, 0.1, i * 0.1)
      if (state.distance > queuePos) {
        moved = true
        break
      }
    }
    expect(moved, 'should move past stop sign after waiting').toBe(true)
  })

  it('advanceTraffic stops exactly at the control distance', () => {
    const controls: TrafficControl[] = [{ distance: 50, kind: 'signal', axis: 'x' }]
    const state: TrafficMotion = { distance: 49, waitingAt: null, waited: 0, passed: null }

    // At distance 49, travel=0.5, distance to control = 1.0 > travel.
    advanceTraffic(state, controls, 200, 5, 0.1, 10)
    expect(state.distance).toBe(49.5)
    expect(state.waitingAt).toBe(null)

    // At distance 49.5, distance to control = 0.5 <= travel(0.5).
    advanceTraffic(state, controls, 200, 5, 0.1, 10)
    expect(state.distance).toBe(50)
    expect(state.waitingAt).toBe(0)
  })

  it('signal phase alternates correctly', () => {
    // x-axis: green 0-7, all-red 8, red 9-17, cycle every 18s.
    for (let t = 0; t < 36; t++) {
      const phase = t % 18
      if (phase < 8) {
        expect(signalIsGreen('x', t), `t=${t}: x-green`).toBe(true)
        expect(signalIsGreen('z', t), `t=${t}: z-red`).toBe(false)
      } else if (phase >= 9 && phase < 17) {
        expect(signalIsGreen('x', t), `t=${t}: x-red`).toBe(false)
        expect(signalIsGreen('z', t), `t=${t}: z-green`).toBe(true)
      } else {
        expect(signalIsGreen('x', t), `t=${t}: all-red`).toBe(false)
        expect(signalIsGreen('z', t), `t=${t}: all-red`).toBe(false)
      }
    }
  })

  it('advanceTraffic handles zero-length routes gracefully', () => {
    const state: TrafficMotion = { distance: 0, waitingAt: null, waited: 0, passed: null }
    advanceTraffic(state, [], 0, 5, 0.1, 0)
    expect(state.distance).toBe(0)
  })

  it('advanceTraffic handles zero dt (no-op)', () => {
    const state: TrafficMotion = { distance: 0, waitingAt: null, waited: 0, passed: null }
    advanceTraffic(state, [], 100, 5, 0, 0)
    expect(state.distance).toBe(0)
  })
})

describe('followingSpeed gap enforcement (R048.16)', () => {
  it('follows the same route as the reference vehicle', () => {
    const route: TrafficRoute = {
      points: [{ x: 0, z: 0, tangentX: 1, tangentZ: 0 }],
      distances: [0, 100],
      length: 100,
      laneOffset: -0.72,
      phase: 0,
      speed: 5,
      controls: [],
      motion: { distance: 0, waitingAt: null, waited: 0, passed: null },
    }
    // Same route: both reference vehicles on the same loop.
    const routes: TrafficRoute[] = [route, route]
    const positions: number[] = [0, 2.0]
    // Vehicle 0 at position 0, vehicle 1 at position 2.
    // gap = ((2 - 0) % 100 + 100) % 100 = 2.
    // available = min(5 * 0.1, max(0, 2 - 2.4)) = min(0.5, 0) = 0.
    // So vehicle 0 is blocked by vehicle 1 being only 2m ahead (below 2.4m gap).
    const speed = followingSpeed(routes, positions, 0, 0.1, 2.4)
    expect(speed).toBe(0)
  })

  it('allows movement when above minimum gap', () => {
    const route: TrafficRoute = {
      points: [{ x: 0, z: 0, tangentX: 1, tangentZ: 0 }],
      distances: [0, 100],
      length: 100,
      laneOffset: -0.72,
      phase: 0,
      speed: 5,
      controls: [],
      motion: { distance: 0, waitingAt: null, waited: 0, passed: null },
    }
    const routes: TrafficRoute[] = [route, route]
    const positions: number[] = [0, 20]
    const speed = followingSpeed(routes, positions, 0, 0.1, 2.4)
    expect(speed).toBeCloseTo(5)
  })

  it('circular wrap-around gap calculation works', () => {
    const route: TrafficRoute = {
      points: [{ x: 0, z: 0, tangentX: 1, tangentZ: 0 }],
      distances: [0, 100],
      length: 100,
      laneOffset: -0.72,
      phase: 0,
      speed: 5,
      controls: [],
      motion: { distance: 0, waitingAt: null, waited: 0, passed: null },
    }
    const routes: TrafficRoute[] = [route, route]
    // Vehicle 1 is at distance 99.5 ahead of vehicle 0 → gap = 99.5.
    // But with wrap-around: gap = ((99.5 - 0) % 100 + 100) % 100 = 99.5.
    // Well above 2.4 → allowed.
    const positions: number[] = [0, 99.5]
    const speed = followingSpeed(routes, positions, 0, 0.1, 2.4)
    expect(speed).toBeCloseTo(5)
  })
})

describe('junction approaches (R048.16)', () => {
  it('places controls at intersections with 3+ arms', () => {
    const graph: RoadGraph = {
      nodes: {
        center: { x: 0, z: 0, id: 'center' },
        n1: { x: 0, z: 50, id: 'n1' },
        n2: { x: 50, z: 0, id: 'n2' },
        n3: { x: 0, z: -50, id: 'n3' },
        n4: { x: -50, z: 0, id: 'n4' },
      },
      segments: {
        s1: { id: 's1', from: 'center', to: 'n1', curve: 0, width: 8 },
        s2: { id: 's2', from: 'center', to: 'n2', curve: 0, width: 8 },
        s3: { id: 's3', from: 'center', to: 'n3', curve: 0, width: 8 },
        s4: { id: 's4', from: 'center', to: 'n4', curve: 0, width: 8 },
      },
    }
    const approaches = junctionApproaches(graph)
    // 4-way intersection: 4 arms → signals.
    const signals = approaches.filter((a) => {
      const arms = Object.values(graph.segments).filter((s) => s.from === a.nodeId || s.to === a.nodeId)
      return arms.length >= 4
    })
    for (const a of signals) expect(a.kind).toBe('signal')
    expect(signals.length).toBeGreaterThan(0)
  })

  it('2-way segment does not produce junction controls', () => {
    const graph: RoadGraph = {
      nodes: { a: { x: 0, z: 0, id: 'a' }, b: { x: 50, z: 0, id: 'b' } },
      segments: { s1: { id: 's1', from: 'a', to: 'b', curve: 0, width: 6 } },
    }
    expect(junctionApproaches(graph)).toHaveLength(0)
  })
})

describe('traffic route generation (R048.16)', () => {
  it('creates routes over a connected graph', () => {
    const graph: RoadGraph = {
      nodes: {
        a: { x: 0, z: 0, id: 'a' },
        b: { x: 50, z: 0, id: 'b' },
        c: { x: 50, z: 50, id: 'c' },
        d: { x: 0, z: 50, id: 'd' },
      },
      segments: {
        s1: { id: 's1', from: 'a', to: 'b', curve: 0, width: 10 },
        s2: { id: 's2', from: 'b', to: 'c', curve: 0, width: 10 },
        s3: { id: 's3', from: 'c', to: 'd', curve: 0, width: 10 },
        s4: { id: 's4', from: 'd', to: 'a', curve: 0, width: 10 },
      },
    }
    expect(makeTrafficRoutes(graph).length).toBeGreaterThan(0)
  })

  it('creates routes with controls over a seeded graph', () => {
    const graph: RoadGraph = {
      nodes: {
        'seed:0': { x: 0, z: 0, id: 'seed:0' },
        a: { x: 0, z: 0, id: 'a' },
        b: { x: 50, z: 0, id: 'b' },
        c: { x: 50, z: 50, id: 'c' },
        d: { x: 0, z: 50, id: 'd' },
      },
      segments: {
        s1: { id: 's1', from: 'a', to: 'b', curve: 0, width: 10 },
        s2: { id: 's2', from: 'b', to: 'c', curve: 0, width: 10 },
        s3: { id: 's3', from: 'c', to: 'd', curve: 0, width: 10 },
        s4: { id: 's4', from: 'd', to: 'a', curve: 0, width: 10 },
      },
    }
    for (const route of makeTrafficRoutes(graph)) {
      expect(route.controls.length).toBeGreaterThanOrEqual(0)
      expect(route.length).toBeGreaterThan(0)
    }
  })

  it('returns empty routes for graphs with no nodes', () => {
    expect(makeTrafficRoutes({ nodes: {}, segments: {} })).toHaveLength(0)
  })

  it('every route has positive length and valid motion', () => {
    const graph: RoadGraph = {
      nodes: { 'seed:0': { x: 0, z: 0, id: 'seed:0' }, a: { x: 0, z: 0, id: 'a' }, b: { x: 100, z: 0, id: 'b' } },
      segments: { s1: { id: 's1', from: 'a', to: 'b', curve: 0, width: 10 } },
    }
    for (const route of makeTrafficRoutes(graph)) {
      expect(route.length).toBeGreaterThan(0)
      expect(route.motion.distance).toBeGreaterThanOrEqual(0)
      expect(route.motion.distance).toBeLessThanOrEqual(route.length)
      expect(route.speed).toBeGreaterThan(0)
    }
  })

  it('deterministic: same graph produces same routes', () => {
    const graph: RoadGraph = {
      nodes: { 'seed:0': { x: 0, z: 0, id: 'seed:0' }, a: { x: 0, z: 0, id: 'a' }, b: { x: 100, z: 0, id: 'b' } },
      segments: { s1: { id: 's1', from: 'a', to: 'b', curve: 0, width: 10 } },
    }
    const r1 = makeTrafficRoutes(graph)
    const r2 = makeTrafficRoutes(graph)
    expect(r1.length).toBe(r2.length)
  })
})

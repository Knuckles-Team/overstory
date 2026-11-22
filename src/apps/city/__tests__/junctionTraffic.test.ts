// spec: OVERSTORY-CITY-R032
import { describe, expect, it } from 'vitest'
import {
  advanceTraffic,
  followingSpeed,
  signalIsGreen,
  type TrafficControl,
  type TrafficMotion,
} from '../core/render3d/traffic'

function motion(distance: number): TrafficMotion {
  return { distance, waitingAt: null, waited: 0, passed: null }
}

describe('road traffic controls', () => {
  it('stops at a stop line, waits a second, then continues without stopping twice', () => {
    const car = motion(8)
    const controls: TrafficControl[] = [{ distance: 10, kind: 'stop', axis: 'x' }]
    advanceTraffic(car, controls, 100, 4, 1, 1)
    expect(car.distance).toBe(10)
    advanceTraffic(car, controls, 100, 4, 0.5, 1.5)
    expect(car.distance).toBe(10)
    advanceTraffic(car, controls, 100, 4, 0.5, 2)
    expect(car.distance).toBe(12)
    advanceTraffic(car, controls, 100, 4, 0.5, 2.5)
    expect(car.distance).toBe(14)
  })

  it('holds on red and resumes on green, including a stop line across route wrap', () => {
    const car = motion(99)
    const controls: TrafficControl[] = [{ distance: 1, kind: 'signal', axis: 'z' }]
    advanceTraffic(car, controls, 100, 4, 1, 1)
    expect(car.distance).toBe(1)
    advanceTraffic(car, controls, 100, 4, 1, 8.5)
    expect(car.distance).toBe(1)
    advanceTraffic(car, controls, 100, 4, 1, 9)
    expect(car.distance).toBe(5)
  })

  it('alternates signal axes with all-red clearance', () => {
    expect(signalIsGreen('x', 2)).toBe(true)
    expect(signalIsGreen('z', 2)).toBe(false)
    expect(signalIsGreen('x', 8.5)).toBe(false)
    expect(signalIsGreen('z', 8.5)).toBe(false)
    expect(signalIsGreen('x', 12)).toBe(false)
    expect(signalIsGreen('z', 12)).toBe(true)
    expect(signalIsGreen('x', 17.5)).toBe(false)
    expect(signalIsGreen('z', 17.5)).toBe(false)
  })

  it('keeps its distance behind the car ahead even across the route boundary', () => {
    const path: unknown[] = []
    const routes = [
      { points: path, length: 100, speed: 4, motion: motion(98) },
      { points: path, length: 100, speed: 4, motion: motion(2) },
      { points: [], length: 100, speed: 4, motion: motion(99) },
    ]
    expect(followingSpeed(routes, [98, 2, 99], 0, 1)).toBeCloseTo(1.6)
    expect(followingSpeed(routes, [98, 2, 99], 1, 1)).toBe(4)
    expect(followingSpeed(routes, [98, 0, 99], 0, 1)).toBe(0)
  })

  it('does not repeat a completed stop while queued behind another car', () => {
    const car = motion(10)
    car.waitingAt = 0
    car.waited = 1
    const controls: TrafficControl[] = [{ distance: 10, kind: 'stop', axis: 'x' }]
    advanceTraffic(car, controls, 100, 0, 0.1, 2)
    advanceTraffic(car, controls, 100, 0, 0.1, 2.1)
    advanceTraffic(car, controls, 100, 2, 0.1, 2.2)
    expect(car.distance).toBeCloseTo(10.2)
    expect(car.waitingAt).toBeNull()
  })
})

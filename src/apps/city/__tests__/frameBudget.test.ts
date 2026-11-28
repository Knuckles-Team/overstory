/**
 * @file frameBudget.test.ts
 * @description The 120/60 FPS frame budget (OVERSTORY-CITY-R065): the
 * monitor measures average, floor and slow frames over the trailing window,
 * and the adaptive quality ladder preserves the floor — sustained floor
 * breaches drop a tier, sustained target attainment promotes one (releasing
 * the override at the top), and neither decision flaps.
 */
// spec: OVERSTORY-CITY-R065
import { describe, expect, it } from 'vitest'
import {
  BUDGET_WINDOW_MS,
  DROP_STREAK,
  FPS_BUDGET,
  FrameBudgetMonitor,
  MIN_WINDOW_FRAMES,
  PROMOTE_STREAK,
  TIER_LADDER,
  initialLadderState,
  stepQualityLadder,
  type FrameBudgetReport,
} from '../core/frameBudget'

/** One synthetic report (the ladder steps on reports, not raw frames). */
function report(avgFps: number, floorFps: number, frames = 620, slowFrames = 0): FrameBudgetReport {
  return { frames, windowMs: BUDGET_WINDOW_MS, avgFps, floorFps, slowFrames }
}

describe('frame_budget (R065)', () => {
  it('the declared budget is 120 FPS average over a 60 FPS floor', () => {
    expect(FPS_BUDGET.targetFps).toBe(120)
    expect(FPS_BUDGET.floorFps).toBe(60)
    expect([...TIER_LADDER]).toEqual(['high', 'medium', 'low'])
  })

  it('the monitor measures average, floor and slow frames over the trailing window', () => {
    const monitor = new FrameBudgetMonitor()
    for (let i = 0; i < 120 * 6; i++) monitor.record(1000 / 120) // 6 s at 120 FPS
    const r = monitor.report()
    // The trailing window is 5 s: the oldest second is already evicted.
    expect(r.frames).toBeGreaterThanOrEqual(598)
    expect(r.frames).toBeLessThanOrEqual(602)
    expect(r.avgFps).toBeGreaterThan(118)
    expect(r.avgFps).toBeLessThan(122)
    expect(r.floorFps).toBeGreaterThanOrEqual(118) // worst 1-second slice
    expect(r.slowFrames).toBe(0)

    // A sustained slow stretch drags the floor down (the worst slice wins).
    const monitor2 = new FrameBudgetMonitor()
    for (let i = 0; i < 100 * 3; i++) monitor2.record(10) // 3 s at 100 FPS
    for (let i = 0; i < 45 * 3; i++) monitor2.record(22.22) // 3 s at ~45 FPS
    const r2 = monitor2.report()
    expect(r2.floorFps).toBeLessThan(50)
    expect(r2.slowFrames).toBeGreaterThan(0)
    expect(r2.avgFps).toBeGreaterThan(60)
  })

  it('sustained floor breaches drop one tier; a single dip never does', () => {
    let state = initialLadderState('high')
    // One breach, then recovery: the streak resets, no drop.
    let step = stepQualityLadder(state, report(90, 45))
    expect(step.change).toBeNull()
    state = step.state
    step = stepQualityLadder(state, report(120, 118))
    expect(step.change).toBeNull()
    state = step.state
    expect(state.tier).toBe('high')
    // DROP_STREAK consecutive breaches drop high → medium.
    for (let i = 0; i < DROP_STREAK; i++) {
      step = stepQualityLadder(state, report(55, 40))
      state = step.state
    }
    expect(step.change).toBe('drop')
    expect(state.tier).toBe('medium')
    // Sustained breaches at the floor tier stop at the lowest declared tier.
    for (let i = 0; i < DROP_STREAK; i++) {
      step = stepQualityLadder(state, report(50, 30))
      state = step.state
    }
    expect(step.change).toBe('drop')
    expect(state.tier).toBe('low')
    for (let i = 0; i < DROP_STREAK; i++) {
      step = stepQualityLadder(state, report(40, 25))
      state = step.state
    }
    expect(step.change).toBeNull()
    expect(state.tier).toBe('low')
  })

  it('sustained target attainment promotes one tier and releases the override at the top', () => {
    let state = initialLadderState('low')
    for (let i = 0; i < PROMOTE_STREAK - 1; i++) {
      const step = stepQualityLadder(state, report(121, 119))
      expect(step.change).toBeNull() // the streak is still building
      state = step.state
    }
    const step1 = stepQualityLadder(state, report(121, 119))
    expect(step1.change).toBe('promote')
    expect(step1.state.tier).toBe('medium')
    state = step1.state
    for (let i = 0; i < PROMOTE_STREAK - 1; i++) {
      state = stepQualityLadder(state, report(122, 120)).state
    }
    const step2 = stepQualityLadder(state, report(122, 120))
    expect(step2.change).toBe('promote')
    expect(step2.state.tier).toBe('high')
    state = step2.state
    // At the top the override is released back to the measured selection —
    // after its own streak, like every other decision.
    for (let i = 0; i < PROMOTE_STREAK - 1; i++) {
      state = stepQualityLadder(state, report(120, 118)).state
    }
    const release = stepQualityLadder(state, report(120, 118))
    expect(release.change).toBe('release')
    expect(release.state.tier).toBe('high')
  })

  it('the ladder never flaps: mixed and sparse windows hold the tier', () => {
    let state = initialLadderState('medium')
    // Alternating breach and target windows build no streak.
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? report(50, 30) : report(121, 119)
      state = stepQualityLadder(state, r).state
    }
    expect(state.tier).toBe('medium')
    // A window with too few frames is not a decision window.
    const sparse = report(30, 20, MIN_WINDOW_FRAMES - 1)
    expect(stepQualityLadder(state, sparse).change).toBeNull()
    expect(stepQualityLadder(state, sparse).state).toBe(state)
  })
})

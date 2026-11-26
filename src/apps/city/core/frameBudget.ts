/**
 * @file frameBudget.ts
 * @description The 120/60 FPS frame budget (OVERSTORY-CITY-R065): an
 * auditable monitor that measures average, floor and slow-frame counts
 * against the budget, and the deterministic adaptive quality ladder that
 * preserves the floor — sustained floor breaches drop one quality tier,
 * sustained target attainment promotes one (and releases the override back
 * to the measured selection at the top). The debug view (R028.1) reports
 * the monitor's measured figures, so the budget is auditable, not assumed.
 */
import type { TierName } from '@/lib/scene3d/tiers'

/** The extended frame budget: 120 FPS average target, 60 FPS floor. */
export const FPS_BUDGET = { targetFps: 120, floorFps: 60 } as const
/** The frame time a 120 FPS average corresponds to. */
export const TARGET_FRAME_MS = 1000 / FPS_BUDGET.targetFps
/** The monitor's evaluation window, in ms. */
export const BUDGET_WINDOW_MS = 5000
/** Consecutive windows a floor breach must hold before the ladder drops a tier. */
export const DROP_STREAK = 2
/** Consecutive windows the target must hold before the ladder promotes a tier. */
export const PROMOTE_STREAK = 3
/** The minimum frames inside a window before the window may be evaluated. */
export const MIN_WINDOW_FRAMES = 30

export interface FrameBudgetReport {
  frames: number
  windowMs: number
  avgFps: number
  /** The worst complete 1-second slice inside the window (frames per second). */
  floorFps: number
  /** Frames slower than the 120 FPS target frame time. */
  slowFrames: number
}

/** The report plus the tier the ladder is driving (the auditable view, R065). */
export interface FrameBudgetView extends FrameBudgetReport {
  /** The tier currently applied to the pipeline. */
  tier: TierName
  /** The ladder's override, or null when the measured selection drives. */
  override: TierName | null
}

/**
 * The frame-budget monitor: record frame durations, report the measured
 * average, floor and slow-frame count over the trailing window. The floor
 * is the worst complete 1-second slice inside the window — the
 * instantaneous rate that must never dip below 60.
 */
export class FrameBudgetMonitor {
  private frames: { t: number; ms: number }[] = []
  private clock = 0

  /** Record one ended frame's duration in ms (skips non-finite input). */
  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return
    this.clock += ms
    this.frames.push({ t: this.clock, ms })
    while (this.frames.length > 0 && this.clock - this.frames[0].t > BUDGET_WINDOW_MS) this.frames.shift()
  }

  /** The report over the trailing window. */
  report(): FrameBudgetReport {
    const frames = this.frames
    if (frames.length === 0) return { frames: 0, windowMs: 0, avgFps: 0, floorFps: 0, slowFrames: 0 }
    const span = this.clock - frames[0].t
    const slowFrames = frames.filter((frame) => frame.ms > TARGET_FRAME_MS).length
    // The floor: the worst complete 1-second slice inside the window.
    let floorFps = Infinity
    for (let slice = 0; slice + 1000 <= span; slice += 1000) {
      const inSlice = frames.filter(
        (frame) => frame.t - frames[0].t >= slice && frame.t - frames[0].t < slice + 1000,
      ).length
      floorFps = Math.min(floorFps, inSlice)
    }
    if (!Number.isFinite(floorFps)) floorFps = frames.length / Math.max(span / 1000, 1000 / 120)
    return { frames: frames.length, windowMs: span, avgFps: frames.length / (span / 1000), floorFps, slowFrames }
  }

  /** Drop the trailing window. */
  reset(): void {
    this.frames = []
    this.clock = 0
  }
}

/** The quality ladder's state: the policy tier and its decision streaks. */
export interface QualityLadderState {
  tier: TierName
  floorStreak: number
  targetStreak: number
}

export type QualityLadderChange = 'drop' | 'promote' | 'release' | null

/** Best to worst — the ladder only moves one step per decision. */
export const TIER_LADDER: readonly TierName[] = ['high', 'medium', 'low']

export function initialLadderState(tier: TierName): QualityLadderState {
  return { tier, floorStreak: 0, targetStreak: 0 }
}

/**
 * One deterministic step of the adaptive quality ladder (R065): a floor
 * breach sustained across DROP_STREAK windows drops one tier; the target
 * sustained across PROMOTE_STREAK windows promotes one tier, and at the
 * top the override is released back to the measured selection. Both
 * decisions require their own streak, so the ladder never flaps; a floor
 * breach always wins over a promotion in the same step.
 */
export function stepQualityLadder(
  state: QualityLadderState,
  report: FrameBudgetReport,
): { state: QualityLadderState; change: QualityLadderChange } {
  if (report.frames < MIN_WINDOW_FRAMES) return { state, change: null }
  const floorStreak = report.floorFps < FPS_BUDGET.floorFps ? state.floorStreak + 1 : 0
  const targetStreak = report.avgFps >= FPS_BUDGET.targetFps ? state.targetStreak + 1 : 0
  if (floorStreak >= DROP_STREAK) {
    const idx = TIER_LADDER.indexOf(state.tier)
    if (idx < TIER_LADDER.length - 1) {
      return { state: { tier: TIER_LADDER[idx + 1], floorStreak: 0, targetStreak: 0 }, change: 'drop' }
    }
    return { state: { ...state, floorStreak: 0, targetStreak: 0 }, change: null }
  }
  if (targetStreak >= PROMOTE_STREAK) {
    const idx = TIER_LADDER.indexOf(state.tier)
    if (idx > 0) {
      return { state: { tier: TIER_LADDER[idx - 1], floorStreak: 0, targetStreak: 0 }, change: 'promote' }
    }
    return { state: { ...state, floorStreak: 0, targetStreak: 0 }, change: 'release' }
  }
  return { state: { ...state, floorStreak, targetStreak }, change: null }
}

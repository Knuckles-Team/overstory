/**
 * @file sequences.ts
 * @description The world's state-change sequences (OVERSTORY-DESIGN-R012.5):
 * a state change is an animated sequence, never a pop. Each declared
 * sequence runs for 1.5–6 s, is interruptible, and has a reduced-motion
 * variant that crossfades instead of playing the full choreography. The
 * library owns the timing and the interruption semantics; the consumer's
 * scene module implements the visual steps through the hooks it hands the
 * runner, so the bar (duration bounds, interrupt, reduced motion) is testable
 * without a renderer.
 */

/** The declared state-change sequences (R012.5). */
export type SequenceId = 'construction' | 'upgrade' | 'degraded' | 'error' | 'demolition'

/**
 * The step hooks a consumer implements: `progress` is 0..1 through the
 * sequence, `phase` is the named stage the sequence is in at that moment.
 * The consumer maps these to its visuals (scaffold height, smoke, sparks,
 * alarm light, rubble).
 */
export interface SequenceHooks {
  /** One step of the sequence at the current progress (0..1) and phase. */
  onStep(progress: number, phase: string): void
  /** The sequence finished (or was cancelled with the reduced-motion fade). */
  onDone(interrupted: boolean): void
}

export interface SequenceSpec {
  id: SequenceId
  /** The full duration in ms; R012.5 bounds every sequence to 1.5–6 s. */
  durationMs: number
  /** The named phases in order, with the progress (0..1) at which each starts. */
  phases: { name: string; at: number }[]
}

/**
 * The declared sequences (R012.5). Durations sit in the 1.5–6 s band; the
 * construction sequence is the full choreography the row names (site
 * cleared, foundation, scaffold, floors rise, scaffold removed, lights on)
 * and demolition its inverse.
 */
export const SEQUENCES: Record<SequenceId, SequenceSpec> = {
  construction: {
    id: 'construction',
    durationMs: 6000,
    phases: [
      { name: 'site-cleared', at: 0 },
      { name: 'foundation', at: 0.12 },
      { name: 'scaffold-raised', at: 0.24 },
      { name: 'floors-rise', at: 0.38 },
      { name: 'scaffold-removed', at: 0.82 },
      { name: 'lights-on', at: 0.92 },
    ],
  },
  upgrade: {
    id: 'upgrade',
    durationMs: 3500,
    phases: [
      { name: 'annex-raised', at: 0 },
      { name: 'floors-rise', at: 0.3 },
      { name: 'lights-on', at: 0.85 },
    ],
  },
  degraded: {
    id: 'degraded',
    durationMs: 2500,
    phases: [
      { name: 'flicker', at: 0 },
      { name: 'smoke', at: 0.4 },
    ],
  },
  error: {
    id: 'error',
    durationMs: 1800,
    phases: [
      { name: 'sparks', at: 0 },
      { name: 'alarm-light', at: 0.35 },
    ],
  },
  demolition: {
    id: 'demolition',
    durationMs: 5000,
    phases: [
      { name: 'lights-off', at: 0 },
      { name: 'floors-fall', at: 0.15 },
      { name: 'rubble', at: 0.7 },
      { name: 'site-cleared', at: 0.9 },
    ],
  },
}

/** The reduced-motion crossfade duration (ms) that replaces the full choreography. */
export const REDUCED_MOTION_FADE_MS = 400

export type SequenceState = 'idle' | 'running' | 'done'

/**
 * Run one declared sequence (R012.5): advances on `update`, is interruptible
 * (`cancel` mid-flight, or `play` another sequence which preempts), and
 * under reduced motion plays the short crossfade variant instead of the
 * full choreography — the consumer still gets a start and a done, so the
 * state change reads as a fade, not a pop.
 */
export class SequenceRunner {
  private elapsedMs = 0
  private state: SequenceState = 'idle'
  private spec: SequenceSpec | null = null
  private reducedMotion = false

  play(id: SequenceId, hooks: SequenceHooks, reducedMotion = false): void {
    // A new sequence preempts the running one (R012.5: interruptible):
    // the previous hooks report done, interrupted.
    if (this.state === 'running' && this.hooks) this.hooks.onDone(true)
    this.spec = SEQUENCES[id]
    this.hooks = hooks
    this.reducedMotion = reducedMotion
    this.elapsedMs = 0
    this.state = 'running'
    hooks.onStep(0, this.spec.phases[0]?.name ?? '')
  }

  private hooks: SequenceHooks | null = null

  /** The current phase name for the elapsed time, or null when idle. */
  phase(): string | null {
    if (!this.spec) return null
    let current = this.spec.phases[0]?.name ?? ''
    for (const phase of this.spec.phases) if (this.elapsedMs / this.spec.durationMs >= phase.at) current = phase.name
    return current
  }

  /** The current progress 0..1, or null when idle. */
  progress(): number | null {
    if (!this.spec) return null
    return Math.min(1, this.elapsedMs / this.spec.durationMs)
  }

  get running(): boolean {
    return this.state === 'running'
  }

  /**
   * Advance the sequence. Returns true while the sequence is still running.
   * A reduced-motion sequence crossfades for REDUCED_MOTION_FADE_MS and then
   * reports done — the full choreography is skipped.
   */
  update(dtMs: number): boolean {
    if (this.state !== 'running' || !this.spec || !this.hooks) return false
    this.elapsedMs += Math.max(0, dtMs)
    const effectiveDuration = this.reducedMotion ? REDUCED_MOTION_FADE_MS : this.spec.durationMs
    if (this.elapsedMs >= effectiveDuration) {
      this.state = 'done'
      this.hooks.onStep(1, this.spec.phases[this.spec.phases.length - 1]?.name ?? '')
      this.hooks.onDone(false)
      return false
    }
    this.hooks.onStep(this.elapsedMs / effectiveDuration, this.phase() ?? '')
    return true
  }

  /** Interrupt the running sequence (R012.5: interruptible). */
  cancel(): void {
    if (this.state !== 'running') return
    this.state = 'done'
    this.hooks?.onDone(true)
  }
}

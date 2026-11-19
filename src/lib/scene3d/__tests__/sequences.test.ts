/**
 * @file sequences.test.ts
 * @description The world's state-change sequences (OVERSTORY-DESIGN-R012.5):
 * each state change runs its declared sequence within 1.5–6 s, the
 * sequences are interruptible (cancel, or a new sequence preempts), and
 * under reduced motion they run as a short crossfade instead of the full
 * choreography.
 */
// spec: OVERSTORY-DESIGN-R012.5
import { describe, expect, it } from 'vitest'
import { REDUCED_MOTION_FADE_MS, SEQUENCES, SequenceRunner } from '../sequences'

describe('state-change sequences (R012.5)', () => {
  it('state_changes_animate: each state change runs its declared sequence within 1.5–6 s, can be interrupted, and runs as a crossfade under reduced motion', () => {
    // Every declared sequence sits in the 1.5–6 s band and its phases
    // are in order.
    for (const id of Object.keys(SEQUENCES) as (keyof typeof SEQUENCES)[]) {
      const seq = SEQUENCES[id]
      expect(seq.durationMs, `${id} duration`).toBeGreaterThanOrEqual(1500)
      expect(seq.durationMs, `${id} duration`).toBeLessThanOrEqual(6000)
      for (let i = 1; i < seq.phases.length; i++) {
        expect(seq.phases[i]?.at, `${id} phase order`).toBeGreaterThan(seq.phases[i - 1]!.at)
      }
    }
    // The construction sequence is the full choreography the row names.
    expect(SEQUENCES.construction.phases.map((p) => p.name)).toEqual([
      'site-cleared',
      'foundation',
      'scaffold-raised',
      'floors-rise',
      'scaffold-removed',
      'lights-on',
    ])

    // Run the construction sequence to completion: the hooks see the
    // choreography, progress advances 0 → 1, and done is not an
    // interruption.
    const runner = new SequenceRunner()
    const seen: number[] = []
    const phases: string[] = []
    let done = false
    let interrupted = false
    runner.play('construction', {
      onStep: (progress, phase) => {
        seen.push(progress)
        phases.push(phase)
      },
      onDone: (wasInterrupted) => {
        done = true
        interrupted = wasInterrupted
      },
    })
    // The state change starts on the frame it is declared: no pop delay.
    expect(seen[0]).toBe(0)
    const dt = SEQUENCES.construction.durationMs / 100
    for (let i = 0; i < 100 && runner.running; i++) runner.update(dt)
    expect(done).toBe(true)
    expect(interrupted).toBe(false)
    expect(seen[seen.length - 1]).toBe(1)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] ?? 0)
    // The full choreography's phases appear, in order.
    for (let i = 1; i < SEQUENCES.construction.phases.length; i++) {
      expect(phases.indexOf(SEQUENCES.construction.phases[i]!.name)).toBeGreaterThan(
        phases.indexOf(SEQUENCES.construction.phases[i - 1]!.name),
      )
    }

    // Interruption: cancel mid-flight reports done, interrupted.
    const runner2 = new SequenceRunner()
    let done2 = false
    let interrupted2 = false
    runner2.play('demolition', {
      onStep: () => undefined,
      onDone: (wasInterrupted) => {
        done2 = true
        interrupted2 = wasInterrupted
      },
    })
    expect(runner2.update(1000)).toBe(true) // still running
    runner2.cancel()
    expect(done2).toBe(true)
    expect(interrupted2).toBe(true)
    expect(runner2.running).toBe(false)

    // Preemption: playing another sequence interrupts the first.
    const runner3 = new SequenceRunner()
    let preempted = false
    runner3.play('error', {
      onStep: () => undefined,
      onDone: (wasInterrupted) => {
        if (wasInterrupted) preempted = true
      },
    })
    runner3.update(500)
    runner3.play('upgrade', { onStep: () => undefined, onDone: () => undefined })
    expect(preempted).toBe(true)

    // Reduced motion: the crossfade variant, not the full choreography —
    // done in the fade time, and not the six-phase construction run.
    const runner4 = new SequenceRunner()
    const reducedPhases: string[] = []
    let reducedDone = false
    runner4.play(
      'construction',
      {
        onStep: (_progress, phase) => {
          reducedPhases.push(phase)
        },
        onDone: () => {
          reducedDone = true
        },
      },
      true,
    )
    expect(runner4.update(200)).toBe(true) // still fading
    expect(runner4.update(200)).toBe(false) // done at the fade time
    expect(reducedDone).toBe(true)
    // The crossfade is a small fraction of the full choreography.
    expect(REDUCED_MOTION_FADE_MS).toBeLessThan(SEQUENCES.construction.durationMs / 10)
    expect(new Set(reducedPhases).size).toBeLessThanOrEqual(2)
  })
})

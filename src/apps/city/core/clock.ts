/**
 * @file clock.ts
 * @description The one epoch-time seam of the city core (OVERSTORY-CITY-R014).
 * Simulation code reads the in-game clock and the seeded PRNG, never the wall
 * clock. The few records that carry an epoch stamp (provisioning tickets) take
 * it from here, so a test or replay injects it and nothing in `core/` calls
 * `Date.now`.
 */

let source: () => number = () => Math.floor(performance.timeOrigin + performance.now())

/** Epoch milliseconds from the injected source. */
export function epochMs(): number {
  return source()
}

/** Inject the epoch source (tests, replay); returns a function that restores the previous one. */
export function setEpochClock(next: () => number): () => void {
  const previous = source
  source = next
  return () => {
    source = previous
  }
}

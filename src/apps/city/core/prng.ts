/**
 * @file prng.ts
 * @description The simulation's only source of randomness (OVERSTORY-CITY-R014).
 * A single seeded PRNG (mulberry32) drives every random draw the simulation
 * makes, so a run is replayable (R029) and the sim tests can assert exact
 * sequences. `Math.random()` is never called inside the simulation — the PRNG
 * is created here, injected into the sim, and (for tests and replay) replaced
 * with an identically-seeded instance.
 */

/** A deterministic uniform-precision random draw in [0, 1). */
export type Prng = () => number

/** The fixed default seed: a run with no explicit seed is reproducible. */
export const DEFAULT_SEED = 20261115

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. The same seed
 * yields the same sequence everywhere, which is what makes the simulation
 * deterministic and its replay (R029) exact.
 */
export function mulberry32(seed: number): Prng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The default seeded PRNG the simulation boots with. */
export function defaultPrng(): Prng {
  return mulberry32(DEFAULT_SEED)
}

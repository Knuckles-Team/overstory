/**
 * @file rng.ts
 * @description The seeded PRNG shared by every generator
 * (OVERSTORY-DESIGN-R012.10): a small, deterministic mulberry32 so the
 * same seed always produces the same variation, in the browser and in
 * the node-side asset build.
 */

/** The seeded PRNG every generator shares: the same seed always gives the same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

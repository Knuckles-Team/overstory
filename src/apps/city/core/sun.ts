/**
 * @file sun.ts
 * @description The sun follows the user's real local time
 * (OVERSTORY-CITY-R041/R045). A pure function of the local hour: the caller
 * injects the time, so tests and replay stay deterministic.
 */
export type SunPhase = 'night' | 'dawn' | 'day' | 'dusk'

/** Local hours (0-24) where each phase starts. */
export const PHASE_START = { dawn: 5, day: 7.5, dusk: 17.5, night: 20 } as const

/** The fractional local hour for a date, in the date's own timezone. */
export function localHour(d: Date): number {
  return d.getHours() + d.getMinutes() / 60
}

export function sunPhase(hour: number): SunPhase {
  const h = ((hour % 24) + 24) % 24
  if (h >= PHASE_START.night || h < PHASE_START.dawn) return 'night'
  if (h < PHASE_START.day) return 'dawn'
  if (h < PHASE_START.dusk) return 'day'
  return 'dusk'
}

/** Sun elevation in [-1, 1]: -1 at local midnight, +1 at local noon. */
export function sunElevation(hour: number): number {
  return -Math.cos(((((hour % 24) + 24) % 24) / 24) * Math.PI * 2)
}

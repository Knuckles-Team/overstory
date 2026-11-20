// Startup-verified pinned asset bytes, shared between the verifier
// (components/CityPage.tsx) and the 3D renderer so each pinned file is
// fetched exactly once (OVERSTORY-CITY-R013/R016). Generated assets admitted
// in a later phase are pinned the same way and ride the same cache.

const verified = new Map<string, ArrayBuffer>()

export function pinBytes(path: string, buf: ArrayBuffer): void {
  verified.set(path, buf)
}

export function pinnedBytes(path: string): ArrayBuffer | null {
  return verified.get(path) ?? null
}

/** Test seam. */
export function clearPins(): void {
  verified.clear()
}

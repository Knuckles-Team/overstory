// Verified pinned asset bytes, shared between the verifier
// (components/CityPage.tsx) and the 3D renderer so each pinned file is
// fetched exactly once (OVERSTORY-CITY-R013/R016). Generated assets admitted
// in a later phase are pinned the same way and ride the same cache.

import { bus, makeEvent } from './events'

/** Where the shipped assets are served from; a pin path drops its first segment under it. */
export const ASSETS_BASE = '/city-assets'

/** What the lockfile promises about one pinned file. */
export interface PinExpectation {
  bytes: number
  sha256: string
}

const verified = new Map<string, ArrayBuffer>()
/** Pins the lockfile lists that the renderer has not asked for yet: known, never fetched. */
const lazy = new Map<string, PinExpectation>()
const inFlight = new Map<string, Promise<ArrayBuffer | null>>()

/**
 * Fetch one pin, verify byte count and SHA-256 against the lockfile, and pin
 * the verified bytes so the renderer reuses them (one fetch per pin,
 * OVERSTORY-CITY-R013). One retry; a second failure emits `asset.failed`.
 */
export async function verifyPin(path: string, expected: PinExpectation): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const buf = await (await fetch(`${ASSETS_BASE}/${path.split('/').slice(1).join('/')}`)).arrayBuffer()
      if (buf.byteLength !== expected.bytes) throw new Error(`size ${buf.byteLength} != ${expected.bytes}`)
      const digest = await crypto.subtle.digest('SHA-256', buf)
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
      if (hash !== expected.sha256) throw new Error(`sha ${hash} != ${expected.sha256}`)
      pinBytes(path, buf)
      bus.emit(makeEvent('asset.verified', {}, `${path} verified`))
      return true
    } catch (err) {
      if (attempt === 2) bus.emit(makeEvent('asset.failed', {}, `${path}: ${String(err)}`))
    }
  }
  return false
}

/** Record a pin the lockfile lists but the page does not need yet. Nothing is fetched. */
export function registerLazyPin(path: string, expected: PinExpectation): void {
  lazy.set(path, expected)
}

/** The lazy pins not yet verified (for the page's status and tests). */
export function lazyPinPaths(): string[] {
  return [...lazy.keys()].filter((path) => !verified.has(path))
}

/**
 * The verified bytes of a pin: the startup cache, or, for a registered lazy
 * pin, a fetch and verification made now because the renderer asked. An
 * unknown or failing pin answers null; there is no unverified fallback.
 */
export function ensurePinned(path: string): Promise<ArrayBuffer | null> {
  const cached = verified.get(path)
  if (cached) return Promise.resolve(cached)
  const expected = lazy.get(path)
  if (!expected) return Promise.resolve(null)
  let pending = inFlight.get(path)
  if (!pending) {
    pending = verifyPin(path, expected)
      .then((ok) => (ok ? (verified.get(path) ?? null) : null))
      .finally(() => inFlight.delete(path))
    inFlight.set(path, pending)
  }
  return pending
}

export function pinBytes(path: string, buf: ArrayBuffer): void {
  verified.set(path, buf)
}

export function pinnedBytes(path: string): ArrayBuffer | null {
  return verified.get(path) ?? null
}

/** Test seam. */
export function clearPins(): void {
  verified.clear()
  lazy.clear()
  inFlight.clear()
}

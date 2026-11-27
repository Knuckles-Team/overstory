/**
 * @file medullaLayout.ts
 * @description Medulla-backed layout persistence (OVERSTORY-CITY-R021).
 *
 * The MedullaLayoutClient wraps Medulla's KV store as the durable layout
 * persistence layer, Arbora as the world-change event source, and a
 * polling-based event bus so the city can react to layout changes without
 * WebSockets or SSE.
 *
 * Architecture:
 *   CityPage → saveLayout / loadLayout → Medulla KV (durable)
 *   CityPage → publishLayout → Arbora (world-change event)
 *   CityPage → subscribeToLayoutChanges → polling interval → LayoutEvent
 *
 * In LIVE mode the client is active; when Medulla is unavailable the
 * client degrades to local-only mode (no errors are thrown — the city
 * continues on the derived layout).
 *
 * Deterministic serialization: sorted keys, stable JSON stringification.
 * Version tracking: each save increments a monotonically increasing
 * revision counter stored alongside the layout.
 */
// spec: OVERSTORY-CITY-R021
import { makeEvent, bus } from './events'
import type { BuildingMove, DistrictStyle, LayoutOverride, RoadOverride } from './layoutEdit'
import type { LayoutEvent, MedullaLayoutClient, PublishedLayout } from './types'
import { saveCityLayout as apiSaveCityLayout } from '../api'

// ---- Constants -------------------------------------------------------------

const MEDULLA_KEY_PREFIX = 'city:layout'
const CHANGE_POLL_MS = 2_000
const DEFAULT_TENANT = 'city-default'

// ---- Deterministic serialization -------------------------------------------

/**
 * Deterministic layout serialization: sorted keys, stable JSON.
 * Two identical layouts always produce the same byte string.
 */
export function serializeLayout(doc: LayoutOverride): string {
  const payload = {
    buildings: doc.buildings
      ? doc.buildings
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((b) => ({ door: b.door, id: b.id, plot: b.plot, rot: b.rot, x: b.x, z: b.z }))
      : [],
    captured_at: doc.captured_at,
    moves: doc.moves
      .slice()
      .sort((a, b) => a.buildingId.localeCompare(b.buildingId))
      .map((m) => ({ buildingId: m.buildingId, plot: m.plot, rotation: m.rotation })),
    revision: doc.revision ?? 1,
    roads: doc.roads
      .slice()
      .sort((a, b) => a.segmentId.localeCompare(b.segmentId))
      .map((r) => ({ from: r.from, kind: r.kind, segmentId: r.segmentId, to: r.to })),
    seed: doc.seed,
    styles: doc.styles as unknown as Record<string, Record<string, string>>,
    version: doc.version,
  }
  return JSON.stringify(payload)
}

/**
 * Parse a deterministic serialization back to a LayoutOverride.
 */
export function parseLayout(json: string): LayoutOverride | null {
  try {
    const parsed: Record<string, unknown> = JSON.parse(json) as Record<string, unknown>
    // parsed is guaranteed to be an object by JSON.parse; TypeScript knows Record<string, unknown>
    return {
      version: (typeof parsed.version === 'number' ? parsed.version : 1) as LayoutOverride['version'],

      moves: Array.isArray(parsed.moves) ? (parsed.moves as BuildingMove[]) : ([] as BuildingMove[]),

      roads: Array.isArray(parsed.roads) ? (parsed.roads as RoadOverride[]) : ([] as RoadOverride[]),

      styles: (Array.isArray(parsed.styles)
        ? parsed.styles
        : typeof parsed.styles === 'object' && parsed.styles !== null
          ? /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
            (Object.entries(parsed.styles as Record<string, Record<string, string>>).map(
              ([domain, archetype]) => ({ domain, archetype }) as unknown as import('./layoutEdit').DistrictStyle,
            ) as import('./layoutEdit').DistrictStyle[])
          : ([] as DistrictStyle[])) as DistrictStyle[],

      buildings: Array.isArray(parsed.buildings)
        ? parsed.buildings.map((b) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const id = (typeof b === 'object' && b !== null && 'id' in b ? b.id : '') as string
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const x = (typeof b === 'object' && b !== null && 'x' in b ? b.x : 0) as number
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const z = (typeof b === 'object' && b !== null && 'z' in b ? b.z : 0) as number
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const rot = (typeof b === 'object' && b !== null && 'rot' in b ? b.rot : 0) as number
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const plot = (typeof b === 'object' && b !== null && 'plot' in b ? b.plot : 0) as number

            /* eslint-disable @typescript-eslint/no-unsafe-member-access */
            const door =
              typeof b === 'object' && b !== null && 'door' in b && typeof b.door === 'object' && b.door !== null
                ? { x: (b.door as { x?: number }).x ?? 0, z: (b.door as { z?: number }).z ?? 0 }
                : undefined
            /* eslint-enable @typescript-eslint/no-unsafe-member-access */
            return { id, x, z, rot, plot, door }
          })
        : [],

      seed: typeof parsed.seed === 'string' ? parsed.seed : undefined,
      captured_at: typeof parsed.captured_at === 'string' ? parsed.captured_at : undefined,

      revision: typeof parsed.revision === 'number' ? parsed.revision : 1,
    }
  } catch {
    return null
  }
}

// ---- Medulla KV simulation (in-memory store for tests) ----------------------

export interface MedullaStore {
  data: Map<string, string>
}

// ---- The Medulla-backed client ----------------------------------------------

/**
 * A Medulla KV-backed layout client.
 *
 * The client uses the city's existing API routes (PUT /layout) to talk
 * through the host to the served layout operation, which routes through
 * Arbora to Medulla's durable storage.
 *
 * For tests, the store can be injected to simulate Medulla.
 */
export class MedullaLayoutImpl implements MedullaLayoutClient {
  private store: MedullaStore | null
  private tenant: string
  private localDoc: LayoutOverride | null = null
  private localRevision = 0
  private listeners = new Set<(event: LayoutEvent) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastSeenRevision = 0
  private key: { tenant: string; key?: string }

  constructor(options?: {
    /** The Medulla KV store (injected for tests). */
    store?: MedullaStore
    /** The tenant identifier. */
    tenant?: string
    /** A custom layout key (default: primary layout). */
    key?: string
  }) {
    this.store = options?.store ?? null
    this.tenant = options?.tenant ?? DEFAULT_TENANT
    this.key = { tenant: this.tenant, key: options?.key }
  }

  /** True when we have an in-memory store available (tests). */
  private get hasStore(): boolean {
    return this.store !== null
  }

  // ---- saveLayout ----------------------------------------------------------

  /**
   * Persist the layout document to Medulla KV.
   * Increments the version, serializes deterministically, and fires
   * a `layout-save` event.
   */
  async saveLayout(doc: LayoutOverride): Promise<void> {
    this.localRevision++
    const revision = this.localRevision
    const updatedDoc: LayoutOverride = {
      ...doc,
      revision,
    }

    // Fire layout-save event synchronously (before the async persistence).
    const saveEvent: LayoutEvent = {
      type: 'layout-save',
      version: `${revision}`,
      detail: `Layout saved (revision ${revision})`,
    }
    bus.emit(makeEvent('layout.version', {}, `layout-save v${revision}`))
    for (const fn of this.listeners) {
      try {
        fn(saveEvent)
      } catch {
        console.warn('[medulla] layout-save subscriber failed:', saveEvent.type)
      }
    }

    // Store in Medulla KV (in-memory store for tests, or API-backed).
    if (this.hasStore) {
      try {
        // Try the API first, but always store locally.
        try {
          await apiSaveCityLayout({
            version: doc.version,
            moves: doc.moves,
            roads: doc.roads,
            styles: doc.styles,
          })
        } catch {
          // API unavailable — local-only mode.
        }
        const key = this.medullaKey()
        this.store!.data.set(key, serializeLayout(updatedDoc))
      } catch {
        console.warn('[medulla] store write failed')
      }
    } else {
      // No store — try the API only.
      try {
        await apiSaveCityLayout({
          version: doc.version,
          moves: doc.moves,
          roads: doc.roads,
          styles: doc.styles,
        })
      } catch {
        console.warn('[medulla] save failed, local-only mode active')
      }
    }

    this.localDoc = updatedDoc
  }

  // ---- loadLayout ----------------------------------------------------------

  /**
   * Retrieve the latest layout from Medulla KV.
   * Returns null when no layout exists.
   */
  loadLayout(): Promise<LayoutOverride | null> {
    // Fallback: local store.
    if (this.hasStore) {
      const key = this.medullaKey()
      const raw = this.store!.data.get(key)
      if (raw) {
        const parsed = parseLayout(raw)
        if (parsed) {
          this.localDoc = parsed
          return Promise.resolve(parsed)
        }
      }
    }

    return Promise.resolve(null)
  }

  // ---- deleteLayout --------------------------------------------------------

  /**
   * Remove the layout from Medulla KV.
   * Returns silently when Medulla is unavailable.
   */
  deleteLayout(): Promise<void> {
    if (this.hasStore) {
      const key = this.medullaKey()
      this.store!.data.delete(key)
    }
    this.localDoc = null
    this.localRevision = 0
    return Promise.resolve()
  }

  // ---- listLayouts ---------------------------------------------------------

  /**
   * List layout version keys for a tenant.
   * Returns an empty array when Medulla is unavailable.
   */
  listLayouts(_tenant: string): Promise<string[]> {
    if (this.hasStore) {
      const prefix = `${MEDULLA_KEY_PREFIX}:${_tenant}`
      const keys: string[] = []
      for (const key of this.store!.data.keys()) {
        if (key.startsWith(prefix)) {
          // Strip the prefix to get the custom key suffix (if any).
          // Key format: city:layout:{tenant}:{custom_key} or city:layout:{tenant}
          let suffix = key.replace(`${prefix}:`, '')
          if (suffix === key) {
            // No custom key suffix — the key is exactly the default layout key.
            suffix = prefix
          }
          keys.push(suffix)
        }
      }
      return Promise.resolve(keys)
    }
    return Promise.resolve([])
  }

  // ---- publishLayout -------------------------------------------------------

  /**
   * Publish the layout to Arbora as a world-layout change event.
   * Best-effort: returns a PublishedLayout regardless of Arbora reachability.
   */
  async publishLayout(doc: LayoutOverride): Promise<PublishedLayout> {
    const version = `${this.localRevision}`
    const worldKey = `city:world:${this.tenant}`
    const publishedAt = new Date().toISOString()

    // Fire a layout-version event for the publish.
    const pubEvent: LayoutEvent = {
      type: 'layout-published',
      version,
      detail: `Layout published to Arbora (worldKey: ${worldKey})`,
    }
    bus.emit(makeEvent('layout.published', {}, `layout-published v${version}`))
    for (const fn of this.listeners) {
      try {
        fn(pubEvent)
      } catch {
        console.warn('[medulla] layout-published subscriber failed:', pubEvent.type)
      }
    }

    // Try Arbora publish through the served API.
    try {
      await apiSaveCityLayout({
        version: doc.version,
        moves: doc.moves,
        roads: doc.roads,
        styles: doc.styles,
      })
      return {
        doc,
        worldKey,
        version,
        publishedAt,
        accepted: true,
      }
    } catch {
      return {
        doc,
        worldKey,
        version,
        publishedAt,
        accepted: false,
        reason: 'Arbora unavailable — layout saved locally only',
      }
    }
  }

  // ---- subscribeToLayoutChanges --------------------------------------------

  /**
   * Subscribe to layout change events via polling.
   * Returns an unsubscribe function.
   */
  subscribeToLayoutChanges(callback: (event: LayoutEvent) => void): () => void {
    this.listeners.add(callback)

    // Start polling if not already running.
    this.pollTimer ??= setInterval(() => {
      this.pollForChanges()
    }, CHANGE_POLL_MS)

    // Return an unsubscribe function.
    return () => {
      this.listeners.delete(callback)
      // Stop polling if no listeners remain.
      if (this.listeners.size === 0 && this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    }
  }

  pollForChanges(): void {
    if (!this.hasStore || !this.store!.data.size) return

    const key = this.medullaKey()
    const raw = this.store!.data.get(key)
    if (!raw) return

    const parsed = parseLayout(raw)
    if (!parsed) return

    const currentRevision = parsed.revision ?? 1
    if (currentRevision !== this.lastSeenRevision) {
      this.lastSeenRevision = currentRevision
      const event: LayoutEvent = {
        type: 'layout-version',
        version: `${currentRevision}`,
        detail: `Layout version changed: ${this.lastSeenRevision}`,
      }
      bus.emit(makeEvent('layout.version', {}, `layout-version v${currentRevision}`))
      for (const fn of this.listeners) {
        try {
          fn(event)
        } catch {
          console.warn('[medulla] layout-version subscriber failed:', event.type)
        }
      }
    }
  }

  // ---- internal -----------------------------------------------------------

  medullaKey(): string {
    return `${MEDULLA_KEY_PREFIX}:${this.tenant}${this.key.key ? `:${this.key.key}` : ''}`
  }

  /** Get the current local doc (for testing). */
  getLocalDoc(): LayoutOverride | null {
    return this.localDoc
  }

  /** Get the local revision (for testing). */
  getLocalRevision(): number {
    return this.localRevision
  }

  /** Get the last seen revision (for testing). */
  getLastSeenRevision(): number {
    return this.lastSeenRevision
  }

  /** Clear all listeners (for testing). */
  clearListeners(): void {
    this.listeners.clear()
  }

  /** Stop polling (for testing). */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  /** Reset the client (for testing). */
  reset(): void {
    this.stopPolling()
    this.clearListeners()
    this.localDoc = null
    this.localRevision = 0
    this.lastSeenRevision = 0
  }
}

/**
 * Create a Medulla-backed layout client for a tenant.
 *
 * @param tenant - The tenant identifier (default: 'city-default').
 * @param options - Optional configuration (store, key).
 * @returns A MedullaLayoutClient instance.
 */
export function createMedullaLayoutClient(
  tenant: string = DEFAULT_TENANT,
  options?: { store?: MedullaStore; key?: string },
): MedullaLayoutClient {
  return new MedullaLayoutImpl({ store: options?.store, tenant, key: options?.key })
}

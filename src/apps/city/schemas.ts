/**
 * @file schemas.ts
 * @description Zod schemas for every City host response (`/api/apps/city/*`)
 * and the pinned-asset lockfile. The host answers the strict normalized fleet
 * shape (OVERSTORY-CITY-R003/R017); the browser never sees anything else.
 */
// spec: OVERSTORY-CITY-R003, OVERSTORY-CITY-R017, OVERSTORY-CITY-R021, OVERSTORY-CITY-R032
import { z } from 'zod'

export const PACK_STATUSES = ['served', 'registered_unpublished'] as const

export const fleetServerSchema = z.object({
  server: z.string().min(1).max(200),
  toolCount: z.number().int().nonnegative(),
  tools: z.array(z.string().min(1).max(200)).max(12),
  packStatus: z.enum(PACK_STATUSES),
})

export const cityFleetSchema = z.object({
  servers: z.array(fleetServerSchema),
  captured_at: z.string().min(1),
  cache: z.object({
    stale: z.boolean(),
    age_seconds: z.number().nonnegative(),
  }),
})

export const cityStatusSchema = z.object({
  status: z.literal('ok'),
  arbora: z.object({
    reachable: z.boolean(),
  }),
  connectors: z.object({
    served: z.number().int().nonnegative(),
    registered: z.number().int().nonnegative(),
  }),
})

// ---- The layout override document (R032) --------------------------------------
/** Quarter-turn rotations the layout edit accepts. */
export const LAYOUT_ROTATIONS = [0, 90, 180, 270] as const
/** The district archetypes the layout edit accepts (the generator's vocabulary). */
export const LAYOUT_ARCHETYPES = ['gateway', 'datahall', 'workshop', 'storehouse', 'studio', 'docks'] as const

/**
 * The stored layout override document (R032): the final-state delta over the
 * derived layout — building moves and rotations, road segments added or
 * removed, district styles. The browser-side twin of the host's strict
 * whitelist; both refuse anything outside these bounds.
 */
export const layoutDocSchema = z.object({
  version: z.literal(1),
  moves: z
    .array(
      z.object({
        buildingId: z.string().min(1).max(200),
        plot: z.number().int().min(0).max(1023),
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      }),
    )
    .max(200),
  roads: z
    .array(
      z.object({
        kind: z.enum(['add', 'remove']),
        segmentId: z.string().min(1).max(200),
        from: z.string().min(1).max(200).optional(),
        to: z.string().min(1).max(200).optional(),
      }),
    )
    .max(400),
  styles: z
    .array(
      z.object({
        domain: z.string().min(1).max(50),
        archetype: z.enum(LAYOUT_ARCHETYPES),
      }),
    )
    .max(20),
})

/** The served layout read (GET /layout): the stored doc with its capture stamp. */
export const cityLayoutSchema = z.object({
  doc: layoutDocSchema,
  captured_at: z.string().min(1),
  cache: z.object({
    stale: z.boolean(),
    age_seconds: z.number().nonnegative(),
  }),
})

/** The served layout write ack (PUT /layout): the stored doc after the write. */
export const layoutSavedSchema = z.object({
  doc: layoutDocSchema,
  captured_at: z.string().min(1),
})

export type LayoutDoc = z.infer<typeof layoutDocSchema>
export type CityLayout = z.infer<typeof cityLayoutSchema>
export type LayoutSaved = z.infer<typeof layoutSavedSchema>

// ---- Medulla-backed layout (R021) ------------------------------------------

/**
 * A Medulla-persisted layout document with version tracking, deterministic
 * serialization fields and world-level metadata. The browser-side twin of
 * the host's layout document — same bounds, same version.
 */
export const medullaLayoutDocSchema = z.object({
  version: z.number().int().positive(),
  seed: z.string().optional(),
  buildings: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        x: z.number(),
        z: z.number(),
        rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
        plot: z.number().int().min(0).max(1023),
        door: z.object({ x: z.number(), z: z.number() }).nullable().optional(),
      }),
    )
    .max(500),
  roads: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        from: z.string().min(1).max(200),
        to: z.string().min(1).max(200),
        x1: z.number().optional(),
        z1: z.number().optional(),
        x2: z.number().optional(),
        z2: z.number().optional(),
      }),
    )
    .max(1000),
  styles: z.record(z.string().min(1).max(50), z.enum(LAYOUT_ARCHETYPES)),
  captured_at: z.string().min(1),
  /** Monotonically increasing revision number (R021). */
  revision: z.number().int().positive(),
})

/**
 * A published layout — the layout document plus the Arbora-world metadata
 * that turns a local save into a world-change event (R021).
 */
export const publishedLayoutSchema = z.object({
  doc: layoutDocSchema,
  worldKey: z.string().min(1),
  version: z.string().min(1),
  publishedAt: z.string().min(1),
  accepted: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
})

/** A layout change event fired by the Medulla client (R021). */
export const layoutEventSchema = z.object({
  type: z.enum(['layout-save', 'layout-published', 'layout-version']),
  version: z.string().min(1),
  detail: z.string().max(500).optional(),
})

/** A Medulla layout key (tenant-scoped KV). */
export const medullaLayoutKeySchema = z.object({
  tenant: z.string().min(1),
  key: z.string().min(1).optional(),
})

/** A Medulla layout document (with world-level metadata). */
export type MedullaLayoutDoc = z.infer<typeof medullaLayoutDocSchema>
/** A published layout (with Arbora-world metadata, R021). */
export type PublishedLayoutIn = z.infer<typeof publishedLayoutSchema>
/** A layout change event (R021). */
export type LayoutEvent = z.infer<typeof layoutEventSchema>
/** A Medulla layout key (R021). */
export type MedullaLayoutKey = z.infer<typeof medullaLayoutKeySchema>

export const assetsLockPinSchema = z.object({
  source_path: z.string().min(1),
  sha256: z.string().length(64),
  bytes: z.number().int().positive(),
  /** The asset's own license — the generator model's terms, for generated assets. */
  license: z.string().min(1),
})

export const assetsLockSchema = z.object({
  files: z.record(z.string(), assetsLockPinSchema),
  /**
   * The license allowlist (R013 amendment): licensing is a gate, not a note —
   * startup verification refuses any pin whose license is outside this list.
   */
  license_allowlist: z.array(z.string().min(1)).min(1),
})

/** One kit family in the versioned catalog (catalog.json, R048.1/R063). */
export const catalogEntrySchema = z.object({
  file: z.string().min(1),
  id: z.string().min(1),
  source: z.string().min(1),
})

/** The runtime fields of catalog.json the provenance registry consumes. */
export const catalogSchema = z.object({
  entries: z.array(catalogEntrySchema),
})

export type FleetServer = z.infer<typeof fleetServerSchema>
export type CityFleet = z.infer<typeof cityFleetSchema>
export type CityStatus = z.infer<typeof cityStatusSchema>
export type AssetsLockPin = z.infer<typeof assetsLockPinSchema>
export type AssetsLock = z.infer<typeof assetsLockSchema>
export type CatalogEntry = z.infer<typeof catalogEntrySchema>
export type Catalog = z.infer<typeof catalogSchema>

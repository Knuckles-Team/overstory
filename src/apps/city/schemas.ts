/**
 * @file schemas.ts
 * @description Zod schemas for every City host response (`/api/apps/city/*`)
 * and the pinned-asset lockfile. The host answers the strict normalized fleet
 * shape (OVERSTORY-CITY-R003/R017); the browser never sees anything else.
 */
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

export type FleetServer = z.infer<typeof fleetServerSchema>
export type CityFleet = z.infer<typeof cityFleetSchema>
export type CityStatus = z.infer<typeof cityStatusSchema>
export type AssetsLockPin = z.infer<typeof assetsLockPinSchema>
export type AssetsLock = z.infer<typeof assetsLockSchema>

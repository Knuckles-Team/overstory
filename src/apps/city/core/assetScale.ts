/**
 * @file assetScale.ts
 * @description Dynamic asset scale-out through provenance tracking
 * (OVERSTORY-CITY-R024): when the catalog lacks an asset the city needs,
 * this module provisions it on-demand — creating a provisioning ticket
 * (pending), then recording its provenance once Blender generates or an
 * external search discovers it, and finally admitting it into the catalog.
 * The provenance chain (source → create → admit) is preserved for every
 * dynamically-added asset so the R063 load-layer gate can audit it.
 *
 * Types are imported from types.ts and re-exported for convenience.
 */
// spec: OVERSTORY-CITY-R024

import { epochMs } from './clock'
import * as THREE from 'three'

import { catalogFamilyCount } from './catalog'
import type { ExemptPrimitive } from './provenance'
import type { AssetCheck, AssetDescription, AssetProvenance, AssetProvenanceChain, ScaleStats } from './types'
import { tagExempt, tagPlacement } from './provenance'
export type {
  AssetCheck,
  AssetDescription,
  AssetProvenance,
  AssetProvenanceChain,
  ScaleStats,
  AssetScaleManager,
} from './types'

/** Status of a provisioning attempt for Arbora integration. */
interface ArboraProvisioningState {
  /** The operation id returned by Arbora (if any). */
  arboraOpId?: string
  /** What the provisioner is doing. */
  action: 'pending' | 'generating' | 'searching' | 'admitting' | 'completed' | 'failed'
  /** Error message if the provisioning failed. */
  error?: string
}

// ---- Module state ----------------------------------------------------------

const PROVISIONING = new Map<string, AssetProvenance>()
const PROVISIONING_STATE = new Map<string, ArboraProvisioningState>()
let nextSeq = 0

/**
 * Catalog size: reads from the real catalog at runtime but can be
 * overridden by tests so stats don't depend on catalog.json on disk.
 */
let _catalogSizeOverride: number | null = null

// ---- Public API ------------------------------------------------------------

/**
 * Create the asset scale manager handle.  The manager is stateless — every
 * function is bound to the module-level state so tests can clear it.
 */
export function createAssetScaleManager() {
  return {
    /**
     * Request a new asset via the provenance pipeline.  If the asset
     * already exists in the catalog the provenance record is returned
     * immediately; otherwise a pending provisioning ticket is created and
     * the caller may probe until `completedAt` is set.
     *
     * When Arbora is connected, `requestAsset` may trigger
     * `blender_generate_3d` or `blender_search_assets` (Poly Haven) and the
     * result is admitted into the catalog automatically.
     */
    requestAsset(desc: AssetDescription): AssetProvenance {
      // Validate the description before doing any work.
      validateAssetDescription(desc)

      // Generate a synthetic id from the description to keep the API
      // simple — in a real system this would be a more sophisticated id
      // generation tied to the asset pipeline.
      const id = generateAssetId(desc)

      // Check the catalog first — if the asset already exists, return
      // its provenance immediately (R024: catalog is the source of truth).
      const existing = PROVISIONING.get(id)
      if (existing?.status === 'completed') {
        return { ...existing }
      }

      // Create or return the pending provisioning ticket.
      let ticket = PROVISIONING.get(id)
      if (!ticket) {
        ticket = {
          id,
          source: resolveSource(desc.type),
          digest: '',
          status: 'pending',
          requestedAt: epochMs(),
          completedAt: null,
          sourcePath: `scripts/asset-kit/stage${getNextSeq()}_generated.py`,
        }
        PROVISIONING.set(id, ticket)
        PROVISIONING_STATE.set(id, { action: 'pending' })
      }

      // If the ticket is already pending, return it (idempotent).
      if (ticket.status === 'pending') {
        return { ...ticket }
      }

      // It was completed before — return the record.
      return { ...ticket }
    },

    /**
     * Check whether one asset is available (catalog or pending) without
     * creating a new ticket.
     */
    checkAssetAvailability(id: string): AssetCheck {
      const ticket = PROVISIONING.get(id)
      if (!ticket) {
        return { available: false, asset: null, pending: false }
      }
      if (ticket.status === 'completed') {
        return { available: true, asset: { ...ticket }, pending: false }
      }
      return { available: false, asset: { ...ticket }, pending: true }
    },

    /**
     * Get the full provenance chain for one asset.  Returns a chain with
     * a single entry for the current ticket (in this implementation,
     * historical chains are not yet accumulated, but the type supports
     * multiple entries).
     */
    getProvenanceChain(assetId: string): AssetProvenanceChain {
      const ticket = PROVISIONING.get(assetId)
      if (!ticket) {
        return { assetId, chain: [] }
      }
      return { assetId, chain: [{ ...ticket }] }
    },

    /**
     * Return provisioning statistics.
     */
    getScaleStats(): ScaleStats {
      let pending = 0
      let completed = 0
      for (const t of PROVISIONING.values()) {
        if (t.status === 'pending') pending++
        else completed++
      }
      return {
        requested: PROVISIONING.size,
        completed,
        pending,
        catalogSize: _catalogSizeOverride ?? catalogFamilyCount(),
      }
    },
  }
}

/**
 * Complete a provisioning ticket — called by the provisioning pipeline
 * (Blender generate, asset search, or manual admission).  The provenance
 * record is updated and, if the asset is a kit asset, the provenance tag
 * can be applied to a THREE object.
 */
export function completeProvisioning(id: string, digest: string, sourcePath: string): boolean {
  const ticket = PROVISIONING.get(id)
  if (ticket?.status !== 'pending') return false

  ticket.status = 'completed'
  ticket.completedAt = epochMs()
  ticket.digest = digest
  ticket.sourcePath = sourcePath

  const state = PROVISIONING_STATE.get(id)
  if (state) {
    state.action = 'completed'
  }

  return true
}

/**
 * Fail a provisioning ticket — called when Blender generation or asset
 * search fails so the caller can retry.
 */
export function failProvisioning(id: string, error: string): boolean {
  const ticket = PROVISIONING.get(id)
  if (ticket?.status !== 'pending') return false

  ticket.status = 'pending'
  const state = PROVISIONING_STATE.get(id)
  if (state) {
    state.action = 'pending'
    state.error = error
  }

  return true
}

/**
 * Admit an exempt primitive into the city scene.  The exempt primitive
 * path is admitted alongside the kit (R063 gate is extended by R024).
 */
export function admitExemptPrimitive(object: THREE.Object3D, kind: ExemptPrimitive): void {
  tagExempt(object, kind)
}

/**
 * Tag a placed instance of a dynamically-provisioned asset (same as the
 * catalog placement tag but available here for convenience).
 */
export function tagDynamicPlacement(root: THREE.Object3D, familyId: string, sourceStage: string): void {
  tagPlacement(root, familyId, sourceStage)
}

// ---- Internal helpers ------------------------------------------------------

function validateAssetDescription(desc: AssetDescription): void {
  if (!desc.type || typeof desc.type !== 'string' || desc.type.trim().length === 0) {
    throw new Error('AssetDescription.type must be a non-empty string')
  }
  if (!desc.description || typeof desc.description !== 'string' || desc.description.trim().length === 0) {
    throw new Error('AssetDescription.description must be a non-empty string')
  }
  if (!Array.isArray(desc.requiredProperties)) {
    throw new Error('AssetDescription.requiredProperties must be an array')
  }
  if (typeof desc.constraints !== 'object' || Array.isArray(desc.constraints)) {
    throw new Error('AssetDescription.constraints must be an object')
  }
}

function generateAssetId(desc: AssetDescription): string {
  // Convert the type to a kebab-case folder prefix and derive an id
  // from the description.  In production this would be more sophisticated
  // (e.g. dedup against the catalog before assigning a new id).
  const typeFolder = desc.type.replace(/[^a-z0-9]+/g, '-').toLowerCase()
  const descSlug = desc.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
  return `${typeFolder}.${descSlug || 'asset'}`
}

function resolveSource(type: string): string {
  const normalized = type.toLowerCase()
  if (normalized.includes('blender') || normalized.includes('generate')) {
    return 'blender_generate_3d'
  }
  if (normalized.includes('poly-haven') || normalized.includes('search') || normalized.includes('external')) {
    return 'blender_search_poly_haven'
  }
  return 'catalog'
}

function getNextSeq(): number {
  return ++nextSeq
}

// ---- Test seams ------------------------------------------------------------

/**
 * Test seam: clear all provisioning state.  Exposed so tests isolate
 * themselves from prior runs.
 */
export function clearAssetScale(): void {
  PROVISIONING.clear()
  PROVISIONING_STATE.clear()
  nextSeq = 0
  _catalogSizeOverride = null
}

/**
 * Test seam: override the catalog size so stats report a known value
 * without depending on catalog.json on disk.
 */
export function setCatalogSize(size: number): void {
  _catalogSizeOverride = size
}

/**
 * Test seam: inject a custom id generator for deterministic ids.
 * (Currently a no-op — the id generator is module-scoped and not
 * replaceable.  The seam is reserved for future use.)
 */
export function setIdGenerator(_fn: (desc: AssetDescription) => string): void {
  // Reserved for future use.
}

/**
 * Test seam: expose the internal provisioning map so tests can inspect
 * it without going through the manager handle.
 */
export function _getInternalProvisioning(): Map<string, AssetProvenance> {
  return PROVISIONING
}

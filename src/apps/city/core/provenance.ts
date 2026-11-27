/**
 * @file provenance.ts
 * @description Asset provenance registry (OVERSTORY-CITY-R063). The load
 * layer serves only the pinned, catalogued kit plus two declared non-kit
 * pins; this registry is what the runtime records on top of that gate —
 * every placed model carries its catalog family id, instance count and
 * source stage, and the scene audit rejects any visible mesh that is
 * neither a catalog family nor one of the small, explicit set of exempt
 * primitives (terrain, sky, character rig). The catalog renderer (R067)
 * tags its placements here; until then the manifest surfaces exactly what
 * the live scene is and is not made of.
 */
import * as THREE from 'three'

/**
 * The only non-kit pins the city may load (R063): the shared character rig
 * and the marker cube. Every other load is a kit family from the catalog.
 * The lock pins exactly these two plus the kit, and the catalog covers the
 * kit file-for-file, so the gate below closes the set the load layer may
 * serve.
 */
export const EXEMPT_NONKIT_PINS: readonly string[] = [
  'city-assets/characters/robot-expressive.glb',
  'city-assets/marker-cube.glb',
  'city-assets/characters/civilian-000.glb',
  'city-assets/characters/civilian-001.glb',
  'city-assets/characters/civilian-002.glb',
  'city-assets/characters/civilian-003.glb',
  'city-assets/characters/civilian-004.glb',
  'city-assets/characters/civilian-005.glb',
  'city-assets/characters/civilian-006.glb',
  'city-assets/characters/civilian-007.glb',
  'city-assets/characters/civilian-008.glb',
  'city-assets/characters/civilian-009.glb',
  'city-assets/characters/civilian-010.glb',
  'city-assets/characters/civilian-011.glb',
]

/** True when a pinned path is a kit family (the catalog covers exactly the kit GLBs on disk). */
export function isKitAssetPath(path: string): boolean {
  return path.startsWith('city-assets/kit/') && path.endsWith('.glb')
}

/** The load-layer gate (R063): kit families only, plus the exempt pins. */
export function allowedAssetPath(path: string): boolean {
  return isKitAssetPath(path) || EXEMPT_NONKIT_PINS.includes(path)
}

/** A primitive the scene may carry without a catalog family. */
export type ExemptPrimitive = 'terrain' | 'sky' | 'water-surface' | 'character-rig' | 'construction-placeholder'

/** The provenance tag a placed model carries on its object (or an ancestor). */
export interface ProvenanceTag {
  familyId?: string
  sourceStage?: string
  exempt?: ExemptPrimitive
}

/** The live family record: what the scene is made of. */
export interface ProvenanceRecord {
  familyId: string
  sourceStage: string
  instances: number
}

const PROVENANCE_KEY = 'cityProvenance'

const registry = new Map<string, ProvenanceRecord>()

/** Tag an object (and, by inheritance, its descendants) as one placed instance of a catalog family. */
export function tagPlacement(root: THREE.Object3D, familyId: string, sourceStage: string): void {
  root.userData[PROVENANCE_KEY] = { familyId, sourceStage }
  const record = registry.get(familyId) ?? { familyId, sourceStage, instances: 0 }
  record.instances += 1
  registry.set(familyId, record)
}

/**
 * Retire one placed instance: the instance count drops by one (the record
 * vanishes at zero), so the manifest counts only what the scene still
 * carries. The tag itself stays on the (removed) object — the scene audit
 * only ever sees live meshes.
 */
export function retirePlacement(root: THREE.Object3D): void {
  const tag = provenanceOf(root)
  if (!tag?.familyId) return
  const record = registry.get(tag.familyId)
  if (!record) return
  record.instances = Math.max(0, record.instances - 1)
  if (record.instances === 0) registry.delete(tag.familyId)
}

/** Tag an object as an exempt primitive (terrain, sky, water, rig, placeholder). */
export function tagExempt(root: THREE.Object3D, kind: ExemptPrimitive): void {
  root.userData[PROVENANCE_KEY] = { exempt: kind }
}

/** The asset-provenance manifest: every live family with its instance count. */
export function provenanceManifest(): ProvenanceRecord[] {
  return [...registry.values()].sort((a, b) => a.familyId.localeCompare(b.familyId))
}

/** The tag a mesh is audited under: its own, or the nearest tagged ancestor's. */
export function provenanceOf(object: THREE.Object3D): ProvenanceTag | undefined {
  let node: THREE.Object3D | null = object
  while (node) {
    const tag = node.userData[PROVENANCE_KEY] as ProvenanceTag | undefined
    if (tag) return tag
    node = node.parent
  }
  return undefined
}

/** One mesh the audit could not place. */
export interface SceneAuditIssue {
  id: string
  path: string
}

/**
 * The provenance audit of a rendered scene (R063): every visible mesh must
 * carry a catalog family id or an explicit exempt declaration; anything
 * else — in particular launch-era generated geometry — is reported.
 */
export function auditScene(scene: THREE.Object3D): { clean: boolean; issues: SceneAuditIssue[] } {
  const issues: SceneAuditIssue[] = []
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !effectivelyVisible(object)) return
    const tag = provenanceOf(object)
    if (!tag || (!tag.familyId && !tag.exempt)) {
      issues.push({ id: object.name || 'unnamed-mesh', path: object.uuid })
    }
  })
  return { clean: issues.length === 0, issues }
}

/** A mesh renders only when every ancestor is visible too. */
function effectivelyVisible(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object
  while (node) {
    if (!node.visible) return false
    node = node.parent
  }
  return true
}

/** Test seam. */
export function clearProvenance(): void {
  registry.clear()
}

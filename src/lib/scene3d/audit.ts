/**
 * @file audit.ts
 * @description The 3D fidelity audits (OVERSTORY-DESIGN-R012.2 / R012.3):
 * the material audit walks the live scene graph and finds every mesh outside
 * the declared marker allowlist that lacks an authored physically based
 * material (a texture set or the shared trim sheet); the density audit walks
 * the dressed layout and finds empty plots and blocks below the declared
 * street-furniture density. Both are pure functions over the scene graph and
 * the layout data, so they run on the real city scene without a renderer.
 */
import * as THREE from 'three'

/** One material-audit violation: a non-marker surface without authored PBR. */
export interface MaterialViolation {
  /** The object path in the scene graph (for the report). */
  objectPath: string
  /** Why the surface fails R012.2. */
  reason: 'untextured' | 'non-pbr-material'
}

export interface MaterialAuditResult {
  /** Every renderable surface walked. */
  surfaceCount: number
  /** Surfaces exempted as declared markers. */
  markerCount: number
  /** The violations, empty when the scene meets R012.2. */
  violations: MaterialViolation[]
  /** True when no violation was found (the bound test's bar). */
  ok: boolean
}

export interface MaterialAuditOptions {
  /**
   * The marker allowlist (R012.2): a surface is exempt from the PBR bar when
   * the predicate says it is a declared marker (selection, debug, UI gizmo).
   * The city declares its markers through `userData.marker`.
   */
  isMarker?: (object: THREE.Object3D) => boolean
}

function objectPath(object: THREE.Object3D, scene: THREE.Scene): string {
  const parts: string[] = []
  let node: THREE.Object3D | null = object
  while (node) {
    parts.unshift(node.name || node.constructor.name)
    node = node === scene ? null : node.parent
  }
  return parts.join('/')
}

/**
 * Walk the live scene graph and audit every visible surface against R012.2:
 * a visible mesh or sprite must carry an authored physically based material
 * — a standard/physical material with a base-colour map (a texture set or
 * the shared trim sheet). Single-colour untextured surfaces are allowed only
 * for declared markers.
 */
export function materialAudit(scene: THREE.Scene, opts: MaterialAuditOptions = {}): MaterialAuditResult {
  const isMarker = opts.isMarker ?? (() => false)
  const violations: MaterialViolation[] = []
  let surfaceCount = 0
  let markerCount = 0

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      surfaceCount++
      if (isMarker(object)) {
        markerCount++
        return
      }
      const materials =
        object instanceof THREE.Mesh && Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
          if (material instanceof THREE.SpriteMaterial) {
            // Sprite labels are screen-space UI, not lit surfaces; they are
            // exempt when they carry their own texture (the label plate).
            if (material.map) return
          }
          violations.push({ objectPath: objectPath(object, scene), reason: 'non-pbr-material' })
          return
        }
        if (!material.map) {
          violations.push({ objectPath: objectPath(object, scene), reason: 'untextured' })
          return
        }
      }
    }
  })

  return { surfaceCount, markerCount, violations, ok: violations.length === 0 }
}

/** One plot's dressed content for the density audit (R012.3). */
export interface DressedPlot {
  /** Stable plot id. */
  id: string
  /** The content the plot carries — 'empty' when it was left undressed. */
  content: 'building' | 'construction' | 'park' | 'plaza' | 'lot' | 'water' | 'empty'
  /** Street-edge furniture on this plot's block edges (lights, trees, benches, signs, bins). */
  edgeFurniture: number
}

export interface DensityBlock {
  /** Stable block id (a city block is the unit the density is declared per). */
  id: string
  /** The declared minimum street-edge furniture per block. */
  minEdgeFurniture: number
  /** The plots that make up the block. */
  plots: DressedPlot[]
}

export interface DensityAuditResult {
  /** Plots with no content — R012.3's "no dead space" bar. */
  emptyPlots: string[]
  /** Blocks below the declared furniture density. */
  sparseBlocks: { block: string; furniture: number; min: number }[]
  /** True when no plot is empty and every block meets its density. */
  ok: boolean
}

/**
 * Audit the dressed layout against R012.3: every visible area carries
 * purposeful content and every block meets the declared street-edge
 * furniture density. The audit takes the layout data the renderer derives
 * from the world state — the same numbers the scene actually renders.
 */
export function densityAudit(blocks: DensityBlock[]): DensityAuditResult {
  const emptyPlots: string[] = []
  const sparseBlocks: { block: string; furniture: number; min: number }[] = []
  for (const block of blocks) {
    let furniture = 0
    for (const plot of block.plots) {
      if (plot.content === 'empty') {
        emptyPlots.push(plot.id)
      } else {
        furniture += plot.edgeFurniture
      }
    }
    if (furniture < block.minEdgeFurniture) {
      sparseBlocks.push({ block: block.id, furniture, min: block.minEdgeFurniture })
    }
  }
  return { emptyPlots, sparseBlocks, ok: emptyPlots.length === 0 && sparseBlocks.length === 0 }
}

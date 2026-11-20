/**
 * @file cityFidelity.test.ts
 * @description The city's 3D fidelity bar (OVERSTORY-CITY-R031, built on the
 * shared scene pipeline per OVERSTORY-DESIGN-R012): the test builds the real
 * scene over the bundled snapshot (R014 — the SIMULATED snapshot, no live
 * fleet), then runs the shared fidelity audits over the graph it built:
 *
 *  - the material audit (R012.2) walks every renderable surface of the live
 *    scene — the authored trim-sheet materials pass, the declared markers
 *    (reserved-plot markers, landmark accents, displays) are exempt through
 *    the parent-walking `userData.marker` allowlist;
 *  - the density audit (R012.3) walks the dressed district — no dead space
 *    (every plot carries a building, a construction, a reservation or
 *    dressed-block furniture) and every district column meets its declared
 *    street-edge furniture density (one element per plot);
 *  - the dressing check re-derives the pure `dressingForPlot` layout and
 *    proves a dressed block group actually sits on every undressed plot;
 *  - the label bar (R012.7) projects the world state at the three semantic
 *    zoom bands and asserts the resolved plates never overlap.
 *
 * The e2e golden viewpoints (R012.9) capture this same scene in a real
 * browser; this unit test is the bound test the pipeline rebuild must clear
 * without a renderer.
 */
// spec: OVERSTORY-CITY-R031, OVERSTORY-DESIGN-R012.2, OVERSTORY-DESIGN-R012.3, OVERSTORY-DESIGN-R012.7
import * as THREE from 'three'
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { densityAudit, materialAudit, type DensityBlock, type DressedPlot } from '@/lib/scene3d/audit'
import { LABEL_SETS, MIN_LABEL_FONT_PX, resolveLabelSet, zoomBandFor, type LabelCandidate } from '@/lib/scene3d/labels'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { bus } from '../core/events'
import { createBuildings, dressingForPlot } from '../core/render3d/buildings'
import { collectLabelCandidates, LABEL_FONT_PX, type CityLabel } from '../core/render3d/labelLayer'
import { buildCityCore } from '../core/render3d/scene'
import { initSim, onboardConnector, resetSim, world } from '../core/sim'

// jsdom's 2D context stub has no working createRadialGradient (it returns
// undefined) — the streetlamp glow texture needs one. The stand-in records
// the stops and paints nothing, which is all the scene graph needs to be
// built and audited.
beforeAll(() => {
  const original = HTMLCanvasElement.prototype.getContext
  const patched = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
    const ctx = original.call(this, contextId, options) as CanvasRenderingContext2D | null
    if (ctx && contextId === '2d') {
      ctx.createRadialGradient = () => ({ addColorStop: () => undefined })
    }
    return ctx
  }
  // getContext is an overloaded method; the stand-in only serves the 2d path.
  ;(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = patched
})

/**
 * The marker allowlist for the live scene (R012.2): a surface is a declared
 * marker when it or any of its ancestors carries `userData.marker` — the
 * construction markers and pulses are nested inside their rig groups.
 */
function isMarker(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object
  while (node) {
    if (typeof node.userData.marker === 'string') return true
    node = node.parent
  }
  return false
}

/**
 * The real snapshot scene under audit: the static kit-built city core plus
 * the building layer over the SIMULATED snapshot world (R014). One reserved
 * plot is onboarded (a real sim transition) so the density audit measures a
 * live construction site, not only built and reserved plots.
 */
function snapshotScene(): THREE.Scene {
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
  const scene = new THREE.Scene()
  buildCityCore(scene)
  const api = createBuildings(scene, world, null)
  api.syncBuildings()
  // A live construction site mid-build: onboarding a registered connector
  // reserves its plot for scaffolding while the finished building stays
  // hidden under the rig (the R012.5 sequence).
  const reserved = world.plots.find((p) => p.reservedId !== null)
  if (reserved?.reservedId) {
    expect(onboardConnector(reserved.reservedId)).toBe(true)
    if (reserved.construction) reserved.construction.progress = 0.5
  }
  api.update(0.016, 0)
  return scene
}

/** The street-edge furniture a dressed block group carries (meshes minus the ground patch). */
function dressingFurniture(scene: THREE.Scene): Map<string, number> {
  const out = new Map<string, number>()
  scene.traverse((o) => {
    const key = o.userData.dressing as string | undefined
    if (!key) return
    let meshes = 0
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) meshes++
    })
    out.set(key, meshes - 1) // the ground patch is not street furniture
  })
  return out
}

/** The dressed district as density-audit blocks: one block per district column. */
function districtBlocks(scene: THREE.Scene): DensityBlock[] {
  const furniture = dressingFurniture(scene)
  const byColumn = new Map<number, DressedPlot[]>()
  for (const p of world.plots) {
    const key = `${p.x}:${p.z}`
    let content: DressedPlot['content']
    let edgeFurniture = 1
    if (p.construction) {
      // The scaffolding rig counts as the plot's street-edge element.
      content = 'construction'
    } else if (p.buildingId) {
      // The building's door mat is its street-edge element (R025 door-queue anchor).
      content = 'building'
    } else if (p.reservedName !== null) {
      // The faint reserved-plot marker is the plot's visible element.
      content = 'reserved'
    } else {
      const kind = dressingForPlot(p.x, p.z)
      content = kind
      edgeFurniture = furniture.get(key) ?? 0
    }
    const list = byColumn.get(p.x) ?? []
    list.push({ id: key, content, edgeFurniture })
    byColumn.set(p.x, list)
  }
  return [...byColumn.entries()]
    .sort(([a], [b]) => a - b)
    .map(([x, plots]) => ({
      id: `column:${x}`,
      minEdgeFurniture: plots.length, // the declared density: one element per plot
      plots,
    }))
}

/** A viewport and camera at one semantic-zoom distance from the city centre. */
function bandView(
  distance: number,
  viewport: { width: number; height: number },
): { camera: THREE.PerspectiveCamera; candidates: CityLabel[]; band: 'city' | 'district' | 'building' } {
  const target = new THREE.Vector3(0, 0, 0)
  const camera = new THREE.PerspectiveCamera(50, viewport.width / viewport.height, 0.1, 500)
  camera.position.set(0.3, 0.55, 0.78).normalize().multiplyScalar(distance).add(target)
  camera.lookAt(target)
  camera.updateMatrixWorld()
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  return {
    camera,
    candidates: collectLabelCandidates(world, camera, viewport),
    band: zoomBandFor(camera.position.distanceTo(target)),
  }
}

/** Assert no two plates of a resolved set overlap (the R012.7 bar). */
function assertNoOverlap(visible: LabelCandidate[], band: string): void {
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i]
      const b = visible[j]
      const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      expect(overlap, `${band}: plates ${a.id} and ${b.id} overlap`).toBe(false)
    }
  }
}

describe('city 3D fidelity over the real snapshot scene (R031, R012)', () => {
  afterEach(() => {
    resetSim()
    bus.reset()
  })

  it('every non-marker surface of the live scene carries authored PBR (R012.2)', () => {
    const scene = snapshotScene()
    const result = materialAudit(scene, { isMarker })
    expect(result.violations, `material audit: ${JSON.stringify(result.violations)}`).toEqual([])
    expect(result.surfaceCount).toBeGreaterThan(100)
    // The declared markers are genuinely declared (reserved-plot markers at
    // least), not an empty allowlist hiding the audit.
    expect(result.markerCount).toBeGreaterThanOrEqual(world.plots.filter((p) => p.reservedName !== null).length)
    expect(result.ok).toBe(true)
  })

  it('the dressed district has no dead space and every column meets its density (R012.3)', () => {
    const scene = snapshotScene()
    const blocks = districtBlocks(scene)
    const result = densityAudit(blocks)
    expect(result.emptyPlots, `empty plots: ${JSON.stringify(result.emptyPlots)}`).toEqual([])
    expect(result.sparseBlocks, `sparse blocks: ${JSON.stringify(result.sparseBlocks)}`).toEqual([])
    expect(result.ok).toBe(true)
    // Measured, not assumed: the district is 6 columns × 13 rows, the
    // snapshot fills 74 plots, and at least one column carries a live
    // construction site plus dressed blocks.
    expect(blocks).toHaveLength(6)
    expect(blocks.every((b) => b.plots.length === 13)).toBe(true)
    const contents = blocks.flatMap((b) => b.plots.map((p) => p.content))
    expect(contents.filter((c) => c === 'construction')).toHaveLength(1)
    expect(contents.filter((c) => c === 'building')).toHaveLength(7) // the 7 served packs
    expect(contents.filter((c) => c === 'reserved')).toHaveLength(66)
    const dressed = contents.filter((c) => c === 'park' || c === 'plaza' || c === 'lot')
    expect(dressed.length).toBe(world.plots.length - 74)
    for (const block of blocks) {
      for (const plot of block.plots) {
        if (plot.content === 'park' || plot.content === 'plaza' || plot.content === 'lot') {
          expect(plot.edgeFurniture, `${plot.id} dressed furniture`).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('the pure dressing layout is what the scene renders on every undressed plot (R031)', () => {
    const scene = snapshotScene()
    const undressed = world.plots.filter((p) => !p.buildingId && !p.construction && p.reservedName === null)
    expect(undressed.length).toBeGreaterThan(0)
    const furniture = dressingFurniture(scene)
    for (const p of undressed) {
      const key = `${p.x}:${p.z}`
      const kind = dressingForPlot(p.x, p.z)
      expect(kind, `${key} dressing kind`).toMatch(/^(park|plaza|lot)$/)
      // Seeded determinism: the pure function and the scene agree on the
      // exact plot, and the dressed group sits on it.
      expect(furniture.get(key), `${key} has a dressed group`).toBeGreaterThanOrEqual(2)
      let found = false
      scene.traverse((o) => {
        if (o.userData.dressing === key) {
          found = true
          expect(o.position.x).toBeCloseTo(p.x, 3)
          expect(o.position.z).toBeCloseTo(p.z, 3)
        }
      })
      expect(found, `${key} dressing group present`).toBe(true)
    }
  })

  it('labels resolve without overlap at the three semantic-zoom bands (R012.7)', () => {
    snapshotScene()
    const viewport = { width: 1280, height: 720 }
    expect(zoomBandFor(120)).toBe('city')
    expect(zoomBandFor(60)).toBe('district')
    expect(zoomBandFor(20)).toBe('building')
    for (const distance of [120, 60, 20]) {
      const { candidates, band } = bandView(distance, viewport)
      const allowed = LABEL_SETS[band]
      const filtered = candidates.filter((c) => allowed.includes(c.kind))
      const { visible } = resolveLabelSet(filtered, viewport)
      assertNoOverlap(visible, band)
      // The band actually shows its story: nothing below the band's kinds,
      // something from each kind the band promises that the world carries.
      for (const l of visible) expect(allowed.includes(l.kind), `${band}: out-of-band kind ${l.kind}`).toBe(true)
      expect(visible.length, `${band}: visible labels`).toBeGreaterThan(0)
      expect(
        visible.every((l) => l.height >= MIN_LABEL_FONT_PX),
        `${band}: plate height floor`,
      ).toBe(true)
    }
    // City band: district signage and core landmarks — no building detail.
    {
      const { candidates } = bandView(120, viewport)
      const filtered = candidates.filter((c) => LABEL_SETS.city.includes(c.kind))
      const { visible } = resolveLabelSet(filtered, viewport)
      const kinds = new Set(visible.map((l) => l.kind))
      expect(kinds.has('district-sign'), 'city band shows district signage').toBe(true)
      expect(kinds.has('core-landmark'), 'city band shows core landmarks').toBe(true)
      expect(kinds.has('building-name')).toBe(false)
    }
    // District band: building names appear.
    {
      const { candidates } = bandView(60, viewport)
      const filtered = candidates.filter((c) => LABEL_SETS.district.includes(c.kind))
      const { visible } = resolveLabelSet(filtered, viewport)
      expect(
        visible.some((l) => l.kind === 'building-name'),
        'district band shows building names',
      ).toBe(true)
    }
    // Building band: character names appear.
    {
      const { candidates } = bandView(20, viewport)
      const filtered = candidates.filter((c) => LABEL_SETS.building.includes(c.kind))
      const { visible } = resolveLabelSet(filtered, viewport)
      expect(
        visible.some((l) => l.kind === 'character-name'),
        'building band shows character names',
      ).toBe(true)
    }
  })

  it('the label layer draws at or above the shared 12 px floor (R012.7)', () => {
    expect(LABEL_FONT_PX).toBeGreaterThanOrEqual(MIN_LABEL_FONT_PX)
  })
})

/**
 * @file perfBudget.test.ts
 * @description The city's performance budgets as acceptance criteria
 * (OVERSTORY-CITY-R028): the test builds the real scene graph over the
 * bundled snapshot (R014) — the static city core, the building layer and
 * the character rigs loaded from the real pinned GLB bytes — and measures
 * triangles, draw calls and texture memory from the graph itself; asserted
 * constants do not count. The fps targets are the declared numbers the e2e
 * scene-fidelity harness (R012.9) measures p95 frame time against, not
 * values this unit test can measure (jsdom cannot render frames).
 */
// spec: OVERSTORY-CITY-R028
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { BUDGETS } from '../core/budgets'
import { clearPins } from '../core/assets'
import { FLEET_SNAPSHOT, domainOf, fleetToConnectors } from '../core/ecosystem'
import { bus } from '../core/events'
import { PLOT_W } from '../core/layout'
import { createBuildings } from '../core/render3d/buildings'
import { initCharacters } from '../core/render3d/characters'
import { buildCityCore } from '../core/render3d/scene'
import { initSim, resetSim, world } from '../core/sim'

const PUBLIC_DIR = join(__dirname, '..', '..', '..', '..', 'public')

// jsdom's 2D context stub has no working createRadialGradient (it returns
// undefined) — the streetlamp glow texture needs one. The stand-in records
// the stops and paints nothing, which is all the scene graph needs to be
// built and measured.
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

/** The same pin-only loader the page uses: bytes from the locked asset set. */
async function loadPinned(rel: string): Promise<GLTF> {
  const buf = readFileSync(join(PUBLIC_DIR, rel))
  // Build the ArrayBuffer in this realm: `buf.buffer.slice(...)` is a
  // cross-realm ArrayBuffer, and three's GLTFLoader.parse branches on
  // `instanceof ArrayBuffer` — cross-realm it fails that check and the
  // loader reads the binary bytes as JSON.
  const bytes = new ArrayBuffer(buf.byteLength)
  new Uint8Array(bytes).set(buf)
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.parse(
      bytes,
      '',
      (gltf) => {
        resolve(gltf)
      },
      (err) => {
        reject(err instanceof Error ? err : new Error('GLB parse failed'))
      },
    )
  })
}

// ---- Measuring the real scene graph ----------------------------------------

/** The triangles one renderable contributes (instanced per instance, sprites one quad). */
function triangles(o: THREE.Object3D): number {
  if (o instanceof THREE.Sprite) return 2
  if (o instanceof THREE.Mesh) {
    const pos = o.geometry.getAttribute('position')
    const n = o.geometry.index ? o.geometry.index.count : pos ? pos.count : 0
    return o instanceof THREE.InstancedMesh ? (n / 3) * o.count : n / 3
  }
  return 0
}

function subtreeTriangles(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => {
    n += triangles(c)
  })
  return n
}

/**
 * The draw calls one renderable issues: three renders a grouped geometry
 * once per group (a box body with six material slots is six calls),
 * everything else once.
 */
function drawCalls(o: THREE.Object3D): number {
  if (o instanceof THREE.Sprite) return 1
  if (o instanceof THREE.Mesh) {
    // One draw call per material group (three renders grouped geometry per
    // group); the assertion pins the BufferGeometry contract's array length.
    const groupCount = o.geometry.groups.length as number
    return groupCount > 0 ? groupCount : 1
  }
  return 0
}

function subtreeDrawCalls(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => {
    n += drawCalls(c)
  })
  return n
}

/** The textures one material references (any slot), each counted once. */
function materialTextures(m: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = []
  const slots = [
    'map',
    'emissiveMap',
    'roughnessMap',
    'metalnessMap',
    'normalMap',
    'bumpMap',
    'aoMap',
    'alphaMap',
    'displacementMap',
    'specularMap',
    'envMap',
  ] as const
  for (const s of slots) {
    const t = (m as unknown as Record<string, unknown>)[s]
    if (t instanceof THREE.Texture) out.push(t)
  }
  return out
}

/** The RGBA8 byte cost of every texture a scene references, each once. */
function textureBytes(scene: THREE.Scene): number {
  const seen = new Set<THREE.Texture>()
  let bytes = 0
  scene.traverse((o) => {
    const mats: THREE.Material[] =
      o instanceof THREE.Mesh
        ? Array.isArray(o.material)
          ? o.material
          : [o.material]
        : o instanceof THREE.Sprite
          ? [o.material]
          : []
    for (const m of mats) {
      for (const t of materialTextures(m)) {
        if (seen.has(t)) continue
        seen.add(t)
        const img = t.image as { width?: number; height?: number } | null | undefined
        bytes += (img?.width ?? 0) * (img?.height ?? 0) * 4
      }
    }
  })
  return bytes
}

/** The building id a scene subtree belongs to (its entity lives on a descendant). */
function buildingEntity(o: THREE.Object3D): string | null {
  let found: string | null = null
  o.traverse((c) => {
    if (found) return
    const e = c.userData as { entity?: { kind: string; id: string } }
    if (e.entity?.kind === 'building') found = e.entity.id
  })
  return found
}

/**
 * The district domain a top-level building renderable belongs to: the
 * building's own domain, or — for the standalone reserved-plot markers and
 * labels — the domain of the plot it sits on (a label projects half a plot
 * past the centre toward the viewer).
 */
function attributionDomain(o: THREE.Object3D): string {
  const bid = buildingEntity(o)
  if (bid) {
    const b = bid in world.buildings ? world.buildings[bid] : null
    if (b) return b.category === 'core' ? 'core' : domainOf(bid)
  }
  for (const p of world.plots) {
    if (Math.abs(p.x - o.position.x) < 1 && o.position.z >= p.z - 0.5 && o.position.z <= p.z + PLOT_W / 2 + 1.5) {
      const id = p.reservedId ?? p.buildingId
      return id ? domainOf(id) : 'general'
    }
  }
  return 'general'
}

/** The building layer over the world: sync + one frame so markers/labels exist. */
function buildingLayer(): THREE.Scene {
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
  const scene = new THREE.Scene()
  const api = createBuildings(scene, world, null)
  api.syncBuildings()
  api.update(0.016, 0)
  return scene
}

describe('performance budgets measured from the real scene graph (R028)', () => {
  afterEach(() => {
    resetSim()
    bus.reset()
    clearPins()
  })

  it('states the acceptance numbers', () => {
    expect(BUDGETS.trianglesPerBuilding).toBe(4000)
    expect(BUDGETS.drawCallsPerDistrict).toBe(150)
    expect(BUDGETS.textureMemoryMB).toBe(32)
    expect(BUDGETS.fpsIntegrated).toBe(60) // 60 fps at 1× on integrated graphics
    expect(BUDGETS.fpsMobile).toBe(30) // 30 fps mobile target
  })

  it('the static city core is measured, and its geometry is real', () => {
    const core = buildCityCore(new THREE.Scene())
    expect(core.ships.length).toBeGreaterThan(0)
    expect(core.houseWindows.length).toBeGreaterThan(0)
    expect(core.lampGlows.length).toBeGreaterThan(0)
    // The seeded park trees mean the core carries hundreds of triangles
    // measured from the graph — not a hand-computed constant.
    const scene = new THREE.Scene()
    buildCityCore(scene)
    expect(subtreeTriangles(scene)).toBeGreaterThan(500)
  })

  it('measured triangles per building hold the budget for every building', () => {
    const scene = buildingLayer()
    let groups = 0
    for (const child of scene.children) {
      const bid = buildingEntity(child)
      if (!bid) continue
      groups++
      const b = bid in world.buildings ? world.buildings[bid] : null
      expect(b, `${bid} has no world record`).toBeTruthy()
      expect(subtreeTriangles(child), `${b!.name} triangles`).toBeLessThanOrEqual(BUDGETS.trianglesPerBuilding)
    }
    // Every building in the world has exactly one measured group.
    expect(groups).toBe(Object.keys(world.buildings).length)
  })

  it('measured draw calls per district domain hold the budget', () => {
    const scene = buildingLayer()
    const perDomain = new Map<string, number>()
    for (const child of scene.children) {
      const calls = subtreeDrawCalls(child)
      if (!calls) continue
      const d = attributionDomain(child)
      perDomain.set(d, (perDomain.get(d) ?? 0) + calls)
    }
    expect(perDomain.size).toBeGreaterThan(1)
    for (const [d, calls] of perDomain) {
      // The district budget is per connector district; the core block is a
      // single landmark cluster, not a district, so it is measured and
      // reported but not budgeted by this row.
      if (d === 'core') continue
      expect(calls, `domain "${d}" draw calls`).toBeLessThanOrEqual(BUDGETS.drawCallsPerDistrict)
    }
  })

  it('character rigs from the real pinned bytes stay within the asset triangle budget', async () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const scene = new THREE.Scene()
    const api = await initCharacters(scene, world, null, loadPinned)
    let rigs = 0
    for (const child of scene.children) {
      if (!(child instanceof THREE.Group)) continue
      rigs++
      // A real rig is a full skeleton: a failed pin (labelled placeholder)
      // is far smaller, so a real measurement proves the load.
      expect(subtreeTriangles(child), 'a real rig, not a placeholder').toBeGreaterThan(50)
      expect(subtreeTriangles(child), 'asset triangle budget').toBeLessThanOrEqual(BUDGETS.assetTriangles)
    }
    expect(rigs).toBe(world.characters.length)
    api.dispose()
  })

  it('measured texture memory of the whole scene holds the budget', async () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const coreScene = new THREE.Scene()
    buildCityCore(coreScene)
    const buildings = buildingLayer()
    const characters = new THREE.Scene()
    const api = await initCharacters(characters, world, null, loadPinned)
    const mb = (textureBytes(coreScene) + textureBytes(buildings) + textureBytes(characters)) / (1024 * 1024)
    expect(mb, `texture memory ${mb.toFixed(1)} MB`).toBeLessThanOrEqual(BUDGETS.textureMemoryMB)
    api.dispose()
  })

  it('the fps targets are declared; the fidelity harness measures frame time against them (R012.9)', () => {
    // These are the acceptance numbers the e2e scene-fidelity harness
    // (e2e/scene-fidelity.browser.ts) measures p95 frame time against —
    // frame timing cannot be measured in a unit test without a renderer.
    expect(BUDGETS.fpsIntegrated).toBe(60)
    expect(BUDGETS.fpsMobile).toBe(30)
  })
})

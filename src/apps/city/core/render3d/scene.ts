/**
 * @file scene.ts
 * @description The 3D scene core of the Arbora City renderer (part of the
 * render3d/ split, T025), rebuilt on the shared scene pipeline
 * (OVERSTORY-CITY-R031 / OVERSTORY-DESIGN-R012): the pipeline owns the
 * renderer state (linear lighting, sRGB, ACES tone mapping, PCF shadows),
 * the image-based environment, the one clock-following sun and the quality
 * tiers; this module supplies the real post pipeline (SSAO, bloom, FXAA),
 * the two sky domes, the controls and the static kit-built city geometry
 * (ground, roads, crosswalks, water, shore, pier, ships, houses, parks,
 * streetlamps) plus the day/night ambience. The WebGL context-loss
 * listener lives here (OVERSTORY-CITY-R015): on `webglcontextlost` the page
 * is notified and falls back to the 2D schematic of the same city graph —
 * never a dead canvas. The facade (render3d.ts) composes this with the
 * buildings, characters, labels and picking layers.
 */
// spec: OVERSTORY-CITY-R031, OVERSTORY-DESIGN-R012.1
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import {
  createScenePipeline,
  type PipelineComposer,
  type PipelineRenderer,
  type ScenePipeline,
} from '@/lib/scene3d/pipeline'
import { buildingAsset, mulberry32, propAsset } from '@/lib/scene3d/generators'
import { SCENE_COLORS } from '@/lib/scene3d/palette'
import { GROUND_SIZE, HOUSES, PARKS, PIER, SHIPS, WATER_Z, X_ROADS, Z_ROADS } from '../layout'
import type { world as SimWorld } from '../sim'
import { derivedRoadGraph } from '../layoutEdit'
import type { RoadGraph } from '@/lib/scene3d/roads'
import { createRoads, type RoadsApi } from './roads'
import {
  litWindowSheet,
  metalTexture,
  parkTexture,
  skyDayTexture,
  skyNightTexture,
  trimSheetTexture,
  waterTexture,
  woodTexture,
} from './trimSheet'

export type World = typeof SimWorld

/** Mesh test as a type predicate (strict rules refuse the bare instanceof). */
export function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return o instanceof THREE.Mesh
}

const DAY_SKY = new THREE.Color(SCENE_COLORS['sky-day'].hex)
const NIGHT_SKY = new THREE.Color(SCENE_COLORS['sky-night'].hex)
const tmpColor = new THREE.Color()

/** Overview framing for the 200-unit city (district west, waterfront south). */
export const OVERVIEW_CAM = new THREE.Vector3(36, 62, 108)
export const OVERVIEW_TARGET = new THREE.Vector3(-20, 1, 8)

/** The day/night factor (0 = full day, 1 = full night) for one in-game clock. */
export function nightFactor(clock: number): number {
  const t = clock / 86400
  const ang = (t - 0.25) * Math.PI * 2
  const elev = Math.sin(ang)
  return Math.max(0, Math.min(1, (-elev + 0.06) * 3))
}

export interface CityScene {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  /** The shared pipeline the render loop drives (tiers, sun, composer). */
  pipeline: ScenePipeline
  /** The road layer (R032): rebuilds for the saved layout edit's graph. */
  roads: RoadsApi
  /** Day/night + ambient animation for one frame. */
  updateEnvironment(timeAcc: number): void
  /** True once the WebGL context was lost — the page has fallen back to 2D. */
  isLost(): boolean
  onResize(width: number, height: number): void
  dispose(): void
}

/** The per-frame handles of the static city geometry (ambient animation). */
export interface CityCore {
  /** House window materials (the night ambience). */
  houseWindows: THREE.MeshStandardMaterial[]
  /** Streetlamp glow sprites (the night ambience). */
  lampGlows: THREE.Sprite[]
  /** The ship groups (the bobbing). */
  ships: THREE.Group[]
  /** The ship bob phases, one per ship. */
  shipPhases: number[]
  /** The road layer (R032): rebuilds for a new road graph, disposes with the scene. */
  roads: RoadsApi
}

/** Deterministic per-park seed (R014): the scene core never calls Math.random. */
function parkSeed(x: number, z: number): number {
  let h = 2166136261 >>> 0
  for (const v of [Math.round(x * 1000), Math.round(z * 1000)]) {
    h ^= v
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * The static city geometry (R014/R028/R031): ground, roads, crosswalks,
 * water, shore, pier, ships, houses, parks and streetlamps, all kit-built
 * with the shared trim sheet as their authored base-colour map (R012.2),
 * added to the scene they are handed. `createCityScene` composes it with
 * the pipeline, the sky domes and the day/night cycle; the performance
 * test (R028) measures its real triangles, draw calls and texture memory
 * with a bare `THREE.Scene` — no WebGL renderer required.
 */
export function buildCityCore(scene: THREE.Scene, graph?: RoadGraph): CityCore {
  // The city's authored maps (R012.2): every non-marker surface in the
  // scene carries one of these — the material audit enforces it.
  const trimTex = trimSheetTexture()
  const parkTex = parkTexture()
  const waterTex = waterTexture()
  const woodTex = woodTexture()
  const metalTex = metalTexture()
  const litSheet = litWindowSheet()

  // ---- Ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // ---- Roads (one merged geometry + one instanced crosswalk, R032) ---------
  // The layer owns its materials and rebuilds for a new road graph when a
  // saved layout edit swaps the derived grid for the overrides' graph. The
  // caller may hand in the live graph (the world's, when a stored document
  // was applied before the renderer booted); absent it the derived grid is
  // drawn — the tests measure the core against that default.
  const roads = createRoads(scene, graph ?? derivedRoadGraph())

  // ---- Water + shore + pier + ships -------------------------------------------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, 22),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.1 }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.06, WATER_Z + 11)
  scene.add(water)

  const shore = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, 2.6),
    new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }),
  )
  shore.rotation.x = -Math.PI / 2
  shore.position.set(0, 0.04, WATER_Z - 0.4)
  scene.add(shore)

  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(PIER.w, 0.4, PIER.z1 - PIER.z0 + 1),
    new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 }),
  )
  pier.position.set(PIER.x, 0.2, (PIER.z0 + PIER.z1) / 2)
  pier.castShadow = true
  scene.add(pier)

  const hullMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.3 })
  const cabinMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 })
  const flagMat = new THREE.MeshStandardMaterial({ map: parkTex, roughness: 0.9 })
  const ships = SHIPS.map((s) => {
    const g = new THREE.Group()
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 1.5), hullMat)
    hull.position.y = 0.35
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.1), cabinMat)
    cabin.position.set(-0.7, 0.95, 0)
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.3), flagMat)
    flag.position.set(1.2, 1.2, 0)
    g.add(hull, cabin, flag)
    g.position.set(s.x, 0.35, s.z)
    scene.add(g)
    return g
  })
  // Bob phases live in a typed array next to the ships (Object3D.userData is
  // an untyped bag the strict lint rules refuse to trust).
  const shipPhases = SHIPS.map((_, i) => i * 1.7)

  // ---- Houses (residential quarter, kit-built) --------------------------------
  // One shared trim-sheet wall map; each house carries its own emissive
  // clone so the 'lit windows' ambience is per house (R031 ambient life).
  const houseTemplate = new THREE.MeshStandardMaterial({
    map: trimTex,
    roughness: 0.9,
    emissive: 0xffffff,
    emissiveMap: litSheet,
    emissiveIntensity: 0,
  })
  const houseWindows: THREE.MeshStandardMaterial[] = []
  HOUSES.forEach((h, i) => {
    const house = buildingAsset({
      seed: 1000 + i,
      archetype: i % 2 ? 'workshop' : 'studio',
      footprint: [4, 4],
      floors: 1,
    })
    const mat = houseTemplate.clone()
    const mesh = new THREE.Mesh(house.geometry, mat)
    mesh.position.set(h.x, 0, h.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    houseWindows.push(mat)
  })

  // ---- Parks (kit street-furniture trees, seeded per park) --------------------
  const propMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })
  const treeGeo = propAsset({ seed: 1, kind: 'tree' }).geometry
  for (const pk of PARKS) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }),
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.set(pk.x, 0.03, pk.z)
    scene.add(patch)
    // Seeded per park: the tree layout is identical on every boot (R014).
    const rand = mulberry32(parkSeed(pk.x, pk.z))
    for (let i = 0; i < pk.trees; i++) {
      const t = 0.9 + rand() * 0.3
      const tree = new THREE.Mesh(treeGeo, propMat)
      const a = rand() * Math.PI * 2
      const r = rand() * 3.4
      tree.position.set(pk.x + Math.cos(a) * r, 0, pk.z + Math.sin(a) * r)
      tree.scale.setScalar(t)
      tree.castShadow = true
      scene.add(tree)
    }
  }

  // ---- Streetlamps (every other intersection) ---------------------------------
  const lampGeo = propAsset({ seed: 2, kind: 'streetlamp' }).geometry
  const glowTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,225,170,0.85)')
    grad.addColorStop(1, 'rgba(255,225,170,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const lampGlows: THREE.Sprite[] = []
  for (let xi = 1; xi < X_ROADS.length - 1; xi += 2)
    for (let zi = 1; zi < Z_ROADS.length - 1; zi += 2) {
      const x = X_ROADS[xi] + 1.7
      const z = Z_ROADS[zi] + 1.7
      const pole = new THREE.Mesh(lampGeo, propMat)
      pole.position.set(x, 0, z)
      pole.castShadow = true
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }),
      )
      glow.position.set(x, 3.2, z)
      glow.scale.setScalar(2.2)
      scene.add(pole, glow)
      lampGlows.push(glow)
    }

  return { houseWindows, lampGlows, ships, shipPhases, roads }
}

/** The real post pipeline: render, SSAO, bloom, FXAA, output (R012.1). */
function composerFor(
  renderer: PipelineRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): PipelineComposer {
  const gl = renderer as unknown as THREE.WebGLRenderer
  const composer = new EffectComposer(gl)
  composer.addPass(new RenderPass(scene, camera))
  const aoPass = new SSAOPass(scene, camera, width, height)
  aoPass.kernelRadius = 8
  composer.addPass(aoPass)
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.6, 0.8)
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())
  const fxaaPass = new FXAAPass()
  // The FXAA pass keeps its resolution uniform as a Vector2 value; capture
  // it once so the typed set below replaces both resizes.
  const fxaaResolution = fxaaPass.material.uniforms.resolution.value as unknown as THREE.Vector2
  fxaaResolution.set(1 / width, 1 / height)
  composer.addPass(fxaaPass)
  return {
    aoPass,
    bloomPass,
    fxaaPass,
    setSize: (w: number, h: number): void => {
      composer.setSize(w, h)
      fxaaResolution.set(1 / w, 1 / h)
    },
    render: (): void => {
      composer.render()
    },
    dispose: (): void => {
      composer.dispose()
    },
  }
}

export interface CitySceneOptions {
  /** Called once when the WebGL context is lost; the page overlays the 2D schematic. */
  onContextLost: () => void
  /**
   * Called when a lost context is restored by the browser (R015): the page
   * resumes this renderer and drops the schematic — the fallback is not a
   * one-way door.
   */
  onContextRestored?: () => void
}

export function createCityScene(container: HTMLElement, world: World, opts: CitySceneOptions): CityScene {
  const { onContextLost, onContextRestored } = opts

  // ---- The shared pipeline (R012.1) --------------------------------------------
  // The renderer is created here so the image-based environment can be
  // PMREM-processed from it before the pipeline binds it.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  const pipeline = createScenePipeline(container, {
    createRenderer: () => renderer,
    createComposer: composerFor,
    environment,
    fog: new THREE.Fog(DAY_SKY.clone(), 90, 320),
    initialTier: 'high',
  })
  const { scene, camera } = pipeline

  // ---- Sky domes (day/night crossfade, unlit) ----------------------------------
  const dayDome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 16),
    new THREE.MeshStandardMaterial({
      map: skyDayTexture(),
      emissive: 0xffffff,
      emissiveMap: skyDayTexture(),
      color: 0x000000,
      emissiveIntensity: 1,
      side: THREE.BackSide,
      fog: false,
      transparent: true,
      roughness: 1,
    }),
  )
  const nightDome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 16),
    new THREE.MeshStandardMaterial({
      map: skyNightTexture(),
      emissive: 0xffffff,
      emissiveMap: skyNightTexture(),
      color: 0x000000,
      emissiveIntensity: 1,
      side: THREE.BackSide,
      fog: false,
      transparent: true,
      roughness: 1,
    }),
  )
  scene.add(dayDome, nightDome)

  camera.position.copy(OVERVIEW_CAM)
  const cw = container.clientWidth || 800
  const ch = container.clientHeight || 600
  renderer.setSize(cw, ch)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(OVERVIEW_TARGET)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = 1.45
  controls.minDistance = 12
  controls.maxDistance = 200

  // ---- WebGL context loss and restore (R015) -------------------------------
  // On `webglcontextlost` the page is notified and overlays the 2D schematic
  // of the same city graph — never a dead canvas. The renderer itself is kept
  // (paused): the fallback is not a one-way door. When the browser restores
  // the context (three re-initialises its GL state), `onContextRestored`
  // resumes this renderer and the page drops the schematic.
  let lost = false
  let disposed = false
  const onLost = (e: Event): void => {
    e.preventDefault()
    lost = true
    onContextLost()
  }
  const onRestored = (e: Event): void => {
    e.preventDefault()
    if (disposed || !lost) return
    lost = false
    onContextRestored?.()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)
  renderer.domElement.addEventListener('webglcontextrestored', onRestored)

  // ---- Static city geometry (ground, roads, water, houses, parks, lamps) ----
  // The world's live road graph (a stored layout document may already be
  // applied at boot — the second viewer boots into the edited city, R032).
  const core = buildCityCore(scene, world.roadGraph ?? undefined)

  // ---- Per-frame environment (day/night, houses, lamps, ships) --------------
  function updateEnvironment(timeAcc: number): void {
    // The sun follows the in-game clock through the shared pipeline (R012.1).
    pipeline.updateEnvironment(world.clock)
    const night = nightFactor(world.clock)

    // Sky and fog crossfade with the mood.
    dayDome.material.opacity = 1 - night
    nightDome.material.opacity = night
    tmpColor.copy(DAY_SKY).lerp(NIGHT_SKY, night)
    scene.fog?.color.copy(tmpColor)

    // House windows: lit while a character is at home — the ambient life of
    // R031. No night floor: an empty house stays dark at any hour.
    const home = new Map<string, number>()
    for (const c of world.characters) {
      const dx = c.pos.x - c.home.x
      const dz = c.pos.z - c.home.z
      if (dx * dx + dz * dz < 25) {
        const key = `${c.home.x}|${c.home.z}`
        home.set(key, (home.get(key) ?? 0) + 1)
      }
    }
    core.houseWindows.forEach((m, i) => {
      const h = HOUSES[i]
      m.emissiveIntensity = (home.get(`${h.x}|${h.z}`) ?? 0) > 0 ? 1.4 : 0
    })

    // Lamps with the night (R031 ambient life).
    for (const g of core.lampGlows) g.material.opacity = 0.55 * night

    // Ships bobbing.
    for (let i = 0; i < core.ships.length; i++) {
      const s = core.ships[i]
      s.position.y = 0.35 + Math.sin(timeAcc * 0.8 + core.shipPhases[i]) * 0.06
      s.rotation.z = Math.sin(timeAcc * 0.6 + core.shipPhases[i]) * 0.02
    }
  }

  // Complete disposal at the GPU level (R018): the scene graph is traversed
  // and every geometry, material and texture it owns is disposed, the camera
  // controls are disposed, and the WebGL context is force-lost — a 2D/3D
  // toggle or a remount never piles up contexts or leaked GPU memory.
  function dispose(): void {
    if (disposed) return
    disposed = true
    renderer.domElement.removeEventListener('webglcontextlost', onLost)
    renderer.domElement.removeEventListener('webglcontextrestored', onRestored)
    // The road layer owns its meshes and materials (R032); remove it before
    // the traversal so the traversal never disposes a mid-rebuild geometry.
    core.roads.dispose()
    const geos = new Set<THREE.BufferGeometry>()
    const mats = new Set<THREE.Material>()
    const texs = new Set<THREE.Texture>()
    scene.traverse((o) => {
      if (isMesh(o)) {
        geos.add(o.geometry)
        const material = o.material
        if (Array.isArray(material)) material.forEach((m) => mats.add(m))
        else mats.add(material)
      }
      if (o instanceof THREE.Sprite) {
        mats.add(o.material)
        if (o.material.map) texs.add(o.material.map)
      }
    })
    for (const m of mats) {
      // Dispose every texture the material references (map, emissive, ...).
      for (const key of Object.keys(m)) {
        const v = (m as unknown as Record<string, unknown>)[key]
        if (v instanceof THREE.Texture) texs.add(v as THREE.Texture)
      }
      m.dispose()
    }
    for (const g of geos) g.dispose()
    for (const t of texs) t.dispose()
    controls.dispose()
    pipeline.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    container.removeChild(renderer.domElement)
  }

  function onResize(w: number, h: number): void {
    pipeline.onResize(w, h)
    renderer.setSize(w, h)
  }

  return {
    scene,
    renderer,
    camera,
    controls,
    pipeline,
    roads: core.roads,
    updateEnvironment,
    isLost: () => lost,
    onResize,
    dispose,
  }
}

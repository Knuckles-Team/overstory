/**
 * @file pipeline.ts
 * @description The shared 3D scene pipeline (OVERSTORY-DESIGN-R012.1): linear
 * lighting with physically based materials, image-based environment lighting,
 * filmic tone mapping and sRGB output, one sun light that follows the scene
 * clock and casts soft shadows, screen-space ambient occlusion, bloom limited
 * to emissive surfaces, anti-aliasing, atmospheric fog and a sky model — each
 * a declared pass a quality tier keeps or drops (tiers.ts). The tier is
 * chosen from measured frame time and can be overridden by the operator.
 *
 * The module is seam-injectable so the pass wiring is verifiable without a
 * WebGL context: tests supply a stub renderer and a stub composer and assert
 * exactly which passes each tier enables (R012.1's `passes_per_tier` bar).
 */
import * as THREE from 'three'
import { TIERS, selectTier, type TierName } from './tiers'

/**
 * The renderer surface the pipeline touches (duck-typed). The real
 * `THREE.WebGLRenderer` satisfies it; tests supply a stub that records the
 * state the pipeline sets.
 */
export interface PipelineRenderer {
  shadowMap: { enabled: boolean; type: number }
  toneMapping: number
  toneMappingExposure: number
  outputColorSpace: string
  setPixelRatio(ratio: number): void
  /** The bare-renderer frame (used when no composer seam is supplied). */
  render(scene: THREE.Scene, camera: THREE.Camera): void
}

/** The post-processing composer surface: the optional passes a tier toggles. */
export interface PipelineComposer {
  /** Screen-space ambient occlusion (high tier only). */
  aoPass: { enabled: boolean } | null
  /** Bloom, limited to emissive surfaces (high and medium tiers). */
  bloomPass: { enabled: boolean } | null
  /** Anti-aliasing pass (high and medium tiers). */
  fxaaPass: { enabled: boolean } | null
  setSize(width: number, height: number): void
  render(): void
  dispose(): void
}

/** The one sun light: direction, colour and intensity follow the scene clock. */
export interface PipelineSun {
  position: THREE.Vector3
  color: THREE.Color
  intensity: number
  castShadow: boolean
  shadow: { mapSize: { set(width: number, height: number): void } }
}

/** Everything one tier application touches. */
export interface PipelineSurfaces {
  renderer: PipelineRenderer
  scene: { environment: THREE.Texture | null; fog: THREE.Fog | THREE.FogExp2 | null }
  sun: PipelineSun
  /** The sky dome; its visibility follows the tier's sky pass. */
  sky: { visible: boolean } | null
}

/**
 * Apply one declared tier to the renderer and scene surfaces (R012.1).
 * Exactly the tier's declared passes are enabled; nothing else is. The
 * environment stays bound whenever the tier keeps the `environment` pass —
 * that is the "never unlit" guarantee of R012 at every tier.
 */
export function applyTier(surfaces: PipelineSurfaces, tier: TierName): void {
  const declared = TIERS[tier]
  const passes = declared.passes
  const { renderer, scene, sun, sky } = surfaces
  renderer.shadowMap.enabled = passes.shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  if (passes.shadows) sun.shadow.mapSize.set(declared.shadowMapSize, declared.shadowMapSize)
  sun.castShadow = passes.shadows
  renderer.toneMapping = passes.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  // Daylight uses room IBL plus a directional sun. A slight exposure headroom
  // preserves material and roof detail instead of clipping it to white.
  renderer.toneMappingExposure = 0.78
  renderer.outputColorSpace = THREE.SRGBColorSpace
  if (!passes.environment) scene.environment = null
  scene.fog = passes.fog ? scene.fog : null
  if (sky) sky.visible = passes.sky
}

/** Apply one declared tier to the composer's optional passes (R012.1). */
export function applyTierToComposer(composer: PipelineComposer, tier: TierName): void {
  const passes = TIERS[tier].passes
  if (composer.aoPass) composer.aoPass.enabled = passes.ao
  if (composer.bloomPass) composer.bloomPass.enabled = passes.bloom
  if (composer.fxaaPass) composer.fxaaPass.enabled = passes.antialiasing
}

/**
 * The default sun model (R012.1): one light whose direction, colour and
 * intensity follow the scene clock in seconds. Daylight is warm-white and
 * rises with the elevation; the low-sun window reads amber; night keeps a
 * dim cool moonlight so the scene never goes unlit.
 */
export function sunFromClock(timeAcc: number, sun: PipelineSun): void {
  const t = (((timeAcc % 86400) + 86400) % 86400) / 86400
  const angle = (t - 0.25) * Math.PI * 2
  const elevation = Math.sin(angle)
  const azimuth = Math.cos(angle)
  if (elevation > -0.12) {
    sun.position.set(azimuth * 110, Math.max(8, elevation * 110), 30)
    // A clear Caribbean day carries a warm gold, rather than a neutral white
    // fill that flattens the saturated coast and foliage below it.
    sun.color.setHex(elevation < 0.25 ? 0xffb37a : 0xffc65a)
    sun.intensity = 1.3
  } else {
    sun.position.set(-azimuth * 110, 70, 30)
    sun.color.setHex(0x8fa8d8)
    sun.intensity = 0.35
  }
}

/**
 * The frame-time tracker behind tier selection (R012.1): a bounded window of
 * per-frame durations; p95 over it drives the tier. Null until there is
 * enough evidence (30 frames), so a cold start never drops the tier.
 */
export class FrameTimeTracker {
  private samples: number[] = []
  private sorted: number[] = []
  private readonly capacity: number

  constructor(capacity = 120) {
    this.capacity = capacity
  }

  /** Record the duration (ms) of the frame that just ended. */
  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return
    this.samples.push(ms)
    let low = 0
    let high = this.sorted.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.sorted[middle] < ms) low = middle + 1
      else high = middle
    }
    this.sorted.splice(low, 0, ms)
    if (this.samples.length > this.capacity) {
      const expired = this.samples.shift()
      if (expired !== undefined) this.sorted.splice(this.sorted.indexOf(expired), 1)
    }
  }

  /** The p95 frame time in ms, or null until 30 frames are recorded. */
  p95(): number | null {
    if (this.samples.length < 30) return null
    const idx = Math.min(this.sorted.length - 1, Math.max(0, Math.ceil(0.95 * this.sorted.length) - 1))
    return this.sorted[idx]
  }

  reset(): void {
    this.samples = []
    this.sorted = []
  }
}

export interface ScenePipelineOptions {
  /** Injectable renderer factory (tests supply a stub recording the state). */
  createRenderer?: (container: HTMLElement) => PipelineRenderer
  /** Injectable composer factory (tests supply a stub recording the passes). */
  createComposer?: (
    renderer: PipelineRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ) => PipelineComposer
  /** The image-based environment texture to bind (R012.1). */
  environment?: THREE.Texture | null
  /** The atmospheric fog instance; visibility follows the tier. */
  fog?: THREE.Fog | null
  /** The sky dome; visibility follows the tier. */
  sky?: { visible: boolean } | null
  /** The initial tier before any frame-time evidence exists. */
  initialTier?: TierName
  /** Notified whenever the active tier changes (the HUD shows it). */
  onTierChange?: (tier: TierName) => void
}

/** The composed pipeline a 3D surface renderer (the city) drives per frame. */
export interface ScenePipeline {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: PipelineRenderer
  composer: PipelineComposer
  sun: PipelineSun
  /** The active tier. */
  tier: TierName
  /** The operator override, if any (wins over the measured selection). */
  override: TierName | null
  /** Set or clear the operator tier override (R012.1). */
  setOverride(tier: TierName | null): void
  /** One frame of sun animation from the scene clock (R012.1). */
  updateEnvironment(timeAcc: number): void
  /** Record the ended frame; drop the tier when its budget is exceeded. */
  endFrame(frameMs: number): void
  /** One rendered frame through the composer, or directly at the low tier. */
  renderFrame(): void
  onResize(width: number, height: number): void
  dispose(): void
}

/** Build the real WebGL renderer for the browser path. */
function realRenderer(container: HTMLElement): PipelineRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)
  return renderer
}

// The post pipeline (render, SSAO, bloom, FXAA, output passes) is assembled
// by the consumer's scene module, which owns the GL objects; the pipeline
// owns the declared tier application on whatever composer it is handed.
// This keeps the library importable in unit tests without a GL context.

/**
 * Compose the shared scene pipeline (R012): renderer state, environment
 * binding, the one clock-following sun, the tier and its selection from
 * measured frame time with an operator override. The consumer (the city's
 * render3d facade) layers its world content into `scene` and drives
 * `updateEnvironment` / `endFrame` / `renderFrame` per frame.
 */
export function createScenePipeline(container: HTMLElement, opts: ScenePipelineOptions = {}): ScenePipeline {
  const {
    createRenderer = realRenderer,
    createComposer,
    environment = null,
    fog = null,
    sky = null,
    initialTier = 'high',
    onTierChange,
  } = opts

  const scene = new THREE.Scene()
  scene.environment = environment
  scene.fog = fog
  const width = container.clientWidth || 800
  const height = container.clientHeight || 600
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  camera.updateProjectionMatrix()
  const renderer = createRenderer(container)

  const sun = new THREE.DirectionalLight(0xffffff, 1.3)
  sun.position.set(60, 90, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(TIERS[initialTier].shadowMapSize, TIERS[initialTier].shadowMapSize)
  scene.add(sun)

  let composer: PipelineComposer
  if (createComposer) {
    composer = createComposer(renderer, scene, camera, width, height)
  } else {
    // No composer seam: the pipeline renders through the bare renderer and
    // the tier's post passes are a no-op (still declared, still applied).
    composer = {
      aoPass: null,
      bloomPass: null,
      fxaaPass: null,
      setSize: () => undefined,
      render: () => {
        renderer.render(scene, camera)
      },
      dispose: () => undefined,
    }
  }

  let tier: TierName = initialTier
  let override: TierName | null = null
  const tracker = new FrameTimeTracker()
  const surfaces: PipelineSurfaces = { renderer, scene, sun, sky }

  function setTier(next: TierName): void {
    if (next === tier) return
    tier = next
    applyTier(surfaces, tier)
    applyTierToComposer(composer, tier)
    if (onTierChange) onTierChange(tier)
  }

  applyTier(surfaces, tier)
  applyTierToComposer(composer, tier)

  return {
    scene,
    camera,
    renderer,
    composer,
    sun,
    get tier() {
      return tier
    },
    get override() {
      return override
    },
    setOverride(next: TierName | null): void {
      override = next
      setTier(selectTier(tracker.p95(), tier, override))
    },
    updateEnvironment(timeAcc: number): void {
      sunFromClock(timeAcc, sun)
    },
    endFrame(frameMs: number): void {
      tracker.record(frameMs)
      setTier(selectTier(tracker.p95(), tier, override))
    },
    renderFrame(): void {
      // Low tier has no AO, bloom or FXAA. Rendering it through the composer
      // still allocates and blits full-screen targets, an especially costly
      // no-op on integrated GPUs. The renderer already owns tone mapping and
      // sRGB output, so direct render preserves the legible low-tier look.
      if (tier === 'low') renderer.render(scene, camera)
      else composer.render()
    },
    onResize(width: number, height: number): void {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      composer.setSize(width, height)
    },
    dispose(): void {
      composer.dispose()
      tracker.reset()
    },
  }
}

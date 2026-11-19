/**
 * @file pipeline.test.ts
 * @description The shared 3D scene pipeline (OVERSTORY-DESIGN-R012.1): each
 * quality tier enables exactly its declared passes; the high tier keeps
 * shadows, ambient occlusion, bloom, tone mapping and the environment bound;
 * the tier drops from measured frame time and never flaps; the operator
 * override wins; and the sun follows the scene clock.
 */
// spec: OVERSTORY-DESIGN-R012.1
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FrameTimeTracker,
  applyTier,
  applyTierToComposer,
  createScenePipeline,
  sunFromClock,
  type PipelineComposer,
  type PipelineRenderer,
  type PipelineSun,
} from '../pipeline'
import { TIER_ORDER, TIERS, keptPasses, selectTier, type PassId, type TierName } from '../tiers'

const ALL_PASSES: PassId[] = ['shadows', 'ao', 'bloom', 'toneMapping', 'environment', 'antialiasing', 'fog', 'sky']

/** A recording renderer stub: the pipeline sets, the test asserts. */
function stubRenderer(): PipelineRenderer {
  return {
    shadowMap: { enabled: false, type: 0 },
    toneMapping: 0,
    toneMappingExposure: 1,
    outputColorSpace: '',
    setPixelRatio: () => undefined,
    render: () => undefined,
  }
}

/** A recording composer stub with every optional pass present. */
function stubComposer(): PipelineComposer {
  return {
    aoPass: { enabled: false },
    bloomPass: { enabled: false },
    fxaaPass: { enabled: false },
    setSize: () => undefined,
    render: () => undefined,
    dispose: () => undefined,
  }
}

function stubSun(): PipelineSun {
  return {
    position: new THREE.Vector3(),
    color: new THREE.Color(),
    intensity: 0,
    castShadow: false,
    shadow: { mapSize: { set: () => undefined } },
  }
}

describe('quality tiers (R012.1)', () => {
  it('declares exactly three tiers, best to worst', () => {
    expect(TIER_ORDER).toEqual(['high', 'medium', 'low'])
    for (const name of TIER_ORDER) {
      expect(TIERS[name].name).toBe(name)
      expect(TIERS[name].maxFrameMs).toBeGreaterThan(0)
    }
  })

  it('passes_per_tier: each tier enables exactly its declared passes', () => {
    const renderer = stubRenderer()
    const composer = stubComposer()
    const scene = { environment: new THREE.Texture(), fog: new THREE.Fog(0x808080) }
    const sky = { visible: false }
    const sun = stubSun()

    for (const name of TIER_ORDER) {
      applyTier({ renderer, scene, sun, sky }, name)
      applyTierToComposer(composer, name)

      // Every pass id is accounted for: kept exactly when declared.
      for (const id of ALL_PASSES) {
        expect(TIERS[name].passes[id], `tier ${name} declares pass ${id}`).toBeTypeOf('boolean')
      }
      // Renderer-side passes.
      expect(renderer.shadowMap.enabled, `${name}.shadows`).toBe(TIERS[name].passes.shadows)
      expect(renderer.toneMapping, `${name}.toneMapping`).toBe(
        TIERS[name].passes.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping,
      )
      expect(renderer.outputColorSpace, `${name}.outputColorSpace`).toBe(THREE.SRGBColorSpace)
      expect(scene.fog !== null, `${name}.fog`).toBe(TIERS[name].passes.fog)
      expect(scene.environment !== null, `${name}.environment`).toBe(TIERS[name].passes.environment)
      expect(sun.castShadow, `${name}.sun castShadow`).toBe(TIERS[name].passes.shadows)
      expect(sky.visible, `${name}.sky`).toBe(TIERS[name].passes.sky)
      // Composer-side passes.
      expect(composer.aoPass!.enabled, `${name}.ao`).toBe(TIERS[name].passes.ao)
      expect(composer.bloomPass!.enabled, `${name}.bloom`).toBe(TIERS[name].passes.bloom)
      expect(composer.fxaaPass!.enabled, `${name}.antialiasing`).toBe(TIERS[name].passes.antialiasing)
    }

    // The high tier keeps the full pass set.
    expect(keptPasses('high').sort()).toEqual([...ALL_PASSES].sort())
    // Every tier keeps environment lighting and tone mapping: a drop in
    // fidelity never renders the scene unlit (R012).
    for (const name of TIER_ORDER) {
      expect(TIERS[name].passes.environment, `${name} keeps the environment bound`).toBe(true)
      expect(TIERS[name].passes.toneMapping, `${name} keeps tone mapping`).toBe(true)
    }
  })

  it('the tier selection drops from measured frame time and never flaps', () => {
    // No evidence yet: the tier is kept.
    expect(selectTier(null, 'high')).toBe('high')
    // Within budget: kept.
    expect(selectTier(10, 'high')).toBe('high')
    // Over the high budget, under the medium: one drop.
    expect(selectTier(20, 'high')).toBe('medium')
    // Over the medium budget too: two drops.
    expect(selectTier(30, 'high')).toBe('low')
    // The low tier is the floor: worse times still hold it (no further drop).
    expect(selectTier(100, 'high')).toBe('low')
    expect(selectTier(200, 'low')).toBe('low')
    // No auto-promote: a fast frame after a drop keeps the dropped tier.
    expect(selectTier(5, 'low')).toBe('low')
  })

  it('the operator override wins over the measured selection', () => {
    expect(selectTier(200, 'high', 'low')).toBe('low')
    expect(selectTier(5, 'low', 'high')).toBe('high')
    // A null override means the measured selection rules.
    expect(selectTier(20, 'high', null)).toBe('medium')
  })
})

describe('frame-time tracking (R012.1)', () => {
  it('reports null until there is evidence, then the p95 of the window', () => {
    const tracker = new FrameTimeTracker()
    expect(tracker.p95()).toBeNull()
    for (let i = 0; i < 29; i++) tracker.record(10)
    expect(tracker.p95()).toBeNull()
    tracker.record(10)
    expect(tracker.p95()).toBe(10)
    // A top-5% tail shows in the p95: 5 slow frames out of 65 samples put
    // the 95th percentile inside the slow group.
    for (let i = 0; i < 30; i++) tracker.record(5)
    for (let i = 0; i < 5; i++) tracker.record(40)
    expect(tracker.p95()).toBeGreaterThanOrEqual(40)
    // Out-of-window samples fall out of the bounded ring.
    for (let i = 0; i < 200; i++) tracker.record(5)
    expect(tracker.p95()).toBe(5)
  })

  it('rejects non-finite and negative durations', () => {
    const tracker = new FrameTimeTracker()
    tracker.record(Number.NaN)
    tracker.record(-1)
    tracker.record(10)
    expect(tracker.p95()).toBeNull() // only one valid sample
  })
})

describe('the scene pipeline (R012.1)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('applies the initial tier to the renderer, scene and composer on creation', () => {
    const renderer = stubRenderer()
    const composer = stubComposer()
    const env = new THREE.Texture()
    const fog = new THREE.Fog(0x808080)
    const sky = { visible: false }
    const container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)

    const pipeline = createScenePipeline(container, {
      createRenderer: () => renderer,
      createComposer: () => composer,
      environment: env,
      fog,
      sky,
      initialTier: 'medium',
    })

    // The declared medium pass set is applied to every surface.
    expect(renderer.shadowMap.enabled).toBe(TIERS.medium.passes.shadows)
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace)
    expect(composer.aoPass!.enabled).toBe(false) // medium drops AO
    expect(composer.bloomPass!.enabled).toBe(true)
    expect(composer.fxaaPass!.enabled).toBe(true)
    expect(pipeline.scene.environment).toBe(env) // environment bound
    expect(pipeline.scene.fog).toBe(fog)
    expect(sky.visible).toBe(true)
    expect(pipeline.tier).toBe('medium')
    pipeline.dispose()
  })

  it('drops the tier from measured frame time and notifies', () => {
    const renderer = stubRenderer()
    const composer = stubComposer()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const seen: TierName[] = []
    const pipeline = createScenePipeline(container, {
      createRenderer: () => renderer,
      createComposer: () => composer,
      initialTier: 'high',
      onTierChange: (t) => {
        seen.push(t)
      },
    })

    // 30 fast frames: no evidence of trouble, the tier holds.
    for (let i = 0; i < 30; i++) pipeline.endFrame(8)
    expect(pipeline.tier).toBe('high')
    // The window fills with slow frames: the drop lands once p95 speaks —
    // straight to the tier whose budget holds the measured time.
    for (let i = 0; i < 60; i++) pipeline.endFrame(30)
    expect(pipeline.tier).toBe('low')
    expect(seen).toEqual(['low']) // one notification per tier change
    // The low tier's declared state is what the surfaces now carry.
    expect(renderer.shadowMap.enabled).toBe(false)
    expect(composer.aoPass!.enabled).toBe(false)
    expect(composer.bloomPass!.enabled).toBe(false)
    pipeline.dispose()
  })

  it('the operator override wins, and clearing it resumes the measured selection', () => {
    const renderer = stubRenderer()
    const composer = stubComposer()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const pipeline = createScenePipeline(container, {
      createRenderer: () => renderer,
      createComposer: () => composer,
      initialTier: 'high',
    })

    pipeline.setOverride('low')
    expect(pipeline.tier).toBe('low')
    expect(pipeline.override).toBe('low')
    // The override holds even when the measured frame time is fast.
    for (let i = 0; i < 60; i++) pipeline.endFrame(5)
    expect(pipeline.tier).toBe('low')
    // Clearing the override resumes the measured selection (fast frames).
    pipeline.setOverride(null)
    expect(pipeline.tier).toBe('low') // p95 is still fast but no auto-promote
    pipeline.dispose()
  })

  it('the sun follows the scene clock: day, dusk and night are distinct', () => {
    const sun = stubSun()
    const read = (): { x: number; y: number; z: number; hex: number; intensity: number } => ({
      x: sun.position.x,
      y: sun.position.y,
      z: sun.position.z,
      hex: sun.color.getHex(),
      intensity: sun.intensity,
    })
    sunFromClock(43200, sun) // noon
    const noon = read()
    sunFromClock(62000, sun) // late afternoon: sun below the amber window
    const dusk = read()
    sunFromClock(18000, sun) // deep night
    const night = read()
    // The sun is high and bright at noon, lower and amber at dusk,
    // dim and cool at night — three distinct states of the one light.
    expect(noon.y).toBeGreaterThan(dusk.y)
    expect(noon.intensity).toBeGreaterThan(night.intensity)
    expect(noon.hex).not.toBe(night.hex)
    expect(dusk.hex).not.toBe(noon.hex)
    expect(night.intensity).toBeGreaterThan(0) // never unlit
  })

  it('the composed pipeline exposes one sun, one camera and a working resize', () => {
    const renderer = stubRenderer()
    const composer = stubComposer()
    const container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)
    const pipeline = createScenePipeline(container, {
      createRenderer: () => renderer,
      createComposer: () => composer,
    })
    expect(pipeline.scene.children.filter((c) => c instanceof THREE.DirectionalLight)).toHaveLength(1)
    expect(pipeline.camera.aspect).toBeCloseTo(800 / 600)
    pipeline.onResize(1200, 400)
    expect(pipeline.camera.aspect).toBeCloseTo(3)
    pipeline.renderFrame() // the composer's render is driven
    pipeline.dispose()
  })
})

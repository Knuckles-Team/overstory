/**
 * @file render3d.ts
 * @description 3D renderer for Arbora City (OVERSTORY-CITY-R009/R011).
 * The `init3D` facade (T025) composes the render3d/ split: the scene core
 * (scene.ts — including the WebGL context-loss fallback, R015), the building
 * and construction layer (buildings.ts), the character rigs (characters.ts)
 * and picking & focus (picking.ts). It consumes the shared world state and
 * the event bus; it owns no facts of its own. The scene library ships only
 * in the city route chunk (OVERSTORY-CITY-R016).
 */
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { zoomBandFor } from '@/lib/scene3d/labels'
import type { RoadGraph } from '@/lib/scene3d/roads'
import { pinnedBytes } from './assets'
import type { world as simWorld } from './sim'
import { createCityScene } from './render3d/scene'
import { createBuildings } from './render3d/buildings'
import { initCharacters } from './render3d/characters'
import { createAsyncLayerSlot } from './render3d/asyncLayer'
import { collectLabelCandidates, createLabelLayer } from './render3d/labelLayer'
import { createPicking } from './render3d/picking'
import type { CityRenderer, SelectionHit } from './types'

type World = typeof simWorld

/** No-op fallback for the context-loss callback when the page does not provide one. */
const noopContextLost = (): void => undefined

export async function init3D(
  container: HTMLElement,
  world: World,
  opts: {
    onSelect: (hit: SelectionHit | null) => void
    /** Called once when the WebGL context is lost; the page overlays the 2D schematic. */
    onContextLost?: () => void
    /** Called when a lost context is restored; the page resumes this renderer (R015). */
    onContextRestored?: () => void
  },
): Promise<CityRenderer> {
  const { onSelect, onContextLost, onContextRestored } = opts
  const loader = new GLTFLoader()

  // Pinned GLBs are served only from the startup-verified byte cache, so
  // each pinned file is fetched exactly once and its bytes are the verified
  // ones (OVERSTORY-CITY-R013). There is no render-time fetch fallback: an
  // unverified pin is rejected at load and the character layer renders its
  // labelled placeholder for it — an asset that failed verification never
  // reaches the scene with unverified bytes.
  function loadPinnedGLB(url: string): Promise<GLTF> {
    const cached = pinnedBytes(url)
    if (!cached) return Promise.reject(new Error(`pinned asset not verified at startup: ${url}`))
    return new Promise((resolve, reject) => {
      loader.parse(
        cached,
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

  // The scene core owns the shared pipeline (renderer state, environment,
  // sun, tiers, composer), the camera, controls, static city geometry and
  // the day/night ambience; on WebGL context loss it notifies the page so
  // the 2D schematic of the same city graph takes over, and on context
  // restore the page resumes this renderer (R015).
  const sceneCore = createCityScene(container, world, {
    onContextLost: onContextLost ?? noopContextLost,
    onContextRestored,
  })
  const { scene, renderer, camera, controls, pipeline } = sceneCore
  // The screen-space label layer (R012.7): a pointer-transparent canvas
  // overlay inside the container, driven per frame.
  const labelLayer = createLabelLayer(container)
  let viewport = { width: container.clientWidth || 800, height: container.clientHeight || 600 }

  // Marker cube first (used by placeholders + construction).
  let markerRoot: THREE.Object3D | null = null
  try {
    const mc = await loadPinnedGLB('city-assets/marker-cube.glb')
    mc.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true
    })
    markerRoot = mc.scene
  } catch (err) {
    console.warn('[city] marker cube unavailable:', err)
  }

  const buildings = createBuildings(scene, world, markerRoot, sceneCore.groundHeight)
  const characters = createAsyncLayerSlot(
    await initCharacters(scene, world, markerRoot, loadPinnedGLB, camera, sceneCore.groundHeight),
  )
  const picking = createPicking(scene, camera, renderer.domElement, world, controls, onSelect)

  // Landmarks + pre-existing buildings.
  buildings.syncBuildings()

  /**
   * Rebind the layer references after the world was replaced (the replay
   * seek, R029): the rig layer rebinds to the fresh character records, and
   * the building layer syncs any state the replay left behind.
   */
  function resync(): void {
    if (disposed) return
    void characters.replace(() =>
      initCharacters(scene, world, markerRoot, loadPinnedGLB, camera, sceneCore.groundHeight),
    )
    buildings.syncBuildings()
  }

  let disposed = false
  // Labels are a semantic overlay, not simulation state.  Projecting and
  // painting them every render frame created short-lived arrays and canvas
  // work continuously, which eventually showed up as GC hitches in a city
  // left open in demo mode.  Ten updates per second is visually immediate
  // for an overlay while leaving the render loop allocation-light.
  let labelElapsed = 0
  const LABEL_REFRESH_S = 0.1
  // The fidelity hold (R012.9): while set, every frame renders at the same
  // ambient time, so the golden viewpoints are identical on every run.
  let heldAmbientTime: number | null = null
  function holdAmbient(time: number | null): void {
    heldAmbientTime = time
  }

  function render(dtReal: number): void {
    if (disposed || sceneCore.isLost()) return
    const frameStart = performance.now()
    controls.update()
    picking.tick(dtReal)
    const sceneClock = heldAmbientTime ?? world.clock
    sceneCore.updateEnvironment(sceneClock, dtReal)
    buildings.update(dtReal, sceneClock)
    characters.current.update(dtReal, sceneClock)
    buildings.syncBuildings()
    picking.update(sceneClock)
    const labelBand = zoomBandFor(camera.position.distanceTo(controls.target))
    labelElapsed += dtReal
    if (labelElapsed >= LABEL_REFRESH_S) {
      labelElapsed = 0
      labelLayer.update(collectLabelCandidates(world, camera, viewport, labelBand), viewport, labelBand)
    }
    // The shared pipeline owns the frame: the composer renders, and the
    // measured frame time drives the tier (p95 drop, R012.1).
    pipeline.renderFrame()
    pipeline.endFrame(performance.now() - frameStart)
  }

  function dispose(): void {
    disposed = true
    characters.dispose()
    buildings.dispose()
    picking.dispose()
    labelLayer.dispose()
    sceneCore.dispose()
  }

  function onResize(w: number, h: number): void {
    viewport = { width: w, height: h }
    sceneCore.onResize(w, h)
  }

  return {
    render,
    dispose,
    focus: (x: number, z: number) => {
      picking.focus(x, z)
    },
    overview: () => {
      sceneCore.exitInterior()
      picking.overview()
    },
    getViewport: () => ({
      x: controls.target.x,
      z: controls.target.z,
      verticalSpan: 2 * camera.position.distanceTo(controls.target) * Math.tan((camera.fov * Math.PI) / 360),
    }),
    setViewport: ({ x, z, verticalSpan }) => {
      if (![x, z, verticalSpan].every(Number.isFinite) || verticalSpan <= 0) return
      const direction = camera.position.clone().sub(controls.target).normalize()
      const distance = THREE.MathUtils.clamp(
        verticalSpan / (2 * Math.tan((camera.fov * Math.PI) / 360)),
        controls.minDistance,
        controls.maxDistance,
      )
      controls.target.set(x, controls.target.y, z)
      camera.position.copy(controls.target).addScaledVector(direction, distance)
      controls.update()
    },
    diagnostics: () => ({
      tier: pipeline.tier,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
    }),
    say: (charId: string, text: string) => {
      characters.current.say(charId, text)
    },
    onResize,
    setSelected: (hit: SelectionHit | null) => {
      picking.setSelected(hit)
    },
    enterInterior: (buildingId: string) => {
      sceneCore.enterInterior(buildingId)
    },
    exitInterior: () => {
      sceneCore.exitInterior()
    },
    resync,
    setRoads: (graph: RoadGraph) => {
      if (disposed) return
      sceneCore.roads.rebuild(graph)
    },
    // The fidelity harness surface (R012.9): the live scene graph, the
    // camera and controls, and the ambient-time hold for deterministic
    // frames. The page installs the documented seam on top (fidelity.ts).
    fidelity: {
      scene,
      camera,
      controls,
      canvas: renderer.domElement,
      holdAmbient,
    },
  }
}

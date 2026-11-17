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
import { pinnedBytes } from './assets'
import type { world as simWorld } from './sim'
import { createCityScene } from './render3d/scene'
import { createBuildings } from './render3d/buildings'
import { initCharacters } from './render3d/characters'
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
    /** Called once when the WebGL context is lost; the page falls back to 2D. */
    onContextLost?: () => void
  },
): Promise<CityRenderer> {
  const { onSelect, onContextLost } = opts
  const loader = new GLTFLoader()

  // Pinned GLBs are served from the startup-verified byte cache so each
  // pinned file is fetched exactly once (OVERSTORY-CITY-R013); unpinned
  // assets fall back to a plain fetch.
  function loadPinnedGLB(url: string): Promise<GLTF> {
    const cached = pinnedBytes(url)
    const buf: Promise<ArrayBuffer> = cached
      ? Promise.resolve(cached)
      : (async () => {
          const r = await fetch(url)
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
          return r.arrayBuffer()
        })()
    return new Promise((resolve, reject) => {
      buf.then(
        (data) => {
          loader.parse(
            data,
            '',
            (gltf) => {
              resolve(gltf)
            },
            (err) => {
              reject(err instanceof Error ? err : new Error('GLB parse failed'))
            },
          )
        },
        (err: unknown) => {
          reject(err instanceof Error ? err : new Error('pinned GLB unavailable'))
        },
      )
    })
  }

  // The scene core owns the renderer, camera, controls, static city geometry
  // and the day/night cycle; on WebGL context loss it notifies the page so
  // the 2D schematic of the same city graph takes over (R015).
  const sceneCore = createCityScene(container, world, onContextLost ?? noopContextLost)
  const { scene, renderer, camera, controls } = sceneCore

  // Marker cube first (used by placeholders + construction).
  let markerRoot: THREE.Object3D | null = null
  try {
    const mc = await loadPinnedGLB('city-assets/riders/marker-cube.glb')
    mc.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true
    })
    markerRoot = mc.scene
  } catch (err) {
    console.warn('[city] marker cube unavailable:', err)
  }

  const buildings = createBuildings(scene, world, markerRoot)
  let characters = await initCharacters(scene, world, markerRoot, loadPinnedGLB)
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
    characters.dispose()
    void initCharacters(scene, world, markerRoot, loadPinnedGLB).then((api) => {
      if (disposed) {
        api.dispose()
        return
      }
      characters = api
    })
    buildings.syncBuildings()
  }

  let disposed = false
  let timeAcc = 0

  function render(dtReal: number): void {
    if (disposed || sceneCore.isLost()) return
    timeAcc += dtReal
    controls.update()
    picking.tick(dtReal)
    sceneCore.updateEnvironment(timeAcc)
    buildings.update(dtReal, timeAcc)
    characters.update(dtReal, timeAcc)
    buildings.syncBuildings()
    picking.update(timeAcc)
    renderer.render(scene, camera)
  }

  function dispose(): void {
    disposed = true
    characters.dispose()
    buildings.dispose()
    picking.dispose()
    sceneCore.dispose()
  }

  function onResize(w: number, h: number): void {
    sceneCore.onResize(w, h)
  }

  return {
    render,
    dispose,
    focus: (x: number, z: number) => {
      picking.focus(x, z)
    },
    overview: () => {
      picking.overview()
    },
    say: (charId: string, text: string) => {
      characters.say(charId, text)
    },
    onResize,
    setSelected: (hit: SelectionHit | null) => {
      picking.setSelected(hit)
    },
    resync,
  }
}

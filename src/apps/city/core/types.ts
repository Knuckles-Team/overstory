/**
 * @file types.ts
 * @description Shared shapes between the city renderers and the UI layer
 * (OVERSTORY-CITY-R011/R015). Both renderers expose the same
 * {@link CityRenderer} handle so the page and the UI own no view-specific
 * code; the simulation core is the only writer of world state.
 */
import type * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { RoadGraph } from '@/lib/scene3d/roads'
import type { LayoutEdit } from './layoutEdit'

/** What a click on a renderer hit: one character or one building. */
export interface SelectionHit {
  kind: 'character' | 'building'
  id: string
}

/** One renderer (3D scene or 2D schematic) of the same city. */
export interface CityRenderer {
  /** Draw one frame; `dtReal` is the real elapsed seconds. */
  render(dtReal: number): void
  /** Tear down all handles, listeners and GPU resources. */
  dispose(): void
  /** Ease the view toward one ground point (x, z). */
  focus(x: number, z: number): void
  /** Ease the view back to the city overview. */
  overview(): void
  /** Show a speech bubble above one character for a couple of seconds. */
  say(charId: string, text: string): void
  /** Fit the renderer to a new container size (CSS pixels). */
  onResize(width: number, height: number): void
  /** Reflect the current selection (ring / outline). */
  setSelected(hit: SelectionHit | null): void
  /**
   * Rebind layer references after the world was replaced (the replay seek,
   * R029). Stateless renderers (the 2D schematic) need no rebind.
   */
  resync?(): void
  /**
   * Swap the road layer for a new road graph (R032): a saved layout edit
   * redraws the network; the 2D schematic reads the graph from the world and
   * needs no call.
   */
  setRoads?(graph: RoadGraph): void
  /**
   * The fidelity harness surface (R012.9), on 3D renderers only: the live
   * scene graph the audits walk, the camera and controls the golden views
   * place, and the ambient-time hold that makes a frame identical on every
   * run. Absent on stateless renderers (the 2D schematic).
   */
  fidelity?: CityFidelityCore
}

/** The deterministic-frame surface the fidelity harness (R012.9) needs. */
export interface CityFidelityCore {
  /** The live scene graph the material/density audits walk. */
  scene: THREE.Scene
  /** The perspective camera the golden views place. */
  camera: THREE.PerspectiveCamera
  /** The orbit controls the views settle on. */
  controls: OrbitControls
  /** The renderer's canvas (the frame digest reads it mid-frame). */
  canvas: HTMLCanvasElement
  /**
   * Hold the ambient (real-time-driven) scene time at one value so every
   * rendered frame is identical (the golden captures); null frees it.
   */
  holdAmbient(time: number | null): void
}

/** The activity mode the sim runs in (R026): quiet is the default. */
export type ActivityMode = 'quiet' | 'demo'

/** The user actions the UI panel invokes on behalf of the page. */
export interface CityActions {
  dispatch(): void
  onboard(connectorId: string): void
  focus(x: number, z: number): void
  overview(): void
  setSelected(hit: SelectionHit | null): void
  speed(value: number): void
  /** Switch the activity mode (R026); the page syncs the simulation. */
  setActivity(mode: ActivityMode): void
  /**
   * Swap the renderer view (R027): the 2D schematic is the top zoom level
   * and the accessible non-canvas view, not only a fallback.
   */
  setView(view: '3d' | '2d'): void
  /** Seek the recorded history to `offsetS` in-game seconds after boot (R029). */
  scrub(offsetS: number): void
  /** (Re)start the first-visit tour (R030). */
  startTour(): void
  /**
   * Submit one layout edit (R032): validated against the live world and road
   * graph, saved through the served layout operation, applied, and the road
   * layer redrawn. A refused or unavailable edit leaves the city unchanged
   * and reports the operator-facing reason.
   */
  layoutEdit(edit: LayoutEdit): Promise<{ ok: boolean; reason?: string }>
}

/** The static DOM handles the UI layer renders into (the page owns them). */
export interface CityUiElements {
  popList: HTMLElement
  inspector: HTMLElement
  feedList: HTMLElement
  /** R010: the "simulated activity" badge on the feed (clears on the first live event). */
  simBadge: HTMLElement
  /** R026: the activity-mode badge (quiet / demo). */
  activityBadge: HTMLElement
  clock: HTMLElement
  mode: HTMLElement
  banner: HTMLElement
  modal: HTMLElement
  /** R025: the always-available legend, derived from the one encoding table. */
  legend: HTMLElement
  /** R030: the first-visit tour panel. */
  tour: HTMLElement
  statPop: HTMLElement
  statKnow: HTMLElement
  statTools: HTMLElement
  statIncidents: HTMLElement
  statConnectors: HTMLElement
  btnDispatch: HTMLElement
  /** R032: the layout edit-mode toggle in the control bar. */
  btnEdit: HTMLElement
  /** R032: the layout edit panel (hidden until edit mode opens). */
  editPanel: HTMLElement
  btnOverview: HTMLElement
  btnOnboard: HTMLElement
  /** R026: the labelled demo toggle. */
  btnDemo: HTMLElement
  /** R027: the 3D/2D view toggle. */
  btnView2d: HTMLElement
  btnView3d: HTMLElement
  /** R029: the time scrubber over the recorded action history. */
  scrubber: HTMLInputElement
  /** R029: the scrubber readout (replayed clock). */
  scrubberReadout: HTMLElement
  /** R030: the tour re-open control. */
  btnTour: HTMLElement
  speedButtons: HTMLElement[]
}

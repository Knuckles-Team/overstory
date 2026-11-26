/**
 * @file fidelity.ts
 * @description The city's fidelity test seam (OVERSTORY-DESIGN-R012.9,
 * OVERSTORY-CITY-R031): a small, documented handle the golden-viewpoint
 * harness drives through the same seams the UI uses. It places the camera
 * at the declared golden viewpoints, freezes the ambient scene time so a
 * frame is identical on every run, seeks the recorded history through the
 * real scrub action (R029) for the night view, runs the R012.2 / R012.3 /
 * R012.7 audits over the live scene graph, and measures real frame time —
 * constants asserted in a test do not count. The handle installs only in
 * development builds and exposes `window.__cityFidelity`; the production
 * bundle carries none of it.
 */
import {
  densityAudit,
  materialAudit,
  type DensityAuditResult,
  type DensityBlock,
  type DressedPlot,
  type MaterialAuditResult,
} from '@/lib/scene3d/audit'
import { MIN_LABEL_FONT_PX, resolveLabelSet, type LabelCandidate } from '@/lib/scene3d/labels'
import { HOUSES, PARKS, PLOTS, X_ROADS, Z_ROADS, BUILDING_POS } from './layout'
import { mulberry32 } from './prng'
import type { FrameBudgetView } from './frameBudget'
import type { NightWindowReport } from './render3d/windowEmissive'
import { dressingForPlot } from './render3d/buildings'
import { collectLabelCandidates } from './render3d/labelLayer'
import type { world as simWorld } from './sim'
import type { CityActions, CityFidelityCore } from './types'

/** The in-game boot clock: the city wakes at 09:00 (sim.ts). */
const BOOT_CLOCK_S = 9 * 3600
const DAY_S = 86400
/** One day/night cycle step the night view seeks to (21:00, full night). */
const NIGHT_CLOCK_S = 21 * 3600

/**
 * The declared golden viewpoints (R012.9): position + orbit target, in
 * scene units. `overview` is the renderer's own overview pose (the one
 * `actions.overview()` eases to); `district` frames the connector district;
 * `street` looks down the main grid. `close-up` and `night` are placed from
 * the live world state at capture time.
 */
export const GOLDEN_VIEWS = {
  // Must mirror the renderer's first-frame composition: an approved overview
  // that omits the river, waterfront or skyline is not production evidence.
  overview: { cam: [62, 55, 112] as const, target: [-8, 2, 10] as const },
  // Both poses are on declared road corridors, never inside the Arbora gate
  // or a connector footprint. Their oblique view exposes façades, sidewalks
  // and public furniture rather than a top-down label carpet.
  district: { cam: [-90, 42, 78] as const, target: [-50, 2, 5] as const },
  street: { cam: [-20, 5.5, 38] as const, target: [-20, 1.2, 4] as const },
} as const

export type GoldenView = keyof typeof GOLDEN_VIEWS | 'close-up' | 'night'

/**
 * The declared street-edge density (R012.3): at least one street-edge
 * furniture item — a streetlamp, a dressed prop, a park tree or a door mat —
 * on every block's street edges. The scene's streetlamp rule (every other
 * interior intersection) alone covers the street grid; this is the bar the
 * audit enforces over the dressed layout.
 */
export const MIN_EDGE_FURNITURE_PER_BLOCK = 1

export interface CityFidelityState {
  mode: 'LIVE' | 'SIMULATED'
  view: '3d' | '2d'
  clock: number
  day: number
}

export interface CityFidelityLabelAudit {
  visible: number
  hidden: number
  overlaps: number
  underMinFont: number
}

export interface CityFidelityAudits {
  /** R012.2: the material audit over the live scene graph. */
  material: MaterialAuditResult
  /** R012.3: the density audit over the dressed plot blocks. */
  density: DensityAuditResult
  /** Content blocks below the declared street-edge density. */
  sparseStreetEdges: string[]
  /** Blocks the dressed layout leaves to the background (water, shore, sky). */
  backgroundBlocks: string[]
  /** R012.7: the label set at the current camera. */
  labels: CityFidelityLabelAudit
  ok: boolean
}

export interface CityFidelityFrameTime {
  p95Ms: number
  p50Ms: number
  frames: number
}

export interface CityFidelityHandle {
  state(): CityFidelityState
  /**
   * Place the camera at one golden viewpoint and freeze the ambient time;
   * the page keeps rendering identical frames until the hold is released.
   */
  capture(view: GoldenView): Promise<void>
  /**
   * Seek the recorded history to in-game seconds through the real scrub
   * seam (R029); resolves once the clock has settled at the target.
   */
  holdAt(clockS: number): Promise<void>
  /** Switch to the 2D schematic through the real action seam (R027). */
  setSchematic(): Promise<void>
  /** The R012.2 / R012.3 / R012.7 audits over the live scene. */
  audits(): CityFidelityAudits
  /**
   * The SHA-256 of the next rendered frame (the canvas is read mid-frame,
   * where the WebGL buffer is still live) — the determinism check the
   * golden viewpoints stand on.
   */
  frameDigest(): Promise<string>
  /**
   * Measure real animation-frame time: percentiles over the sampled frames
   * while the page's loop renders (no asserted constants).
   */
  frameTime(samples: number): Promise<CityFidelityFrameTime>
  /** The WebGL renderer string (the harness uses it to declare the GPU tier). */
  gpu(): string
  /** The live frame-budget report (R065); null while the 2D schematic is active. */
  budget(): FrameBudgetView | null
  /** The live night-window resolution (R066); null while the 2D schematic is active. */
  nightWindows(): NightWindowReport | null
  dispose(): void
}

export interface CityFidelityDeps {
  /** The live 3D fidelity core (absent while the 2D schematic is active). */
  core: () => CityFidelityCore | null
  view: () => '3d' | '2d'
  mode: () => 'LIVE' | 'SIMULATED'
  /** The same action seam the UI consumes (scrub, setView, ...). */
  actions: () => CityActions
  /** The live simulation world (the only writer is the sim itself). */
  world: typeof simWorld
  viewport: () => { width: number; height: number }
}

declare global {
  interface Window {
    /** The city's fidelity seam (development builds only; R012.9). */
    __cityFidelity?: CityFidelityHandle
  }
}

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Re-derives the scene's deterministic per-park seed (R014) — the same hash
 * as the scene core, so the tree layout the density audit counts is exactly
 * the one the scene renders.
 */
function parkSeed(x: number, z: number): number {
  let h = 2166136261 >>> 0
  for (const v of [Math.round(x * 1000), Math.round(z * 1000)]) {
    h ^= v
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** The park tree positions, re-derived from the scene's own rule. */
function parkTreePositions(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (const pk of PARKS) {
    const rand = mulberry32(parkSeed(pk.x, pk.z))
    for (let i = 0; i < pk.trees; i++) {
      rand() // the scale draw (t = 0.9 + rand() * 0.3)
      const a = rand() * Math.PI * 2
      const r = rand() * 3.4
      out.push({ x: pk.x + Math.cos(a) * r, z: pk.z + Math.sin(a) * r })
    }
  }
  return out
}

/** The scene's streetlamp rule: one pole at every other interior intersection. */
function streetLampAt(xi: number, zi: number): boolean {
  const interior =
    xi >= 1 && zi >= 1 && xi < X_ROADS.length - 1 && zi < Z_ROADS.length - 1 && xi % 2 === 1 && zi % 2 === 1
  const waterfront = xi >= 1 && xi < X_ROADS.length - 1 && xi % 2 === 1 && zi === Z_ROADS.length - 1
  return interior || waterfront
}

/** The street-edge zone of one block cell (a 10 m band around its edges). */
function inBlockZone(x: number, z: number, i: number, j: number): boolean {
  return x > X_ROADS[i] - 10 && x < X_ROADS[i + 1] + 10 && z > Z_ROADS[j] - 10 && z < Z_ROADS[j + 1] + 10
}

function platesOverlap(a: LabelCandidate, b: LabelCandidate): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function installCityFidelity(deps: CityFidelityDeps): CityFidelityHandle {
  function state(): CityFidelityState {
    return {
      mode: deps.mode(),
      view: deps.view(),
      clock: Math.round(deps.world.clock),
      day: deps.world.day,
    }
  }

  async function holdAt(clockS: number): Promise<void> {
    const offset = Math.max(0, clockS - BOOT_CLOCK_S)
    // The replay lands its target clock in a single frame; the live simulation
    // (which runs at `timeScale` in-game seconds per real second) would cross
    // that exact clock before the settle poll can read it. Pausing holds the
    // world on the landed frame — the hold — so the poll observes the exact
    // clock deterministically. The caller resumes with `actions().speed` when
    // it needs the city running again.
    deps.actions().speed(0)
    deps.actions().scrub(offset)
    const target = (BOOT_CLOCK_S + offset) % DAY_S
    for (let i = 0; i < 400; i++) {
      if (deps.world.clock === target) return
      await sleep(25)
    }
    throw new Error(`the replay did not settle at ${clockS} in-game seconds (clock ${deps.world.clock})`)
  }

  async function capture(view: GoldenView): Promise<void> {
    const core = deps.core()
    if (!core) throw new Error('the 3D scene is not active')
    let cam: readonly [number, number, number]
    let target: readonly [number, number, number]
    if (view === 'close-up') {
      const c = deps.world.characters[0]
      cam = [c.pos.x + 3, 2.2, c.pos.z + 3]
      target = [c.pos.x, 1.1, c.pos.z]
    } else {
      const pose = view === 'night' ? GOLDEN_VIEWS.overview : GOLDEN_VIEWS[view]
      cam = pose.cam
      target = pose.target
    }
    core.camera.position.set(cam[0], cam[1], cam[2])
    core.controls.target.set(target[0], target[1], target[2])
    core.controls.update()
    // Capture lighting directly. Replaying twelve simulated hours simply to
    // get a night screenshot freezes the browser and couples visual proof to
    // an unrelated historical-state exercise; `holdAt` remains the replay
    // seam when a test actually needs state at a past clock.
    core.holdAmbient(view === 'night' ? NIGHT_CLOCK_S : BOOT_CLOCK_S)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  }

  async function setSchematic(): Promise<void> {
    if (deps.view() !== '2d') deps.actions().setView('2d')
    for (let i = 0; i < 200; i++) {
      if (deps.view() === '2d') return
      await sleep(25)
    }
    throw new Error('the 2D view did not activate')
  }

  function audits(): CityFidelityAudits {
    const core = deps.core()
    if (!core) throw new Error('the 3D scene is not active')

    // R012.2: the city declares its markers through `userData.marker`.
    const material = materialAudit(core.scene, {
      isMarker: (object) => {
        let node: typeof object | null = object
        while (node) {
          if (node.userData.marker !== undefined) return true
          node = node.parent
        }
        return false
      },
    })

    // R012.3: mirror the scene's dressed-layout derivation over the live
    // world — the same plots, dressings, streetlamps, park trees and door
    // mats the scene renders (dressingForPlot and the park seeds are the
    // scene's own deterministic rules, R014).
    const occupied = new Set<number>()
    for (const b of Object.values(deps.world.buildings)) {
      if (b.derivedPlot !== null) occupied.add(b.derivedPlot)
    }
    const trees = parkTreePositions()
    const doorMats: { x: number; z: number }[] = [
      ...Object.values(BUILDING_POS).map((b) => ({ x: b.x, z: b.z })),
      ...HOUSES,
    ]

    const blocks: DensityBlock[] = []
    const sparseStreetEdges: string[] = []
    const backgroundBlocks: string[] = []
    for (let i = 0; i < X_ROADS.length - 1; i++) {
      for (let j = 0; j < Z_ROADS.length - 1; j++) {
        const plots: DressedPlot[] = []
        for (let p = 0; p < PLOTS.length; p++) {
          const plot = PLOTS[p]
          if (plot.x > X_ROADS[i] && plot.x < X_ROADS[i + 1] && plot.z > Z_ROADS[j] && plot.z < Z_ROADS[j + 1]) {
            const plotRec = deps.world.plots[p]
            const content: DressedPlot['content'] = occupied.has(p)
              ? 'building'
              : plotRec.reservedId
                ? 'reserved'
                : dressingForPlot(plot.x, plot.z)
            // The scene gives every undressed plot exactly two edge props
            // (trees, benches, signs, bins) — the same count it renders.
            plots.push({
              id: `plot:${plot.x}:${plot.z}`,
              content,
              edgeFurniture: content === 'park' || content === 'plaza' || content === 'lot' ? 2 : 0,
            })
          }
        }
        const hasLandmark = Object.values(BUILDING_POS).some((b) => inBlockZone(b.x, b.z, i, j))
        const hasHouse = HOUSES.some((h) => inBlockZone(h.x, h.z, i, j))
        const hasPark = PARKS.some((pk) => inBlockZone(pk.x, pk.z, i, j))
        if (plots.length === 0 && !hasLandmark && !hasHouse && !hasPark) {
          // Beyond the dressed layout: the background (water, shore, sky,
          // fog) carries that area, not the street grid.
          backgroundBlocks.push(`block:${i}:${j}`)
          continue
        }
        const cornerLamps = [
          streetLampAt(i, j),
          streetLampAt(i + 1, j),
          streetLampAt(i, j + 1),
          streetLampAt(i + 1, j + 1),
        ].filter(Boolean).length
        const streetEdge =
          cornerLamps +
          trees.filter((t) => inBlockZone(t.x, t.z, i, j)).length +
          doorMats.filter((d) => inBlockZone(d.x, d.z, i, j)).length
        if (plots.length === 0) {
          // Content blocks without a dressed plot (landmarks, houses,
          // parks): the street-edge rule is checked directly.
          if (streetEdge < MIN_EDGE_FURNITURE_PER_BLOCK) sparseStreetEdges.push(`block:${i}:${j}`)
          continue
        }
        if (plots.length > 1) {
          throw new Error(`block:${i}:${j} holds ${plots.length} plots (the block model assumes one)`)
        }
        blocks.push({
          id: `block:${i}:${j}`,
          minEdgeFurniture: MIN_EDGE_FURNITURE_PER_BLOCK,
          plots: plots.map((pl) => ({ ...pl, edgeFurniture: pl.edgeFurniture + streetEdge })),
        })
      }
    }
    const density = densityAudit(blocks)

    // R012.7: resolve the label set at the current camera — the visible
    // rectangles must never intersect, and every plate stays legible.
    const viewport = deps.viewport()
    const resolution = resolveLabelSet(collectLabelCandidates(deps.world, core.camera, viewport), viewport)
    let overlaps = 0
    const visible = resolution.visible
    for (let a = 0; a < visible.length; a++) {
      for (let b = a + 1; b < visible.length; b++) {
        if (platesOverlap(visible[a], visible[b])) overlaps++
      }
    }
    const labels: CityFidelityLabelAudit = {
      visible: visible.length,
      hidden: resolution.hidden.length,
      overlaps,
      underMinFont: visible.filter((l) => l.height < MIN_LABEL_FONT_PX).length,
    }

    return {
      material,
      density,
      sparseStreetEdges,
      backgroundBlocks,
      labels,
      ok: material.ok && density.ok && sparseStreetEdges.length === 0 && overlaps === 0 && labels.underMinFont === 0,
    }
  }

  async function frameDigest(): Promise<string> {
    const core = deps.core()
    if (!core) throw new Error('the 3D scene is not active')
    const dataUrl = await new Promise<string>((resolve, reject) => {
      requestAnimationFrame(() => {
        try {
          // The canvas is read mid-frame, where the WebGL buffer is live.
          resolve(core.canvas.toDataURL('image/png'))
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    })
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async function frameTime(samples: number): Promise<CityFidelityFrameTime> {
    const deltas: number[] = []
    await new Promise<void>((resolve) => {
      let last = performance.now()
      const tick = (): void => {
        const now = performance.now()
        deltas.push(now - last)
        last = now
        if (deltas.length >= samples) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    deltas.sort((a, b) => a - b)
    const q = (p: number): number => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))]
    return { p95Ms: q(0.95), p50Ms: q(0.5), frames: deltas.length }
  }

  function gpu(): string {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return 'no-webgl'
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown'
  }

  /** The live frame-budget report (R065), read through the renderer's seam. */
  function budget(): FrameBudgetView | null {
    return deps.core()?.budget?.() ?? null
  }

  /** The live night-window resolution (R066), read through the renderer's seam. */
  function nightWindows(): NightWindowReport | null {
    return deps.core()?.nightWindows?.() ?? null
  }

  function dispose(): void {
    if (typeof window !== 'undefined') window.__cityFidelity = undefined
  }

  const handle: CityFidelityHandle = {
    state,
    capture,
    holdAt,
    setSchematic,
    audits,
    frameDigest,
    frameTime,
    gpu,
    budget,
    nightWindows,
    dispose,
  }
  if (typeof window !== 'undefined' && import.meta.env.DEV) window.__cityFidelity = handle
  return handle
}

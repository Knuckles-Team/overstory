/**
 * @file windowEmissive.ts
 * @description The window-emissive resolver (OVERSTORY-CITY-R066, in the
 * building layer): per-building window grids resolve lit or unlit from the
 * activity schedule (R050) at frame rate, and the kit facades carry
 * per-window emissive cells — one canvas texture per building, redrawn only
 * when the schedule slot, the occupancy or the live work changes. No new
 * objects or textures are ever created per frame, so the stable object and
 * texture count contract (R048.6.1) holds with every window live.
 *
 * R103: building occupancy state modulates window emissive intensity — vacant
 * buildings are dark, construction partially lit, mature buildings full, and
 * abandoned buildings dark again.
 */
// spec: OVERSTORY-CITY-R066, OVERSTORY-CITY-R103
import * as THREE from 'three'
import { floorOccupancy, gridHash, resolveWindows, occupancyAt, type BuildingFunction } from '../activity'

/** One building's live window resolution (the R066 e2e seam samples it). */
export interface NightWindowSample {
  /** The building's id. */
  id: string
  /** The kit archetype the tower was built from. */
  family: string
  /** The schedule function the tower reads as. */
  fn: BuildingFunction
  floors: number
  cols: number
  /** The per-floor lit fraction (0..1), ground floor first. */
  perFloor: number[]
  /** A stable fingerprint of the lit grid at this instant. */
  fingerprint: number
  /** The building's occupancy state, influencing emissive intensity (R103). */
  occupancyState?: string
}

/** The live night-window resolution over every kit building (R066). */
export interface NightWindowReport {
  /** The in-game clock the report was resolved from. */
  clockS: number
  /** True while the clock is inside the schedule's night window. */
  night: boolean
  samples: NightWindowSample[]
  /**
   * Set the building's occupancy state from the model so emissive tracks
   * occupancy transitions (R103).  Call each frame before `update`.
   */
  setOccupancyState(buildingId: string, state: OccupancyState | null): void
}

/** The building functions the kit's district archetypes read as. */
export function buildingFunctionFor(archetype: string): BuildingFunction {
  switch (archetype) {
    case 'gateway':
    case 'studio':
      return 'commercial'
    case 'datahall':
      return 'computing'
    case 'workshop':
    case 'storehouse':
    case 'docks':
      return 'industrial'
    default:
      return 'public'
  }
}

/**
 * Remap one kit building's window geometry onto its occupancy texture: the
 * texture's v axis is the floor index (one row per storey) and its u axis
 * the bay index (one column per facade bay). The kit's window panels all
 * live in the sheet's window row (unit v 0.5–0.9), so the storey is read
 * from the vertex height and the bay from the panel's u span.
 */
export function remapWindowUvForOccupancy(
  geometry: THREE.BufferGeometry,
  opts: { floors: number; floorH: number; baysX: number; baysZ: number; col: number },
): void {
  const uv = geometry.getAttribute('uv')
  const pos = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const { floors, floorH, baysX, baysZ, col } = opts
  const colU0 = col * 0.25
  const cols = Math.max(baysX, baysZ)
  for (let i = 0; i < uv.count; i++) {
    const y = pos.getY(i)
    // The storey a window vertex belongs to: a panel's top edge sits exactly
    // on the next storey's boundary, so the floor index resolves down.
    const floorIndex = Math.min(floors - 1, Math.max(0, Math.floor((y - 1e-4) / floorH)))
    const vUnit = (uv.getY(i) - 0.25) / 0.5 // 0..1 across the building band
    const localV = (vUnit - 0.5) / 0.4 // 0..1 within the window row
    uv.setY(i, (floorIndex + localV) / floors)
    const uUnit = (uv.getX(i) - colU0) / 0.25 // 0..1 across this facade
    // The kit's window panels are axis-aligned: the panel normal picks the
    // facade's bay axis (x on the ±z facades, z on the ±x facades).
    const onZFacade = Math.abs(normal.getZ(i)) >= Math.abs(normal.getX(i))
    const bays = onZFacade ? baysX : baysZ
    const raw = uUnit * bays
    const bay = Math.min(bays - 1, Math.floor(raw - 1e-6))
    uv.setX(i, (bay + (raw - bay)) / cols)
  }
  uv.needsUpdate = true
}

export interface WindowEmissiveHandle {
  /** The storey count the grid resolves over. */
  floors: number
  /** The facade bay count (the grid's column count). */
  cols: number
  /** The building's schedule function. */
  fn: BuildingFunction
  /** The building's occupancy texture (the window material's emissiveMap). */
  texture: THREE.CanvasTexture
  /**
   * Resolve the grid at frame rate for the clock and the live work. Returns
   * true when the texture was redrawn (schedule slot, occupancy or work
   * changed). The material's intensity must follow `anyLit`.
   */
  update(clockS: number | undefined, inFlightCalls: number): boolean
  /**
   * Update the building's occupancy state from the model so the emissive
   * follows occupancy transitions (R103).  Must be called each frame.
   */
  setOccupancyState(state: OccupancyState | undefined | null): void
  /** True while any window is lit. */
  get anyLit(): boolean
  /** The current per-floor lit fraction (0..1), floor-major. */
  get perFloor(): number[]
  /** A stable fingerprint of the current grid. */
  get fingerprint(): number
  /** The schedule occupancy the grid resolved from. */
  get occupancy(): number
  /** The building's occupancy state (R103). */
  get occupancyState(): string
  /** Free the texture. */
  dispose(): void
}

/** Occupancy state values that modulate window emissive intensity (R103). */
export type OccupancyState = 'vacant' | 'construction' | 'new' | 'mature' | 'declining' | 'abandoned'

/** The emissive multiplier for each occupancy state (R103). */
const OCCUPANCY_MULTIPLIER: Record<string, number> = {
  vacant: 0,
  construction: 0.3,
  new: 0.7,
  mature: 1.0,
  declining: 0.3,
  abandoned: 0.0,
}

/** Look up the occupancy-state emissive multiplier (R103). */
export function occupancyMultiplier(state: string | undefined): number {
  return OCCUPANCY_MULTIPLIER[state ?? 'mature'] ?? 1.0
}

/**
 * One building's window-emissive state: a `cols × floors` occupancy canvas
 * in the encoding table's lit colour, resolved from the schedule (R050)
 * and the live in-flight work. Redraws are gated on change, so a building
 * at rest costs nothing per frame.
 */
export function createWindowEmissive(opts: {
  seed: number
  fn: BuildingFunction
  floors: number
  cols: number
  color: number
  /** Occupancy state that modulates emissive intensity (R103). */
  occupancyState?: OccupancyState
}): WindowEmissiveHandle {
  const { seed, fn, floors, cols, color, occupancyState } = opts
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, cols)
  canvas.height = Math.max(1, floors)
  const g = canvas.getContext('2d')
  if (!g) throw new Error('2D canvas context unavailable')
  const litHex = `#${color.toString(16).padStart(6, '0')}`
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false

  let lastKey: string | undefined
  let anyLit = false
  let perFloor: number[] = []
  let fingerprint = 0
  let occupancy = 0
  let occState = occupancyState ?? 'mature'
  let occMult = OCCUPANCY_MULTIPLIER[occState] ?? 1.0
  /** Mutable: set by the caller each frame so the emissive follows the model. */
  let dirty = true

  return {
    floors,
    cols,
    fn,
    texture,
    /**
     * Update the emissive from the schedule + live work.  Also re-reads the
     * occupancy state from the caller so R103 stays in sync with the model.
     * Pass a falsy clock to skip texture work — only the occupancy flag is
     * checked.  Returns true when the texture was redrawn.
     */
    update(clockS: number | undefined, inFlightCalls: number): boolean {
      // R103: re-read occupancy state each call so the emissive follows
      // model transitions (mature → declining → abandoned).
      if (dirty) {
        occMult = OCCUPANCY_MULTIPLIER[occState] ?? 1.0
        dirty = false
      }
      if (clockS === undefined) return false
      const occ = occupancyAt(fn, clockS)
      // Occupancy is reported in 5% steps: the grid only redraws when a step,
      // a schedule slot or the work count actually changes.
      const key = `${Math.round(occ * 20)}:${Math.floor(clockS / 1800)}:${inFlightCalls}`
      if (key === lastKey) return false
      lastKey = key
      const grid = resolveWindows(seed, fn, floors, cols, clockS, inFlightCalls)
      g.fillStyle = '#000'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = litHex
      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < cols; b++) {
          // Texture v grows upward; the grid is floor-major from the ground.
          if (grid[f * cols + b]) g.fillRect(b, canvas.height - 1 - f, 1, 1)
        }
      }
      texture.needsUpdate = true
      anyLit = grid.some((cell) => cell === 1)
      perFloor = floorOccupancy(grid, floors, cols)
      // R103: modulate per-floor lit fraction by occupancy state multiplier.
      for (let i = 0; i < perFloor.length; i++) {
        perFloor[i] *= occMult
      }
      fingerprint = gridHash(grid)
      occupancy = occ
      return true
    },
    /**
     * Set the building's occupancy state so the emissive follows the model
     * (R103).  Must be called each frame before `update`.
     */
    setOccupancyState(state: OccupancyState | undefined | null): void {
      if (state === occState) return
      occState = state ?? 'mature'
      occMult = OCCUPANCY_MULTIPLIER[occState] ?? 1.0
      dirty = true
    },
    dispose(): void {
      texture.dispose()
    },
    // Getters required by the WindowEmissiveHandle interface.
    get anyLit(): boolean {
      return anyLit
    },
    get perFloor(): number[] {
      return perFloor
    },
    get fingerprint(): number {
      return fingerprint
    },
    get occupancy(): number {
      return occupancy
    },
    get occupancyState(): string {
      return occState
    },
  }
}

/**
 * @file enterBuildings.ts
 * @description Building entry / exit system (OVERSTORY-CITY-R019):
 * defines door positions, interior scene info, and the transition logic
 * that moves the player from the street-level city view into a generated
 * building interior.  The interior is a generated room-stage (a small
 * enclosed space) whose door positions are wired back to the exterior.
 *
 * Interior scenes carry: positions, room connections, door positions.
 * Every building with rooms has a matching interior.  `canEnterBuilding`
 * is the guard the UI reads before showing the "Enter" affordance.
 */
// spec: OVERSTORY-CITY-R019
import type { Vec2 } from './layout'
import type { Building } from './sim'

// ---- Types ----------------------------------------------------------------

/** A door on a building wall that the player can walk through. */
export interface BuildingDoor {
  /** Door position in world space (x, z). */
  position: Vec2
  /** Index among the building's doors (for multi-door buildings). */
  doorIndex: number
  /** The building this door belongs to. */
  buildingId: string
  /** Interior level the door leads to (0 = ground floor). */
  interiorLevel: number
}

/**
 * One generated interior scene.  It contains a room stage (the interior
 * group lives below the terrain like the current scene's interior) plus
 * metadata the renderer uses to position the player and to render the
 * interior differently from the city exterior.
 */
export interface InteriorInfo {
  /** Building this interior belongs to. */
  buildingId: string
  /** Door positions inside the interior (where the player stands after entering). */
  doorPositions: Vec2[]
  /** Door positions in exterior world space (to show as interaction points). */
  exteriorDoorPositions: Vec2[]
  /** Height of the interior floor in local interior coordinates. */
  floorHeight: number
  /** Interior ceiling height. */
  ceilingHeight: number
  /** The room descriptions the building carries (from sim.ts Building.rooms). */
  rooms: string[]
  /** The building's visual archetype / category. */
  category: Building['category']
  /** The building's name (for the UI label). */
  name: string
}

/** Camera state for the enterable (street-level) exterior mode. */
export interface ExteriorCameraState {
  /** The camera position when entering this mode. */
  position: Vec2
  /** The Y height at the position. */
  height: number
  /** The yaw angle the camera faces (radians). */
  yaw: number
}

/**
 * The public API returned by the factory.  The renderer (render3d.ts)
 * consumes these functions to wire the city UI into the enterable flow.
 */
export interface EnterableBuildingSystem {
  /**
   * Get all door positions for a building.  Each door can be entered;
   * the renderer shows an "Enter" affordance near the nearest door.
   */
  getDoors(buildingId: string): BuildingDoor[]
  /** Get the generated interior scene info for a building. */
  getInterior(buildingId: string): InteriorInfo | null
  /** Check if a building can be entered (has rooms and a door). */
  canEnter(buildingId: string): boolean
  /**
   * Enter a building through a specific door. Returns the interior camera
   * state (position where the player appears after entering).
   */
  enter(buildingId: string, doorIndex: number): ExteriorCameraState | null
  /**
   * Exit the current building interior, returning to the exterior.
   * Returns the exterior camera state (position the player returns to).
   */
  exit(): ExteriorCameraState | null
  /**
   * Whether the player is currently inside a building interior.
   */
  inside(): boolean
  /**
   * Which building is currently entered (null when in the exterior).
   */
  currentBuilding(): string | null
  /**
   * Initialise the system with the current world buildings.
   * Called once at init and re-called when the world swaps.
   */
  init(buildings: Readonly<Record<string, Building>>): void
  /**
   * Set the exterior camera position / yaw before entering enterable mode.
   * The first-person camera needs a starting point on the street.
   */
  setExteriorCamera(x: number, z: number, yaw: number): void
  /**
   * Tear down all references.
   */
  dispose(): void
}

// ---- Interior generation ---------------------------------------------------

/**
 * Generate an interior scene description for a building.  The interior is
 * a simple rectangular room-stage whose door positions match the exterior
 * doors, and whose rooms come from the building's `rooms` array.
 */
function generateInterior(building: Building): InteriorInfo | null {
  // A building must have at least one room to be enterable.
  if (building.rooms.length === 0) return null

  const exteriorDoor = building.door ? { x: building.door.x, z: building.door.z } : { x: building.x, z: building.z }

  // Door positions inside the interior: a central position on the floor.
  // The interior room stage is 12 × 9 (matching scene.ts), and the player
  // appears near the door side after entering.
  const doorPositions: Vec2[] = [{ x: 0, z: 3.8 }]

  return {
    buildingId: building.id,
    doorPositions,
    exteriorDoorPositions: [exteriorDoor],
    floorHeight: 0,
    ceilingHeight: 5.5,
    rooms: building.rooms,
    category: building.category,
    name: building.name,
  }
}

// ---- Builder ---------------------------------------------------------------

export function createEnterableBuildingSystem(): EnterableBuildingSystem {
  let buildings: Readonly<Record<string, Building>> = {}
  let interiors: Map<string, InteriorInfo> | null = null
  // Current interior state.
  let enteredBuildingId: string | null = null
  let enteredInteriorCamera: ExteriorCameraState | null = null
  // Exterior camera state (set before entering enterable mode).
  let exteriorCamX = 0
  let exteriorCamZ = 0
  let exteriorCamYaw = 0

  // ---- Private helpers --------------------------------------------------
  function resolveInteriors(): void {
    if (interiors) return
    interiors = new Map()
    for (const b of Object.values(buildings)) {
      const info = generateInterior(b)
      if (info) interiors.set(b.id, info)
    }
  }

  return {
    getDoors(buildingId: string): BuildingDoor[] {
      if (!(buildingId in buildings)) return []
      const b = buildings[buildingId]
      const door = b.door ? { x: b.door.x, z: b.door.z } : { x: b.x, z: b.z }
      return [
        {
          position: door,
          doorIndex: 0,
          buildingId,
          interiorLevel: 0,
        },
      ]
    },

    getInterior(buildingId: string): InteriorInfo | null {
      resolveInteriors()
      if (!interiors) return null
      return interiors.get(buildingId) ?? null
    },

    canEnter(buildingId: string): boolean {
      if (!(buildingId in buildings)) return false
      if (interiors === null) resolveInteriors()
      return interiors?.has(buildingId) ?? false
    },

    enter(buildingId: string, _doorIndex: number): ExteriorCameraState | null {
      if (!(buildingId in buildings)) return null
      if (interiors === null) resolveInteriors()
      const interior = (interiors ?? null)?.get(buildingId) ?? null
      if (!interior) return null

      enteredBuildingId = buildingId
      enteredInteriorCamera = {
        position: { x: exteriorCamX, z: exteriorCamZ },
        height: 0,
        yaw: exteriorCamYaw,
      }

      // The player appears at the door position in the interior.
      // We don't return an exterior state here — the renderer handles the
      // transition to the interior view directly.
      return enteredInteriorCamera
    },

    exit(): ExteriorCameraState | null {
      if (!enteredInteriorCamera) return null
      const state = enteredInteriorCamera
      enteredBuildingId = null
      enteredInteriorCamera = null
      return state
    },

    inside(): boolean {
      return enteredBuildingId !== null
    },

    currentBuilding(): string | null {
      return enteredBuildingId
    },

    init(buildingsInput: Readonly<Record<string, Building>>): void {
      buildings = buildingsInput
      interiors = null // invalidate cache
      enteredBuildingId = null
      enteredInteriorCamera = null
    },

    setExteriorCamera(x: number, z: number, yaw: number): void {
      exteriorCamX = x
      exteriorCamZ = z
      exteriorCamYaw = yaw
    },

    dispose(): void {
      buildings = {}
      interiors = null
      enteredBuildingId = null
      enteredInteriorCamera = null
    },
  }
}

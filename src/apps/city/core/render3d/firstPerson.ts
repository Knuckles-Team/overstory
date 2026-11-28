/**
 * @file firstPerson.ts
 * @description First-person camera mode for the city exterior
 * (OVERSTORY-CITY-R019): the player walks the city at street level with WASD
 * movement, mouse look, grounded physics, jumping, and collision against
 * building footprints.  The system lives behind the existing orbit controls
 * so the overview / street views remain fully usable — this is a fourth
 * camera mode layer on top of the shared THREE.PerspectiveCamera.
 */
// spec: OVERSTORY-CITY-R019
import * as THREE from 'three'

import type { Vec2 } from '../layout'
import type { Building } from '../sim'

// ---- Types ----------------------------------------------------------------

/** The four supported camera modes. */
export type CameraMode = 'overview' | 'street' | 'first-person' | 'enterable'

// ---- Constants -------------------------------------------------------------

const PLAYER_HEIGHT = 1.75 // metres from ground to eye level
const PLAYER_SPEED = 6 // metres per second walking
const SPRINT_MULT = 1.8
const JUMP_VELOCITY = 4.5 // m/s
const GRAVITY = 14 // m/s²
const MOUSE_SENSITIVITY = 0.002
const COLLISION_RADIUS = 0.5 // metres: keep player centre outside building footprints

// ---- Helpers ---------------------------------------------------------------

/**
 * Clamp a point outside all known building footprints by pushing it back
 * along the vector from the building centre to the player.
 */
function resolveCollisions(x: number, z: number, buildings: Readonly<Record<string, Building>>): Vec2 {
  let cx = x
  let cz = z
  for (const b of Object.values(buildings)) {
    const hw = b.w / 2 + COLLISION_RADIUS
    const hd = b.d / 2 + COLLISION_RADIUS
    const bx = b.x
    const bz = b.z
    const dx = cx - bx
    const dz = cz - bz
    const overlapX = hw - Math.abs(dx)
    const overlapZ = hd - Math.abs(dz)
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) {
        cx = bx + Math.sign(dx) * hw
      } else {
        cz = bz + Math.sign(dz) * hd
      }
    }
  }
  return { x: cx, z: cz }
}

// ---- Public interface ------------------------------------------------------

/**
 * The FPS camera controller.  Call {@link update} once per frame with the
 * real-time delta (seconds).  The camera position is written directly onto
 * the passed `camera`; the look-direction is read back via `getDirection()`.
 */
export interface FirstPersonCamera {
  /** Change mode and optionally enable pointer-lock (first-person only). */
  setMode(mode: CameraMode): void
  /** Current mode. */
  mode(): CameraMode
  /** One frame of input processing: move, look, physics. */
  update(dt: number, camera: THREE.PerspectiveCamera): void
  /** True while the FPS mode is active (first-person or enterable). */
  active(): boolean
  /** Read the forward vector (local −Z in world space). */
  getDirection(): THREE.Vector3
  /** Read the up vector (always (0,1,0)). */
  getUp(): THREE.Vector3
  /** Read the current Y height of the camera. */
  height(): number
  /** Read current horizontal position (x, z). */
  position2d(): Vec2
  /** Set the initial position when entering this mode. */
  setPosition(x: number, z: number): void
  /**
   * Re-resolve the ground height at the current position using the given
   * ground function (set once at init, re-readable when the scene swaps).
   */
  setGroundHeight(gh: (x: number, z: number) => number): void
  /**
   * Update the building positions used for collision detection.
   * Called whenever the sim world buildings are replaced.
   */
  setBuildings(buildings: Readonly<Record<string, Building>>): void
  /** Attach the DOM key listeners. Call once after creation. */
  attach(): void
  /** Release pointer-lock and all DOM listeners. */
  dispose(): void
}

// ---- Factory ---------------------------------------------------------------

export function createFirstPersonCamera(): FirstPersonCamera {
  // Mode.
  let mode: CameraMode = 'overview'
  let active = false

  // Position state.
  let px = 0
  let pz = 0
  let py = 0
  let startHeight = 0

  // Physics.
  let verticalVelocity = 0
  let grounded = true

  // Rotation (yaw, pitch) in radians.
  let yaw = 0
  let pitch = 0

  // Input state.
  let keysForward = false
  let keysBackward = false
  let keysLeft = false
  let keysRight = false
  let keysShift = false
  let keysSpace = false

  // Callbacks set via public methods.
  let groundHeight: ((x: number, z: number) => number) | null = null
  let buildings: Readonly<Record<string, Building>> | null = null

  // Pointer-lock state.
  let lockEl: HTMLElement | null = null

  // ---- DOM keyboard handlers --------------------------------------------
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keysForward = true
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keysBackward = true
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keysLeft = true
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keysRight = true
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keysShift = true
    if (e.code === 'Space') keysSpace = true
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keysForward = false
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keysBackward = false
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keysLeft = false
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keysRight = false
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keysShift = false
    if (e.code === 'Space') keysSpace = false
  }

  // Pointer-lock mouse look
  const onMouseMove = (e: MouseEvent): void => {
    if (!lockEl) return
    // Only respond when the element is actually locked.
    if (
      !(document.pointerLockElement === lockEl) &&
      !((document as unknown as { mozPointerLockElement: Element | null }).mozPointerLockElement === lockEl)
    ) {
      return
    }
    yaw -= e.movementX * MOUSE_SENSITIVITY
    pitch -= e.movementY * MOUSE_SENSITIVITY
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
  }

  // ---- Public API -------------------------------------------------------
  return {
    setMode(newMode: CameraMode): void {
      mode = newMode
      if (newMode === 'first-person' || newMode === 'enterable') {
        active = true
        if (!grounded) {
          // Transitioning from enterable: keep current (x,z), re-find ground.
          if (groundHeight) {
            py = groundHeight(px, pz) + PLAYER_HEIGHT
            startHeight = py
          }
        }
        // Attach mouse move listener for pointer-lock mouse look.
        document.addEventListener('mousemove', onMouseMove)
      } else {
        active = false
        grounded = true
        verticalVelocity = 0
        lockEl = null // release pointer-lock
        // Remove mouse move listener.
        document.removeEventListener('mousemove', onMouseMove)
      }
    },

    mode(): CameraMode {
      return mode
    },

    update(dt: number, camera: THREE.PerspectiveCamera): void {
      if (!active) return
      const cappedDt = Math.min(0.1, dt)

      // ---- Mouse look → camera quaternion --------------------------------
      const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(euler)

      // ---- Movement ------------------------------------------------------
      const moveSpeed = PLAYER_SPEED * (keysShift ? SPRINT_MULT : 1) * cappedDt
      let dx = 0
      let dz = 0
      if (keysForward) dz -= moveSpeed
      if (keysBackward) dz += moveSpeed
      if (keysLeft) dx -= moveSpeed
      if (keysRight) dx += moveSpeed

      if (dx || dz) {
        const sinYaw = Math.sin(yaw)
        const cosYaw = Math.cos(yaw)
        const worldDx = dx * cosYaw - dz * sinYaw
        const worldDz = dx * sinYaw + dz * cosYaw
        px += worldDx
        pz += worldDz
      }

      // ---- Gravity & jump ------------------------------------------------
      if (grounded && keysSpace) {
        verticalVelocity = JUMP_VELOCITY
        grounded = false
      }
      if (!grounded) {
        verticalVelocity -= GRAVITY * cappedDt
      }
      py += verticalVelocity * cappedDt

      // ---- Ground clamp --------------------------------------------------
      if (groundHeight) {
        const groundY = groundHeight(px, pz) + PLAYER_HEIGHT
        if (py < groundY) {
          py = groundY
          verticalVelocity = 0
          grounded = true
        }
      } else if (py < startHeight) {
        py = startHeight
        verticalVelocity = 0
        grounded = true
      }

      // ---- Collision against buildings -----------------------------------
      if (buildings) {
        const resolved = resolveCollisions(px, pz, buildings)
        px = resolved.x
        pz = resolved.z
      }

      // ---- Write camera position -----------------------------------------
      camera.position.set(px, py, pz)
    },

    active(): boolean {
      return active
    },

    getDirection(): THREE.Vector3 {
      const dir = new THREE.Vector3(0, 0, -1)
      dir.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
      return dir
    },

    getUp(): THREE.Vector3 {
      return new THREE.Vector3(0, 1, 0)
    },

    height(): number {
      return py
    },

    position2d(): Vec2 {
      return { x: px, z: pz }
    },

    setPosition(x: number, z: number): void {
      px = x
      pz = z
      if (groundHeight) {
        py = groundHeight(x, z) + PLAYER_HEIGHT
        startHeight = py
      } else {
        py = PLAYER_HEIGHT
        startHeight = PLAYER_HEIGHT
      }
      grounded = true
      verticalVelocity = 0
    },

    setGroundHeight(gh: (x: number, z: number) => number): void {
      groundHeight = gh
      py = groundHeight(px, pz) + PLAYER_HEIGHT
      startHeight = py
    },

    setBuildings(buildingsInput: Readonly<Record<string, Building>>): void {
      buildings = buildingsInput
    },

    attach(): void {
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('keyup', onKeyUp)
    },

    dispose(): void {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      // Release pointer-lock if active.
      if (lockEl && document.pointerLockElement === lockEl) {
        ;(document as { exitPointerLock?: () => void }).exitPointerLock?.()
      }
      lockEl = null
    },
  }
}

/**
 * @file picking.ts
 * @description Selection and camera focus for the 3D city (part of the
 * render3d/ split, T025): pointer picking maps a click to one character or
 * one building through the scene-graph marks (R011); the focus and overview
 * easings move the orbit controls; the selection ring tracks the selected
 * entity every frame.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OVERVIEW_CAM, OVERVIEW_TARGET } from './scene'
import type { world as SimWorld } from '../sim'
import type { SelectionHit } from '../types'

export type World = typeof SimWorld

interface FocusAnim {
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromCam: THREE.Vector3
  toCam?: THREE.Vector3
  t: number
}

export interface PickingApi {
  /** Ease the view toward one ground point (x, z). */
  focus(x: number, z: number): void
  /** Ease the view back to the city overview. */
  overview(): void
  /** Reflect the current selection (ring). */
  setSelected(hit: SelectionHit | null): void
  /** Ease the focus animation one frame. */
  tick(dtReal: number): void
  /** Track the selection ring one frame. */
  update(timeAcc: number): void
  /** Detach the pointer listeners and remove the selection ring. */
  dispose(): void
}

export function createPicking(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  dom: HTMLCanvasElement,
  world: World,
  controls: OrbitControls,
  onSelect: (hit: SelectionHit | null) => void,
): PickingApi {
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downAt: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent): void => {
    downAt = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent): void => {
    if (!downAt) return
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
    downAt = null
    if (moved > 6) return
    const rect = rendererRect(dom)
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(scene.children, true)
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object
      while (o) {
        if (o.userData.charId) {
          onSelect({ kind: 'character', id: String(o.userData.charId) })
          return
        }
        if (o.userData.entity) {
          onSelect(o.userData.entity as SelectionHit)
          return
        }
        o = o.parent
      }
    }
    onSelect(null)
  }
  dom.addEventListener('pointerdown', onDown)
  dom.addEventListener('pointerup', onUp)

  let focusAnim: FocusAnim | null = null
  function focus(x: number, z: number): void {
    focusAnim = {
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(x, 0.6, z),
      fromCam: camera.position.clone(),
      t: 0,
    }
  }

  function overview(): void {
    focusAnim = {
      fromTarget: controls.target.clone(),
      toTarget: OVERVIEW_TARGET.clone(),
      fromCam: camera.position.clone(),
      toCam: OVERVIEW_CAM.clone(),
      t: 0,
    }
  }

  function tick(dtReal: number): void {
    if (!focusAnim) return
    focusAnim.t += dtReal / 0.8
    const k = focusAnim.t >= 1 ? 1 : 1 - Math.pow(1 - focusAnim.t, 3)
    controls.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, k)
    if (focusAnim.toCam) camera.position.lerpVectors(focusAnim.fromCam, focusAnim.toCam, k)
    if (focusAnim.t >= 1) focusAnim = null
  }

  // ---- Selection marker --------------------------------------------------------
  const selRing = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.8, 32),
    new THREE.MeshBasicMaterial({
      color: 0x37d0c3,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  selRing.rotation.x = -Math.PI / 2
  selRing.position.y = 0.15
  selRing.visible = false
  scene.add(selRing)

  let selectedHit: SelectionHit | null = null
  function setSelected(hit: SelectionHit | null): void {
    selectedHit = hit
    selRing.visible = !!hit
  }

  function update(timeAcc: number): void {
    if (!selectedHit) {
      selRing.visible = false
      return
    }
    const hit = selectedHit // captured so the closures below see the narrowed type
    let p: { x: number; z: number } | null = null
    let s = 1
    if (hit.kind === 'character') {
      const ch = world.characters.find((c) => c.id === hit.id)
      if (ch?.visible) p = ch.pos
    } else {
      const b = hit.id in world.buildings ? world.buildings[hit.id] : null
      if (b) {
        p = { x: b.x, z: b.z }
        s = Math.max(1, Math.max(b.w, b.d) / 2.4)
      }
    }
    if (!p) {
      selRing.visible = false
      return
    }
    selRing.visible = true
    selRing.position.set(p.x, 0.15, p.z)
    selRing.scale.setScalar(s * (1 + 0.08 * Math.sin(timeAcc * 3)))
  }

  function dispose(): void {
    dom.removeEventListener('pointerdown', onDown)
    dom.removeEventListener('pointerup', onUp)
    scene.remove(selRing)
    selRing.geometry.dispose()
    ;(selRing.material as THREE.Material).dispose()
  }

  return { focus, overview, setSelected, tick, update, dispose }
}

/** Bounding-rect read behind the click → NDC conversion. */
function rendererRect(dom: HTMLCanvasElement): DOMRect {
  return dom.getBoundingClientRect()
}

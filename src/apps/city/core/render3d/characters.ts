/**
 * @file characters.ts
 * @description The character layer for the 3D city (OVERSTORY-CITY-R033,
 * built on the shared rig per OVERSTORY-DESIGN-R012.4): every character is
 * a clone of the one pinned shared rig (the borrowed third-party rider
 * roster left the city), skinned on its own cloned skeleton with a
 * per-character AnimationMixer playing the shared eight-clip set — the
 * locomotion clips the rig ships plus the rest completed by
 * `completeClipSet` (R012.4). Silhouette, outfit and colour encode agent
 * type and role through the shared palette's `role-*` tokens (R025); the
 * simulated operators (kind 'npc') wear the core accent and are labelled
 * simulated in the label layer (R005/R023). Names are screen-space labels
 * (labelLayer.ts, R012.7) — the pseudonymous id (R020), not a sprite.
 * State switches crossfade through the shared blender (at most 0.25 s);
 * a failed rig pin degrades to the declared marker placeholder and emits
 * a typed asset.failed event (R010/R013) — never a silent freeze.
 */
import * as THREE from 'three'
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { completeClipSet, createClipBlender, type ClipBlenderApi, type RigClips } from '@/lib/scene3d/characters'
import { SCENE_COLORS } from '@/lib/scene3d/palette'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { bus, makeEvent } from '../events'
import { RIG_PATH, type RoleId } from '../ecosystem'
import { bubbleTexture } from './labels'
import { isMesh } from './scene'
import type { world as SimWorld } from '../sim'

export type World = typeof SimWorld
type Character = (typeof SimWorld.characters)[number]

/** City-world metres: a person is roughly 1.72 m tall, never a landmark. */
const HUMAN_HEIGHT_M = 1.72

/** One character on the shared rig: its clone, mixer, blender and bubble. */
interface CharacterEntry {
  ch: Character
  group: THREE.Group
  root: THREE.Object3D
  distant: THREE.Mesh
  blender: ClipBlenderApi | null
  materials: THREE.Material[]
  /** A ground halo keeps every person findable in a large city overview. */
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  bubble: THREE.Sprite
  lastBubbleText: string | null
  bubbleTimer: number
  placeholder: boolean
}

export interface CharactersApi {
  /** One frame of character updates (clip blend, position, bubble). */
  update(dtReal: number, timeAcc: number): void
  /** Show a speech bubble above one character for a couple of seconds. */
  say(charId: string, text: string): void
  /** Detach from the scene and release this layer's GPU resources. */
  dispose(): void
}

/**
 * Tint one rig clone for its role (R025): the body material takes the
 * role colour from the shared palette — the one source the legend, the
 * 2D schematic and the label layer also read — while the neutral trim
 * (grey) and the dark visor keep the rig's own colours. Every material
 * is cloned per character so the tint stays private and this layer owns
 * its disposal.
 */
function tintForRole(root: THREE.Object3D, role: RoleId): THREE.Material[] {
  // The palette is the single source of role colours (R025): every RoleId
  // maps to a `role-*` token the palette tests keep present.
  const roleColor = SCENE_COLORS[`role-${role}`]
  const clones: THREE.Material[] = []
  const perSource = new Map<THREE.Material, THREE.Material>()
  const cloneOf = (m: THREE.Material): THREE.Material => {
    const existing = perSource.get(m)
    if (existing) return existing
    const c = m.clone()
    if (m.name === 'Main') {
      ;(c as THREE.MeshStandardMaterial).color.set(roleColor.hex)
    }
    perSource.set(m, c)
    clones.push(c)
    return c
  }
  root.traverse((o) => {
    if (!isMesh(o)) return
    if (Array.isArray(o.material)) {
      o.material = o.material.map(cloneOf)
    } else {
      o.material = cloneOf(o.material)
    }
  })
  return clones
}

/**
 * Imported GLBs are authored in many unit systems.  Normalize every shared
 * rig clone from its actual bounds, then put its feet on the ground.  This
 * keeps agents human-scale beside 3–4 m storeys and makes a bad source scale
 * impossible to turn a robot into a building-sized prop.
 */
function normalizeToHumanScale(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const height = bounds.max.y - bounds.min.y
  if (!Number.isFinite(height) || height < 0.001) return
  const factor = HUMAN_HEIGHT_M / height
  root.scale.multiplyScalar(factor)
  root.position.y -= bounds.min.y * factor
}

export async function initCharacters(
  scene: THREE.Scene,
  world: World,
  markerRoot: THREE.Object3D | null,
  loadPinnedGLB: (url: string) => Promise<GLTF>,
  camera?: THREE.Camera,
  groundHeight: (x: number, z: number) => number = () => 0,
): Promise<CharactersApi> {
  const characters = new Map<string, CharacterEntry>()
  const presenceGeo = new THREE.RingGeometry(0.42, 0.58, 16)
  const distantGeo = new THREE.CapsuleGeometry(0.24, 1.15, 3, 6)
  const distantMaterials = new Map<RoleId, THREE.MeshStandardMaterial>()
  // The loader parses a fresh GLB for each layer; this layer owns its source.
  let rigSource: THREE.Object3D | null = null
  let disposed = false

  /**
   * One character on a placeholder rig (the rig pin failed, R010): the
   * declared marker, scaled up. The inner group is the sway root so the
   * outer group keeps the sim's facing.
   */
  function makePlaceholder(ch: Character): { group: THREE.Group; root: THREE.Object3D } {
    const body = markerRoot
      ? markerRoot.clone(true)
      : new THREE.Mesh(
          new THREE.BoxGeometry(0.42, HUMAN_HEIGHT_M, 0.42),
          new THREE.MeshStandardMaterial({ color: 0xff8c42 }),
        )
    if (markerRoot) {
      body.scale.setScalar(1)
      body.position.y = 0
    } else {
      body.position.y = HUMAN_HEIGHT_M / 2
    }
    const root = new THREE.Group()
    root.add(body)
    const group = new THREE.Group()
    group.add(root)
    group.traverse((o) => {
      o.userData.charId = ch.id
    })
    return { group, root }
  }

  async function loadCharacters(): Promise<void> {
    // The one shared rig (R033): loaded once from the verified byte cache,
    // completed to the full clip set before any mixer exists (the bones
    // must be in their rest pose when the derived clips are read).
    let rig: GLTF | null = null
    let clips: RigClips | null = null
    try {
      rig = await loadPinnedGLB(RIG_PATH)
      rigSource = rig.scene
      clips = completeClipSet(rig.scene, rig.animations)
    } catch (err) {
      console.warn('[city] shared rig load failed:', RIG_PATH, err)
      // A failed pin is a visible, simulated event (R010); every
      // character degrades to the declared marker placeholder.
      bus.emit(
        makeEvent('asset.failed', { character: RIG_PATH }, 'Shared character rig unavailable — placeholders in use'),
      )
    }

    for (const ch of world.characters) {
      let group: THREE.Group
      let root: THREE.Object3D
      let blender: ClipBlenderApi | null = null
      let materials: THREE.Material[] = []
      let placeholder = false

      if (rig && clips) {
        // One clone per character: independent bones and skeleton, shared
        // geometry and base materials (SkeletonUtils), then per-character
        // material clones so the role tint stays private and disposable.
        root = cloneRig(rig.scene)
        materials = tintForRole(root, ch.role)
        root.traverse((o) => {
          if (isMesh(o)) o.castShadow = true
          o.userData.charId = ch.id
        })
        normalizeToHumanScale(root)
        const mixer = new THREE.AnimationMixer(root)
        // The fail beat is one-shot: it clamps at its end (a failed agent
        // holds the fall, it does not replay it).
        blender = createClipBlender(mixer, clips, ['fail'])
        group = new THREE.Group()
        group.add(root)
      } else {
        const made = makePlaceholder(ch)
        group = made.group
        root = made.root
        placeholder = true
        normalizeToHumanScale(root)
      }

      // Character rigs have their own pinned-asset QA.  This parent marker
      // keeps their untextured rig pieces and speech UI out of the city-kit
      // material audit, which governs architecture and public-realm surfaces.
      group.userData.marker = 'character-rig'

      let distantMaterial = distantMaterials.get(ch.role)
      if (!distantMaterial) {
        distantMaterial = new THREE.MeshStandardMaterial({
          color: SCENE_COLORS[`role-${ch.role}`].hex,
          roughness: 0.75,
        })
        distantMaterials.set(ch.role, distantMaterial)
      }
      const distant = new THREE.Mesh(distantGeo, distantMaterial)
      distant.position.y = HUMAN_HEIGHT_M / 2
      distant.visible = false
      distant.userData.charId = ch.id
      distant.userData.marker = 'character-distant'
      group.add(distant)

      const bubble = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: null, depthWrite: false, transparent: true, opacity: 0 }),
      )
      bubble.scale.set(2.2, 0.4, 1)
      bubble.position.y = HUMAN_HEIGHT_M + 0.38
      bubble.visible = false
      group.add(bubble)
      const roleColor = SCENE_COLORS[`role-${ch.role}`].hex
      const halo = new THREE.Mesh(
        presenceGeo,
        new THREE.MeshBasicMaterial({
          color: roleColor,
          transparent: true,
          opacity: ch.kind === 'npc' ? 0.78 : 0.54,
          depthWrite: false,
        }),
      )
      halo.rotation.x = -Math.PI / 2
      halo.position.y = 0.08
      // Markers are intentionally untextured semantic affordances, exempt
      // from the surface-material audit like the selected-character ring.
      halo.userData.marker = 'character-presence'
      group.add(halo)
      scene.add(group)
      characters.set(ch.id, {
        ch,
        group,
        root,
        distant,
        blender,
        materials,
        halo,
        bubble,
        lastBubbleText: null,
        bubbleTimer: 0,
        placeholder,
      })
    }
  }

  function speech(entry: CharacterEntry, text: string): void {
    if (entry.lastBubbleText === text && entry.bubbleTimer > 0) return
    entry.lastBubbleText = text
    entry.bubbleTimer = 2.6
    const mat = entry.bubble.material
    // Speech text is rasterized to a fresh canvas texture.  Release the old
    // one before replacing it; otherwise an active city leaks one GPU texture
    // per utterance and its frame time worsens as the demo runs.
    mat.map?.dispose()
    mat.map = bubbleTexture(text)
    mat.needsUpdate = true
    entry.bubble.visible = true
    entry.bubble.material.opacity = 1
  }

  // ---- Per-frame update -------------------------------------------------------
  function update(dtReal: number, timeAcc: number): void {
    for (const entry of characters.values()) {
      const ch = entry.ch
      entry.group.visible = ch.visible
      if (!ch.visible) continue
      entry.group.position.set(ch.pos.x, groundHeight(ch.pos.x, ch.pos.z), ch.pos.z)
      entry.group.rotation.y = ch.facing
      const isDistant = !!camera && camera.position.distanceToSquared(entry.group.position) > 65 * 65
      entry.root.visible = !isDistant
      entry.distant.visible = isDistant
      if (entry.blender) {
        // The state → clip mapping and the ≤0.25 s crossfade are the
        // shared rig's policy (R012.4); the city only names the state.
        entry.blender.playState(ch.state)
        if (!isDistant) entry.blender.update(dtReal)
      } else if (entry.placeholder) {
        // A placeholder is still alive (never frozen): a gentle sway on
        // the inner root, the outer group keeping the sim's facing.
        entry.root.rotation.y = Math.sin(timeAcc * 0.6) * 0.15
      }
      entry.halo.material.opacity = (ch.kind === 'npc' ? 0.62 : 0.42) + 0.18 * (0.5 + 0.5 * Math.sin(timeAcc * 3.2))
      if (entry.bubbleTimer > 0) {
        entry.bubbleTimer -= dtReal
        if (entry.bubbleTimer <= 0) entry.bubble.visible = false
      }
    }
  }

  function say(charId: string, text: string): void {
    const entry = characters.get(charId)
    if (entry) speech(entry, text)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const entry of characters.values()) {
      scene.remove(entry.group)
      entry.blender?.dispose()
      entry.bubble.material.map?.dispose()
      entry.bubble.material.dispose()
      entry.halo.material.dispose()
      // Rig clones share geometry with their parsed source but own their
      // materials and skeletons. Fallback boxes own their own geometry too.
      entry.root.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
        if (entry.placeholder && !markerRoot && isMesh(object)) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) material.dispose()
        }
      })
      for (const m of entry.materials) m.dispose()
    }
    characters.clear()
    presenceGeo.dispose()
    distantGeo.dispose()
    for (const material of distantMaterials.values()) material.dispose()
    if (rigSource) {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      const textures = new Set<THREE.Texture>()
      rigSource.traverse((object) => {
        if (!isMesh(object)) return
        geometries.add(object.geometry)
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
        const sourceMaterial = object.material as THREE.Material | THREE.Material[]
        const ownedMaterials = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial]
        for (const material of ownedMaterials) materials.add(material)
      })
      for (const material of materials) {
        for (const value of Object.values(material as unknown as Record<string, unknown>))
          if (value instanceof THREE.Texture) textures.add(value as THREE.Texture)
        material.dispose()
      }
      for (const geometry of geometries) geometry.dispose()
      for (const texture of textures) texture.dispose()
      rigSource = null
    }
  }

  await loadCharacters()

  return { update, say, dispose }
}

/**
 * @file characters.ts
 * @description Character rigs for the 3D city (part of the render3d/ split,
 * T025): loads the pinned rider GLBs from the startup-verified byte cache
 * (R013), builds the kinematic rig (or the placeholder fallback when a pin
 * is unavailable), tints each character with its role hue (R027: one
 * persistent character per agent — silhouette and colour code the role),
 * and drives the per-frame pose, name tag and speech bubble. Simulated
 * operator characters (kind 'npc') are visually marked, labelled everywhere
 * else (R005/R010).
 */
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { bus, makeEvent } from '../events'
import { bubbleTexture, characterTagTexture } from './labels'
import { isMesh } from './scene'
import type { world as SimWorld } from '../sim'

export type World = typeof SimWorld
type Character = (typeof SimWorld.characters)[number]

type PivotName =
  | 'thigh_l'
  | 'thigh_r'
  | 'shin_l'
  | 'shin_r'
  | 'upper_arm_l'
  | 'upper_arm_r'
  | 'forearm_l'
  | 'forearm_r'
  | 'chest'
  | 'head'
  | 'hips'
  | 'prop'

interface Rig {
  root: THREE.Object3D
  pivots: Partial<Record<PivotName, THREE.Object3D>>
  base: { chestY?: number }
  placeholder?: boolean
}

interface CharacterEntry {
  ch: Character
  rig: Rig
  group: THREE.Group
  tag: THREE.Sprite
  bubble: THREE.Sprite
  lastState: string
  lastBubbleText: string | null
  bubbleTimer: number
}

/**
 * The one-to-one state → colour encoding for character tags (R025): the
 * same table the 2D schematic reads, so both views agree. Simulated
 * operators ('npc') always read gold.
 */
const STATE_COLORS: Record<string, string> = {
  idle: '#8a94a8',
  tasked: '#5ea0ff',
  traveling: '#5ea0ff',
  working: '#ffd166',
  committing: '#b08cff',
  sleeping: '#4a5568',
  awaiting: '#ff6f9c',
  patrolling: '#7fd06f',
}

function stateColor(state: string, kind: string): string {
  if (kind === 'npc') return '#ffd166'
  return STATE_COLORS[state] ?? '#8a94a8'
}

export interface CharactersApi {
  /** One frame of character updates (pose, tag, bubble). */
  update(dtReal: number, timeAcc: number): void
  /** Show a speech bubble above one character for a couple of seconds. */
  say(charId: string, text: string): void
  /** Detach from the scene and release this layer's GPU resources. */
  dispose(): void
}

export async function initCharacters(
  scene: THREE.Scene,
  world: World,
  markerRoot: THREE.Object3D | null,
  loadPinnedGLB: (url: string) => Promise<GLTF>,
): Promise<CharactersApi> {
  const characters = new Map<string, CharacterEntry>()

  function tintRig(root: THREE.Object3D, hue: number): void {
    const seen = new Set<THREE.Material>()
    root.traverse((o) => {
      if (!isMesh(o)) return
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (seen.has(m)) continue
        seen.add(m)
        if (m.name && /skin/i.test(m.name)) continue
        ;(m as THREE.MeshStandardMaterial).color.offsetHSL(hue * 0.09, 0, 0)
      }
    })
  }

  function rigFromGLB(gltf: GLTF): Rig {
    const root = gltf.scene
    const byName: Record<string, THREE.Object3D> = {}
    root.traverse((o) => {
      if (o.name) byName[o.name] = o
    })
    const pivots: Partial<Record<PivotName, THREE.Object3D>> = {}
    const wanted: PivotName[] = [
      'thigh_l',
      'thigh_r',
      'shin_l',
      'shin_r',
      'upper_arm_l',
      'upper_arm_r',
      'forearm_l',
      'forearm_r',
      'chest',
      'head',
      'hips',
      'prop',
    ]
    for (const n of wanted) {
      if (n in byName) pivots[n] = byName[n]
    }
    // Rebuild kinematic chains: knee under hip, elbow under shoulder.
    if (pivots.thigh_l && pivots.shin_l) pivots.thigh_l.attach(pivots.shin_l)
    if (pivots.thigh_r && pivots.shin_r) pivots.thigh_r.attach(pivots.shin_r)
    if (pivots.upper_arm_l && pivots.forearm_l) pivots.upper_arm_l.attach(pivots.forearm_l)
    if (pivots.upper_arm_r && pivots.forearm_r) pivots.upper_arm_r.attach(pivots.forearm_r)
    const base: { chestY?: number } = {}
    if (pivots.chest) base.chestY = pivots.chest.position.y
    return { root, pivots, base }
  }

  function makePlaceholder(): Rig {
    const g = new THREE.Group()
    if (markerRoot) {
      const body = markerRoot.clone(true)
      body.scale.setScalar(1.5)
      body.position.y = 0.3
      g.add(body)
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.4, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xff8c42 }),
      )
      body.position.y = 0.7
      g.add(body)
    }
    return { root: g, pivots: {}, base: {}, placeholder: true }
  }

  async function loadCharacters(): Promise<void> {
    const entries = await Promise.all(
      world.characters.map(async (ch): Promise<{ ch: Character; rig: Rig }> => {
        try {
          const gltf = await loadPinnedGLB(`city-assets/riders/${ch.rider}.glb`)
          const rig = rigFromGLB(gltf)
          tintRig(rig.root, ch.hue)
          rig.root.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = true
          })
          return { ch, rig }
        } catch (err) {
          console.warn('[city] rider load failed:', ch.rider, err)
          // Emitted through the bus so it gets an id and the in-game
          // timestamp; a failed pin is a visible, simulated event (R010).
          bus.emit(makeEvent('asset.failed', { character: ch.rider }, 'Rider model unavailable — placeholder in use'))
          const rig = makePlaceholder()
          return { ch, rig }
        }
      }),
    )
    for (const { ch, rig } of entries) {
      const group = new THREE.Group()
      rig.root.traverse((o) => {
        o.userData.charId = ch.id
      })
      group.add(rig.root)
      const tag = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: characterTagTexture(ch.name, ch.kind === 'npc', stateColor(ch.state, ch.kind)),
          depthWrite: false,
        }),
      )
      tag.scale.set(2.3, 0.43, 1)
      tag.position.y = 2.25
      tag.userData.charId = ch.id
      const bubble = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: null, depthWrite: false, transparent: true, opacity: 0 }),
      )
      bubble.scale.set(2.2, 0.4, 1)
      bubble.position.y = 2.75
      bubble.visible = false
      group.add(rig.root, tag, bubble)
      scene.add(group)
      characters.set(ch.id, {
        ch,
        rig,
        group,
        tag,
        bubble,
        lastState: '',
        lastBubbleText: null,
        bubbleTimer: 0,
      })
    }
  }

  // ---- Pose ------------------------------------------------------------------
  function pose(entry: CharacterEntry, time: number): void {
    const { rig, ch } = entry
    const p = rig.pivots
    if (rig.placeholder) {
      rig.root.rotation.y = ch.facing
      return
    }
    const moving = ch.moving()
    const t = ch.walkPhase
    if (moving) {
      const s = Math.sin(t)
      if (p.thigh_l) p.thigh_l.rotation.x = s * 0.55
      if (p.thigh_r) p.thigh_r.rotation.x = -s * 0.55
      if (p.shin_l) p.shin_l.rotation.x = -0.6 * Math.max(0, Math.sin(t + 2.3))
      if (p.shin_r) p.shin_r.rotation.x = -0.6 * Math.max(0, Math.sin(t + Math.PI + 2.3))
      if (p.upper_arm_l) p.upper_arm_l.rotation.x = -s * 0.42 + 0.08
      if (p.upper_arm_r) p.upper_arm_r.rotation.x = s * 0.42 - 0.08
      if (p.forearm_l) p.forearm_l.rotation.x = -0.4 + 0.18 * Math.sin(t + 1)
      if (p.forearm_r) p.forearm_r.rotation.x = -0.4 - 0.18 * Math.sin(t + 1)
      if (p.chest) p.chest.position.y = (rig.base.chestY ?? 1.08) + 0.02 * Math.sin(t * 2)
    } else {
      const sway = Math.sin(time * 1.3)
      if (p.thigh_l) p.thigh_l.rotation.x *= 0.85
      if (p.thigh_r) p.thigh_r.rotation.x *= 0.85
      if (p.shin_l) p.shin_l.rotation.x *= 0.85
      if (p.shin_r) p.shin_r.rotation.x *= 0.85
      if (p.upper_arm_l) p.upper_arm_l.rotation.x = 0.06 * sway
      if (p.upper_arm_r) p.upper_arm_r.rotation.x = -0.06 * sway
      if (p.forearm_l) p.forearm_l.rotation.x = -0.25
      if (p.forearm_r) p.forearm_r.rotation.x = -0.25
      if (p.chest) p.chest.position.y = (rig.base.chestY ?? 1.08) + 0.012 * Math.sin(time * 2.1)
      if (p.head) p.head.rotation.y = 0.18 * Math.sin(time * 0.6)
    }
    if (ch.state === 'working') {
      const w = Math.sin(time * 5)
      if (p.upper_arm_r) p.upper_arm_r.rotation.x = -1.05 + 0.28 * w
      if (p.forearm_r) p.forearm_r.rotation.x = -0.5 + 0.2 * w
      if (p.prop) p.prop.rotation.z = 0.35 * Math.sin(time * 5)
      if (p.head) p.head.rotation.x = 0.22
    }
    if (ch.state === 'committing') {
      const w = Math.sin(time * 2)
      if (p.upper_arm_l) p.upper_arm_l.rotation.x = -2.1 + 0.08 * w
      if (p.upper_arm_r) p.upper_arm_r.rotation.x = -2.1 - 0.08 * w
      if (p.head) p.head.rotation.x = -0.12
    }
    if (ch.state === 'awaiting') {
      if (p.head) p.head.rotation.y = 0.5 * Math.sin(time * 1.4)
    }
  }

  function speech(entry: CharacterEntry, text: string): void {
    if (entry.lastBubbleText === text && entry.bubbleTimer > 0) return
    entry.lastBubbleText = text
    entry.bubbleTimer = 2.6
    const mat = entry.bubble.material
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
      entry.group.position.set(ch.pos.x, 0, ch.pos.z)
      entry.group.rotation.y = ch.facing
      pose(entry, timeAcc)
      if (entry.lastState !== ch.state + ch.mood) {
        entry.lastState = ch.state + ch.mood
        entry.tag.material.map?.dispose()
        entry.tag.material.map = characterTagTexture(ch.name, ch.kind === 'npc', stateColor(ch.state, ch.kind))
        entry.tag.material.needsUpdate = true
      }
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
    for (const entry of characters.values()) {
      scene.remove(entry.group)
      entry.tag.material.map?.dispose()
      entry.tag.material.dispose()
      entry.bubble.material.map?.dispose()
      entry.bubble.material.dispose()
    }
    characters.clear()
  }

  await loadCharacters()

  return { update, say, dispose }
}

/**
 * @file buildings.ts
 * @description Building and construction visuals for the 3D city (part of
 * the render3d/ split, T025), rebuilt on the shared scene pipeline
 * (OVERSTORY-CITY-R031): connector buildings are kit-built from the
 * building generator (per-district archetype, per-storey window bands),
 * split into a wall geometry and a roof geometry so the two R025 emissive
 * channels — lit windows and error flash — ride their own cloned materials
 * over the one shared trim sheet; core landmarks keep their bespoke
 * silhouettes with trim-sheet PBR; undressed plots get dressed blocks
 * (parks, plazas, lots); construction sites run the R012.5 sequence with
 * the scaffold gated by phase. Colours that encode a fact come from the
 * one encoding table (R025).
 */
// spec: OVERSTORY-CITY-R031, OVERSTORY-CITY-R025
import * as THREE from 'three'
import { SequenceRunner } from '@/lib/scene3d/sequences'
import { ARCHITECTURE, buildingAsset, mulberry32, propAsset, type DistrictArchetype } from '@/lib/scene3d/generators'
import { SCENE_COLORS, TRIM_SHEET } from '@/lib/scene3d/palette'
import { PLOT_W } from '../layout'
import { domainOf } from '../ecosystem'
import { encodingColor } from '../encoding'
import { bus } from '../events'
import { isMesh } from './scene'
import { litWindowSheet, remapUVs, roofFlashSheet, trimSheetTexture } from './trimSheet'
import type { world as SimWorld } from '../sim'

export type World = typeof SimWorld

/** One accent of a core landmark (the parts that animate or glow). */
interface LandmarkBits {
  ring?: THREE.Mesh
  halo?: THREE.Mesh
  core?: THREE.Mesh
  craneArm?: THREE.Group
  tip?: THREE.Mesh
}

interface BuildingEntry {
  group: THREE.Group
  body: THREE.Object3D
  mats: THREE.MeshStandardMaterial[]
  /** The kit's wall material — the 'lit-windows' channel (R025). */
  wallMat: THREE.MeshStandardMaterial | null
  /** Neutral glass material; the only building surface lit by live work. */
  windowMat?: THREE.MeshStandardMaterial | null
  /** The kit's roof material — the 'error-flash' channel (R025). */
  roofMat: THREE.MeshStandardMaterial | null
  /** The archetype the kit was built with (R032: a district style change rebuilds it). */
  archetype?: DistrictArchetype
  /** The door mat mesh (R032: it re-anchors to the door while the building moves). */
  doorMat?: THREE.Mesh | null
  /** The kit's wall and roof geometries (freed when the entry is disposed). */
  coreGeo?: THREE.BufferGeometry | null
  wallGeo?: THREE.BufferGeometry | null
  windowGeo?: THREE.BufferGeometry | null
  roofGeo?: THREE.BufferGeometry | null
  /** The move/rotation tween in flight (R032); null when settled. */
  mv?: { fx: number; fz: number; fr: number; t: number; dur: number } | null
  /** Seconds of 'lights-on' boost left after a construction completes. */
  wallBoost?: number
  /** True while the error-flash channel has touched this landmark's materials. */
  flashActive?: boolean
  height: number
  landmark?: boolean
  bits?: LandmarkBits
}

interface ConstructionEntry {
  group: THREE.Group
  scaffold: THREE.Group
  slabs: THREE.Mesh[]
  armP: THREE.Group
  cable: THREE.Mesh
  hookBlock: THREE.Mesh
  marker?: THREE.Object3D
  /** The R012.5 construction choreography (scaffold phases). */
  runner: SequenceRunner
}

/** The dressing an undressed plot carries (R031: the empty grid becomes dressed blocks). */
export type PlotDressing = 'park' | 'plaza' | 'lot'

/**
 * The dressing an undressed plot gets (R031). A pure function of the plot
 * coordinates — seeded, so the dressed layout is identical on every boot
 * (R014) and the fidelity test can re-derive it from the layout alone.
 */
export function dressingForPlot(x: number, z: number): PlotDressing {
  let h = 2166136261 >>> 0
  h = Math.imul(h ^ (Math.round(x * 1000) | 0), 16777619) >>> 0
  h = Math.imul(h ^ (Math.round(z * 1000) | 0), 19349663) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0
  return (['park', 'plaza', 'lot'] as const)[h % 3]
}

/** Deterministic per-plot seed (R014): the dressing layout never calls Math.random. */
function plotSeed(x: number, z: number): number {
  let h = 2166136261 >>> 0
  for (const v of [Math.round(x * 1000), Math.round(z * 1000)]) {
    h ^= v
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * The district archetypes the city maps its business domains onto
 * (R012.8's per-district vocabulary, consumed through the generator):
 * the core landmark is the gateway; each domain reads its own kit.
 */
const DOMAIN_ARCHETYPE: Record<string, DistrictArchetype> = {
  data: 'datahall',
  dev: 'workshop',
  security: 'storehouse',
  media: 'studio',
  documents: 'storehouse',
  comms: 'docks',
  general: 'workshop',
}

/** Low-chroma building finishes; domain/role colours belong on details. */
const ARCHETYPE_FINISH: Record<DistrictArchetype, string> = {
  gateway: 'facade-stone',
  datahall: 'facade-ocean',
  workshop: 'facade-sand',
  storehouse: 'facade-stone',
  studio: 'facade-sage',
  docks: 'facade-cloud',
}

/**
 * Split the kit geometry into a wall geometry and a roof geometry by the
 * trim sheet's roof row (v 0.70–0.75). The building generator pushes
 * roof, neutral glass and wall rows. Classification is per triangle rather
 * than per vertex so shared band boundaries cannot produce mixed indices.
 */
function splitWallRoof(
  geometry: THREE.BufferGeometry,
): [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry] {
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const idx = geometry.getIndex()
  const ROOF_V0 = 0.699
  const ROOF_V1 = 0.751
  const wallPos: number[] = []
  const wallUv: number[] = []
  const windowPos: number[] = []
  const windowUv: number[] = []
  const roofPos: number[] = []
  const roofUv: number[] = []
  const wallIdx: number[] = []
  const windowIdx: number[] = []
  const roofIdx: number[] = []
  if (idx) {
    const maps = [
      new Int32Array(pos.count).fill(-1),
      new Int32Array(pos.count).fill(-1),
      new Int32Array(pos.count).fill(-1),
    ]
    const positions = [wallPos, windowPos, roofPos]
    const uvs = [wallUv, windowUv, roofUv]
    const indices = [wallIdx, windowIdx, roofIdx]
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i)
      const b = idx.getX(i + 1)
      const c = idx.getX(i + 2)
      const v = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3
      const kind = v >= ROOF_V0 && v <= ROOF_V1 ? 2 : v >= 0.499 && v <= 0.701 ? 1 : 0
      const map = maps[kind]
      const pArr = positions[kind]
      const uvArr = uvs[kind]
      const out = indices[kind]
      for (const source of [a, b, c]) {
        if (map[source] < 0) {
          map[source] = pArr.length / 3
          pArr.push(pos.getX(source), pos.getY(source), pos.getZ(source))
          uvArr.push(uv.getX(source), uv.getY(source))
        }
        out.push(map[source])
      }
    }
  }
  const build = (pArr: number[], uvArr: number[], idxArr: number[]): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pArr, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2))
    if (idxArr.length) g.setIndex(idxArr)
    g.computeVertexNormals()
    return g
  }
  return [build(wallPos, wallUv, wallIdx), build(windowPos, windowUv, windowIdx), build(roofPos, roofUv, roofIdx)]
}

export interface BuildingsApi {
  /** Create visuals for buildings that appeared since the last sync. */
  syncBuildings(): void
  /** One frame of building, plot and construction updates. */
  update(dtReal: number, timeAcc: number): void
  /** Detach from the scene and release this layer's GPU resources. */
  dispose(): void
}

export function createBuildings(scene: THREE.Scene, world: World, markerRoot: THREE.Object3D | null): BuildingsApi {
  const buildingGroups = new Map<string, BuildingEntry>()
  const constructionGroups = new Map<string, ConstructionEntry>()
  const dressingGroups = new Map<string, THREE.Group>()

  // ---- Shared authored maps and materials (R012.2) ------------------------
  const trimTex = trimSheetTexture()
  const litSheet = litWindowSheet()
  const roofSheet = roofFlashSheet()
  const WALL_PATCH = [0.02, 0.26, 0.98, 0.49] as const // the sheet's wall row
  const ROAD_PATCH: readonly [number, number, number, number] = [
    0.02,
    TRIM_SHEET.bands['road-band'][0],
    0.98,
    TRIM_SHEET.bands['road-band'][1],
  ]

  // One shared wall material per family; each building clones it so its
  // emissive channels (lit windows, error flash) are per building.
  const wallTemplate = new THREE.MeshStandardMaterial({
    map: trimTex,
    roughness: 0.9,
    // Kit facades are thin exterior panels. Rendering both sides prevents a
    // reversed bay winding from erasing an entire wall from the overview.
    // The panels remain opaque and depth-writing, so this does not create a
    // transparent-window artifact.
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveMap: litSheet,
    emissiveIntensity: 0,
  })
  const roofTemplate = new THREE.MeshStandardMaterial({
    map: trimTex,
    roughness: 0.9,
    // Roof slabs use the same exterior-panel convention as façades.
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveMap: roofSheet,
    emissiveIntensity: 0,
  })
  const windowTemplate = new THREE.MeshStandardMaterial({
    map: trimTex,
    roughness: 0.32,
    metalness: 0.08,
    color: SCENE_COLORS['window-glass'].hex,
    emissive: 0xffffff,
    emissiveMap: litSheet,
    emissiveIntensity: 0,
  })
  const propMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })
  const doorMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })
  const treeGeo = propAsset({ seed: 1, kind: 'tree' }).geometry
  const benchGeo = propAsset({ seed: 3, kind: 'bench' }).geometry
  const signGeo = propAsset({ seed: 4, kind: 'sign' }).geometry
  const binGeo = propAsset({ seed: 5, kind: 'bin' }).geometry

  /** A trim-sheet standard material tinted to one colour (the tint multiplies the map). */
  function tintMat(hex: number, roughness = 0.9): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ map: trimTex, roughness })
    m.color.setHex(hex)
    return m
  }

  /** One palette role as a hex number (the palette is the colour source of truth). */
  function paletteHex(role: string): number {
    return parseInt(SCENE_COLORS[role].hex.slice(1), 16)
  }

  // ---- Building meshes (kit-built) -----------------------------------------
  /** The district's current archetype (R032): the saved style overrides the derived map. */
  function archetypeFor(b: World['buildings'][string]): DistrictArchetype {
    const domain = domainOf(b.id)
    const styled = domain in world.districtStyles ? world.districtStyles[domain] : undefined
    const derived = domain in DOMAIN_ARCHETYPE ? DOMAIN_ARCHETYPE[domain] : undefined
    return (styled ?? derived ?? 'workshop') as DistrictArchetype
  }

  function makeBuildingMesh(b: World['buildings'][string]): BuildingEntry {
    const g = new THREE.Group()
    // Deterministic per-building seed (R014): the kit variation is identical
    // on every boot.
    let seed = 0
    for (let i = 0; i < b.id.length; i++) seed = (seed * 31 + b.id.charCodeAt(i)) >>> 0
    // The 'building-height' channel (R025): the storey count encodes the
    // served tool count — one visual, one fact.
    const floors = 1 + Math.min(b.toolCount, 5)
    const archetype = archetypeFor(b)
    const asset = buildingAsset({
      seed,
      archetype,
      footprint: [b.w, b.d],
      floors,
    })
    const [wallGeo, windowGeo, roofGeo] = splitWallRoof(asset.geometry)
    const wallMat = wallTemplate.clone()
    const windowMat = windowTemplate.clone()
    const roofMat = roofTemplate.clone()
    // The facade kit is intentionally detailed in thin bays, but it cannot
    // be the building's only structure: even a valid camera angle then lets
    // the viewer see through a window band or a gap between bays.  Put a
    // slightly inset, opaque mass behind the kit.  This gives every building
    // four real walls and a ceiling while keeping the facade/roof channels in
    // front, free of z-fighting.
    const floorHeight = ARCHITECTURE[archetype].floorH
    // A building's mass uses a coherent architectural finish.  The semantic
    // archetype colour remains available for small signage and state details,
    // but never tints a complete glass/wall field into a toy-like role colour.
    const wallColor = paletteHex(ARCHETYPE_FINISH[archetype])
    wallMat.color.setHex(wallColor)
    const coreGeo = new THREE.BoxGeometry(
      Math.max(0.25, b.w - 0.16),
      Math.max(0.25, floors * floorHeight - 0.1),
      Math.max(0.25, b.d - 0.16),
    )
    remapUVs(coreGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    const coreMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.94 })
    coreMat.color.setHex(wallColor)
    const body = new THREE.Group()
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.position.y = (floors * floorHeight - 0.1) / 2
    core.castShadow = true
    core.receiveShadow = true
    const wall = new THREE.Mesh(wallGeo, wallMat)
    wall.castShadow = true
    wall.receiveShadow = true
    const windows = new THREE.Mesh(windowGeo, windowMat)
    windows.castShadow = true
    windows.receiveShadow = true
    const roof = new THREE.Mesh(roofGeo, roofMat)
    roof.castShadow = true
    body.add(core, wall, windows, roof)
    body.userData.entity = { kind: 'building', id: b.id }
    g.add(body)
    // Door mat on the road (the shared trim sheet's road band).
    let doorMatMesh: THREE.Mesh | null = null
    if (b.door) {
      const matGeo = new THREE.PlaneGeometry(1.6, 1.2)
      remapUVs(matGeo, ROAD_PATCH[0], ROAD_PATCH[1], ROAD_PATCH[2], ROAD_PATCH[3])
      doorMatMesh = new THREE.Mesh(matGeo, doorMat)
      doorMatMesh.rotation.x = -Math.PI / 2
      doorMatMesh.position.set(b.door.x - b.x, 0.035, b.door.z - b.z)
      g.add(doorMatMesh)
    }
    g.position.set(b.x, 0, b.z)
    g.rotation.y = (b.rot * Math.PI) / 180
    scene.add(g)
    const entry: BuildingEntry = {
      group: g,
      body,
      mats: [coreMat, wallMat, windowMat, roofMat],
      wallMat,
      windowMat,
      roofMat,
      archetype,
      doorMat: doorMatMesh,
      coreGeo,
      wallGeo,
      windowGeo,
      roofGeo,
      height: floors * floorHeight,
    }
    buildingGroups.set(b.id, entry)
    return entry
  }

  /**
   * Rebuild one connector building's kit (R032): the district style changed
   * under it, so the old geometry and materials are freed and the building is
   * recreated from the current archetype at its live position and rotation.
   */
  function rebuildBuilding(id: string): void {
    if (!(id in world.buildings)) return
    const b = world.buildings[id]
    if (b.category !== 'connector') return
    const old = buildingGroups.get(id)
    if (!old) return
    scene.remove(old.group)
    old.coreGeo?.dispose()
    old.wallGeo?.dispose()
    old.windowGeo?.dispose()
    old.roofGeo?.dispose()
    old.mats.forEach((m) => {
      m.dispose()
    })
    buildingGroups.delete(id)
    makeBuildingMesh(b)
  }

  // Landmark-specific geometry (core components get bespoke silhouettes).
  // Every surface is trim-sheet PBR (R012.2); the glow accents are declared
  // markers (audit-exempt).
  function buildLandmark(b: World['buildings'][string]): void {
    const g = new THREE.Group()
    const stone = tintMat(paletteHex('wall-gateway'))
    const stoneDark = tintMat(paletteHex('wall-gateway'), 0.95)
    stoneDark.color.multiplyScalar(0.5)
    const bits: LandmarkBits = {}
    const add = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, marker?: string): THREE.Mesh => {
      remapUVs(geo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
      const m = new THREE.Mesh(geo, mat)
      m.castShadow = true
      m.userData.entity = { kind: 'building', id: b.id }
      if (marker) m.userData.marker = marker
      g.add(m)
      return m
    }

    if (b.kind === 'gate') {
      const plaza = new THREE.Mesh(
        new THREE.BoxGeometry(14, 0.18, 14),
        new THREE.MeshStandardMaterial({ map: trimTex, roughness: 1 }),
      )
      remapUVs(plaza.geometry, ROAD_PATCH[0], ROAD_PATCH[1], ROAD_PATCH[2], ROAD_PATCH[3])
      plaza.position.y = 0.09
      plaza.receiveShadow = true
      plaza.userData.entity = { kind: 'building', id: b.id }
      g.add(plaza)
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(3.4, 11, 3.4), stone).position.set(s * 6.2, 5.5, 0)
        add(new THREE.BoxGeometry(3.7, 1, 3.7), stoneDark).position.set(s * 6.2, 9.4, 0)
      }
      const arch = add(new THREE.BoxGeometry(15.8, 2, 3), stone)
      arch.position.y = 11.4
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4.6, 0.14, 10, 40),
        new THREE.MeshBasicMaterial({
          color: 0x3e634f,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
        }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 7.6
      ring.userData.marker = 'landmark-accent'
      ring.userData.entity = { kind: 'building', id: b.id }
      g.add(ring)
      bits.ring = ring
    } else if (b.kind === 'vault') {
      add(new THREE.CylinderGeometry(5.2, 5.4, 1.2, 6), stoneDark).position.y = 0.6
      add(new THREE.CylinderGeometry(4.5, 4.8, 6.4, 6), stone).position.y = 4.4
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x2a2344, emissive: 0xb08cff, emissiveIntensity: 1.4 }),
      )
      core.position.y = 4.8
      core.userData.marker = 'landmark-accent'
      g.add(core)
      bits.core = core
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(3.3, 0.1, 8, 44),
        new THREE.MeshBasicMaterial({
          color: 0x3e634f,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
        }),
      )
      halo.position.y = 8.8
      halo.rotation.x = 1.15
      halo.userData.marker = 'landmark-accent'
      g.add(halo)
      bits.halo = halo
    } else if (b.kind === 'works') {
      add(new THREE.BoxGeometry(b.w, 5, b.d), stone).position.y = 2.5
      for (let i = -1; i <= 1; i++) {
        const prism = add(new THREE.CylinderGeometry(2.4, 2.4, b.d * 0.94, 3), stoneDark)
        prism.rotation.z = Math.PI / 2
        prism.rotation.x = Math.PI / 2
        prism.position.set(0, 6.1, i * 2.6)
      }
      const mast = add(new THREE.BoxGeometry(0.35, 9.5, 0.35), stoneDark)
      mast.position.set(b.w / 2 - 1, 4.7, b.d / 2 - 1)
      const arm = add(new THREE.BoxGeometry(6.5, 0.28, 0.28), stoneDark)
      arm.position.y = 9.3
      const armPivot = new THREE.Group()
      armPivot.position.set(b.w / 2 - 1, 9.3, b.d / 2 - 1)
      armPivot.add(arm)
      g.add(armPivot)
      bits.craneArm = armPivot
    } else if (b.kind === 'tower') {
      // The glass tower samples the sheet's window band — the facade is glass.
      const glass = new THREE.MeshStandardMaterial({
        map: trimTex,
        color: 0x87aaba,
        roughness: 0.25,
        metalness: 0.3,
        emissive: 0x3e634f,
        emissiveIntensity: 0.35,
      })
      const bodyGeo = new THREE.BoxGeometry(b.w, 20, b.d)
      remapUVs(bodyGeo, 0.02, 0.5, 0.98, 0.7)
      const body = new THREE.Mesh(bodyGeo, glass)
      body.castShadow = true
      body.userData.entity = { kind: 'building', id: b.id }
      g.add(body)
      add(new THREE.BoxGeometry(b.w + 0.6, 1.2, b.d + 0.6), stoneDark).position.y = 20.6
      add(new THREE.CylinderGeometry(0.07, 0.12, 3.4, 6), stoneDark).position.y = 22.6
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x552222, emissive: 0xff4444, emissiveIntensity: 2 }),
      )
      tip.position.y = 24.4
      tip.userData.marker = 'landmark-accent'
      g.add(tip)
      bits.tip = tip
    } else if (b.kind === 'kiosk') {
      add(new THREE.BoxGeometry(b.w, 0.9, b.d), stoneDark).position.y = 0.45
      add(new THREE.BoxGeometry(3.4, 2.6, 3.4), stone).position.y = 2.2
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.4),
        new THREE.MeshStandardMaterial({ map: trimTex, color: 0x0d1410, emissive: 0x7dffab, emissiveIntensity: 0.9 }),
      )
      remapUVs(screen.geometry, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
      screen.position.set(0, 2.3, b.d / 2 + 0.05)
      screen.userData.marker = 'display'
      screen.userData.entity = { kind: 'building', id: b.id }
      g.add(screen)
    } else if (b.kind === 'pavilion') {
      add(new THREE.BoxGeometry(b.w, 0.5, b.d), stoneDark).position.y = 0.25
      add(new THREE.BoxGeometry(b.w, 0.28, b.d), stone).position.y = 3.2
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const post = add(new THREE.BoxGeometry(0.22, 3.2, 0.22), stoneDark)
          post.position.set(sx * (b.w / 2 - 0.4), 1.6, sz * (b.d / 2 - 0.4))
        }
      add(new THREE.BoxGeometry(2.2, 0.9, 0.9), tintMat(0x3a4150)).position.set(0, 0.95, -0.8)
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 1.5),
        new THREE.MeshStandardMaterial({ map: trimTex, color: 0x140d14, emissive: 0xff8fb3, emissiveIntensity: 0.9 }),
      )
      remapUVs(screen.geometry, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
      screen.position.set(0, 2, -0.85)
      screen.userData.marker = 'display'
      g.add(screen)
    } else if (b.kind === 'dock') {
      add(new THREE.BoxGeometry(b.w, 0.7, b.d), stone).position.y = 0.35
      add(new THREE.BoxGeometry(b.w + 1.4, 0.24, b.d + 1), stoneDark).position.y = 0.8
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const post = add(new THREE.BoxGeometry(0.24, 3, 0.24), stoneDark)
          post.position.set(sx * (b.w / 2 - 0.5), 2.3, sz * (b.d / 2 - 0.5))
        }
      add(new THREE.BoxGeometry(b.w - 0.6, 0.3, b.d - 0.6), stone).position.y = 3.9
      const crateTints = [
        SCENE_COLORS['role-operations'].hex,
        SCENE_COLORS['role-maintenance'].hex,
        SCENE_COLORS['role-security'].hex,
      ]
      for (let i = 0; i < 3; i++) {
        const crate = add(new THREE.BoxGeometry(1, 1, 1), tintMat(parseInt(crateTints[i].slice(1), 16)))
        crate.position.set(-1.6 + i * 1.5, 1.3, 0)
        crate.rotation.y = i * 0.5
      }
    }

    g.position.set(b.x, 0, b.z)
    scene.add(g)
    buildingGroups.set(b.id, {
      group: g,
      body: g,
      mats: [],
      wallMat: null,
      roofMat: null,
      height: 12,
      landmark: true,
      bits,
    })
  }

  // ---- Construction rig -----------------------------------------------------
  function makeConstruction(plot: World['plots'][number]): ConstructionEntry {
    const g = new THREE.Group()
    g.position.set(plot.x, 0, plot.z)
    const h = 5.5
    const scaffoldMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.85 })
    scaffoldMat.color.setHex(encodingColor('scaffolding')) // the 'scaffolding' channel (R025)
    const concreteMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })
    concreteMat.color.setHex(0xc5cfc1)
    const scaffold = new THREE.Group()
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const postGeo = new THREE.BoxGeometry(0.12, h, 0.12)
        remapUVs(postGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
        const post = new THREE.Mesh(postGeo, scaffoldMat)
        post.position.set(sx * (PLOT_W / 2 - 0.3), h / 2, sz * (PLOT_W / 2 - 0.3))
        post.castShadow = true
        scaffold.add(post)
      }
    const beamGeo = new THREE.BoxGeometry(PLOT_W, 0.1, 0.12)
    remapUVs(beamGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    const beam = new THREE.Mesh(beamGeo, scaffoldMat)
    beam.position.y = h
    scaffold.add(beam)
    const beam2 = new THREE.Mesh(beamGeo.clone(), scaffoldMat)
    remapUVs(beam2.geometry, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    beam2.rotation.y = Math.PI / 2
    beam2.position.y = h * 0.66
    scaffold.add(beam2)
    // Crane.
    const crane = new THREE.Group()
    crane.position.set(PLOT_W / 2 + 1.2, 0, PLOT_W / 2 + 1.2)
    const mastGeo = new THREE.BoxGeometry(0.4, 13, 0.4)
    remapUVs(mastGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    const mast = new THREE.Mesh(mastGeo, concreteMat)
    mast.position.y = 6.5
    mast.castShadow = true
    const armP = new THREE.Group()
    armP.position.y = 12.6
    const armGeo = new THREE.BoxGeometry(8, 0.3, 0.3)
    remapUVs(armGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    const arm = new THREE.Mesh(armGeo, scaffoldMat)
    arm.position.x = -3.5
    armP.add(arm)
    const cableGeo = new THREE.BoxGeometry(0.05, 4, 0.05)
    remapUVs(cableGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    const cable = new THREE.Mesh(cableGeo, scaffoldMat)
    cable.position.set(-6.5, -2, 0)
    armP.add(cable)
    const hookGeo = new THREE.BoxGeometry(1.8, 1.2, 1.8)
    remapUVs(hookGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    const hookBlock = new THREE.Mesh(hookGeo, concreteMat)
    hookBlock.position.set(-6.5, -4.4, 0)
    armP.add(hookBlock)
    crane.add(mast, armP)
    // Marker cube (the pinned placeholder asset — a declared marker).
    let marker: THREE.Object3D | undefined
    if (markerRoot) {
      const cube = markerRoot.clone(true)
      cube.traverse((o) => {
        o.userData.marker = 'construction-marker'
      })
      cube.scale.setScalar(2.4)
      cube.position.y = 0.4
      g.add(cube)
      marker = cube
    }
    // Rising slabs.
    const slabs: THREE.Mesh[] = []
    const n = 6
    const slabGeo = new THREE.BoxGeometry(PLOT_W - 0.6, (h - 0.4) / n, PLOT_W - 0.6)
    remapUVs(slabGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
    for (let i = 0; i < n; i++) {
      const slab = new THREE.Mesh(slabGeo, concreteMat)
      slab.position.y = 0.2 + (i + 0.5) * ((h - 0.4) / n)
      slab.scale.y = 0.001
      g.add(slab)
      slabs.push(slab)
    }
    g.add(scaffold, crane)
    scene.add(g)
    // The construction choreography (R012.5): the scaffold raises with the
    // sequence's phases; the sim's progress drives the slabs in parallel
    // (game time), and completion removes the rig and lights the windows.
    const runner = new SequenceRunner()
    runner.play('construction', {
      onStep(progress) {
        scaffold.visible = progress >= 0.24 && progress < 0.82
      },
      onDone() {
        scaffold.visible = true // the scaffolding channel surface persists
      },
    })
    return { group: g, scaffold, slabs, armP, cable, hookBlock, marker, runner }
  }

  function disposeConstruction(entry: ConstructionEntry): void {
    scene.remove(entry.group)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    entry.group.traverse((object) => {
      if (!isMesh(object) || object.userData.marker === 'construction-marker') return
      geometries.add(object.geometry)
      const material = object.material
      if (Array.isArray(material)) material.forEach((item) => materials.add(item))
      else materials.add(material)
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
  }

  // ---- Dressed blocks (undressed plots: parks, plazas, lots) -----------------
  const dressingPatchGeo = new THREE.PlaneGeometry(8, 8)
  const parkMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 1 })
  parkMat.color.setHex(0xb5c5ab) // the palette's park green
  const plazaPatchGeo = new THREE.PlaneGeometry(8, 8)
  remapUVs(plazaPatchGeo, ROAD_PATCH[0], ROAD_PATCH[1], ROAD_PATCH[2], ROAD_PATCH[3])
  const plazaMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })

  function makeDressing(plot: World['plots'][number]): THREE.Group {
    const g = new THREE.Group()
    g.position.set(plot.x, 0, plot.z)
    const kind = dressingForPlot(plot.x, plot.z)
    const patch = new THREE.Mesh(
      kind === 'plaza' ? plazaPatchGeo : dressingPatchGeo,
      kind === 'plaza' ? plazaMat : parkMat,
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.y = 0.03
    patch.receiveShadow = true
    g.add(patch)
    const rand = mulberry32(plotSeed(plot.x, plot.z))
    const addProp = (geo: THREE.BufferGeometry, px: number, pz: number, s: number): void => {
      const m = new THREE.Mesh(geo, propMat)
      m.position.set(px, 0, pz)
      m.scale.setScalar(s)
      m.castShadow = true
      g.add(m)
    }
    if (kind === 'park') {
      addProp(treeGeo, -1.8 + rand() * 1.2, -1.2 + rand() * 1.2, 0.9 + rand() * 0.25)
      addProp(treeGeo, 1.6, 1.3, 0.9 + rand() * 0.25)
    } else if (kind === 'plaza') {
      addProp(benchGeo, -1.2, -1.5, 1)
      addProp(signGeo, 1.6, 1.4, 1)
    } else {
      addProp(binGeo, -1.4, 1.2, 1)
      addProp(signGeo, 1.5, -1.5, 0.9)
    }
    g.userData.dressing = `${plot.x}:${plot.z}`
    scene.add(g)
    return g
  }

  // ---- Planned-plot markers (every registered pack keeps a visible marker) ---
  // Reserved connectors used to paint a nearly full-plot translucent square
  // for every future building, producing the pale checkerboard at city zoom.
  // A compact site beacon carries the same state without obscuring streets,
  // terrain or neighbouring parcels.
  const plotMarkerGeo = new THREE.RingGeometry(0.34, 0.54, 12)
  const plotMarkerMat = new THREE.MeshBasicMaterial({
    color: encodingColor('scaffolding'),
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  })
  const reservedMarkers = new Map<string, THREE.Mesh>()

  // ---- Commit pulses at the vault ---------------------------------------------
  const pulses: { mesh: THREE.Mesh; t: number }[] = []
  // Reuse this small accumulator every frame.  A fresh object at 60 Hz is
  // individually cheap but becomes a persistent young-generation pressure
  // when the simulation is left running for hours.
  const inFlight = new Map<string, number>()
  const pulseGeo = new THREE.RingGeometry(1.1, 1.5, 32)
  const unsubPulse = bus.subscribe((evt) => {
    if (evt.type === 'knowledge.committed') {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb08cff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Mesh(pulseGeo, mat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(-15, 0.3, -15)
      ring.userData.marker = 'commit-pulse'
      scene.add(ring)
      pulses.push({ mesh: ring, t: 0 })
    }
  })

  // ---- Per-frame sync ---------------------------------------------------------
  function syncBuildings(): void {
    // Buildings created at runtime by the sim (onboarding) appear here.
    for (const b of Object.values(world.buildings)) {
      if (buildingGroups.has(b.id)) continue
      if (b.category === 'core') buildLandmark(b)
      else makeBuildingMesh(b)
      const plot = world.plots.find((p) => p.buildingId === b.id)
      const entry = buildingGroups.get(b.id)
      if (plot?.construction && entry) entry.group.visible = false
    }
  }

  // ---- 'door-queue' channel (R025): pending approvals at the arbora gate -----
  // One small figure per task in 'pending_approval', coloured from the table;
  // the queue length is the fact, nothing else.
  const queueFigGeo = new THREE.CapsuleGeometry(0.11, 0.3, 2, 6)
  remapUVs(queueFigGeo, WALL_PATCH[0], WALL_PATCH[1], WALL_PATCH[2], WALL_PATCH[3])
  const queueFigMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.7 })
  queueFigMat.color.setHex(encodingColor('door-queue'))
  const queueFigs: THREE.Mesh[] = []

  function updateDoorQueue(): void {
    const gate = 'arbora' in world.buildings ? world.buildings.arbora : null
    const door = gate?.door
    const pending = world.tasks.filter((t) => t.state === 'pending_approval').length
    while (queueFigs.length < pending) {
      const fig = new THREE.Mesh(queueFigGeo, queueFigMat)
      fig.castShadow = true
      scene.add(fig)
      queueFigs.push(fig)
    }
    while (queueFigs.length > pending) {
      const fig = queueFigs.pop()
      if (fig) scene.remove(fig)
    }
    if (door) {
      queueFigs.forEach((fig, i) => {
        fig.position.set(door.x + 0.55 + i * 0.32, 0.26, door.z + 1.15)
      })
    }
  }

  function update(dtReal: number, timeAcc: number): void {
    // 'lit-windows' channel (R025): one working agent per building is one
    // in-flight tool call; nothing else lights the windows — no night floor,
    // no flash mixed in (one channel, one fact).
    inFlight.clear()
    for (const c of world.characters) {
      if (c.state === 'working' && c.task?.buildingId) {
        const bid = c.task.buildingId
        inFlight.set(bid, (inFlight.get(bid) ?? 0) + 1)
      }
    }

    // Buildings: windows, flash, landmark animation.
    for (const [id, entry] of buildingGroups) {
      const b = id in world.buildings ? world.buildings[id] : null
      if (!b) continue
      if (entry.wallBoost) entry.wallBoost = Math.max(0, entry.wallBoost - dtReal)
      if (entry.windowMat) {
        const calls = inFlight.get(id) ?? 0
        entry.windowMat.emissiveIntensity = Math.min(1.5, calls * 0.45) + (entry.wallBoost ?? 0) * 0.75
      }
      // 'error-flash' channel (R025): while a recent error is fresh the roof
      // lights up in the table's red (the roof sheet is painted in it).
      if (entry.roofMat) {
        entry.roofMat.emissiveIntensity = b.flash > 0 ? Math.min(2.5, b.flash * 2) : 0
      }
      if (entry.landmark) {
        if (b.flash > 0) {
          entry.flashActive = true
          entry.group.traverse((o) => {
            if (!isMesh(o) || !(o.material instanceof THREE.MeshStandardMaterial)) return
            const m = o.material
            if (m.userData.baseEmissive === undefined) {
              m.userData.baseEmissive = m.emissive.getHex()
              m.userData.baseIntensity = m.emissiveIntensity
            }
            m.emissive.setHex(encodingColor('error-flash'))
            m.emissiveIntensity = Math.min(2.5, 0.5 + b.flash * 2)
          })
        } else if (entry.flashActive) {
          entry.group.traverse((o) => {
            if (!isMesh(o) || !(o.material instanceof THREE.MeshStandardMaterial)) return
            const m = o.material
            const baseEmissive = m.userData.baseEmissive as number | undefined
            const baseIntensity = m.userData.baseIntensity as number | undefined
            if (baseEmissive !== undefined) {
              m.emissive.setHex(baseEmissive)
              m.emissiveIntensity = baseIntensity ?? 0
            }
          })
          entry.flashActive = false
        }
      }
      if (entry.bits?.ring) entry.bits.ring.rotation.z = timeAcc * 0.4
      if (entry.bits?.halo) entry.bits.halo.rotation.z = timeAcc * 0.6
      if (entry.bits?.core)
        (entry.bits.core.material as THREE.MeshStandardMaterial).emissiveIntensity =
          1.2 + 0.5 * Math.sin(timeAcc * 2.2)
      if (entry.bits?.craneArm) entry.bits.craneArm.rotation.y = Math.sin(timeAcc * 0.35) * 0.9
      if (entry.bits?.tip)
        (entry.bits.tip.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(timeAcc * 3) * 1.2
      // District style (R032): a saved style that differs from the archetype
      // the kit was built with rebuilds the connector's kit (freed, then
      // recreated from the current style at its live position and rotation).
      if (!entry.landmark && entry.archetype !== undefined && entry.archetype !== archetypeFor(b)) {
        rebuildBuilding(id)
        continue
      }
      // The layout edit's move/rotation tween (R032): the group's position or
      // rotation differs from the live world state — a saved document was
      // applied — so the building eases to it over 0.9 s (easeInOutCubic) on
      // the shortest rotation path, and the door mat re-anchors to the door's
      // world point every frame until the landing is exact.
      const gpos = entry.group.position
      const targetRot = (b.rot * Math.PI) / 180
      if (entry.mv) {
        const mv = entry.mv
        mv.t = Math.min(mv.dur, mv.t + dtReal)
        const k = mv.t / mv.dur
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
        gpos.x = mv.fx + (b.x - mv.fx) * e
        gpos.z = mv.fz + (b.z - mv.fz) * e
        entry.group.rotation.y = mv.fr + (targetRot - mv.fr) * e
        if (entry.doorMat && b.door) {
          entry.doorMat.position.set(b.door.x - gpos.x, 0.035, b.door.z - gpos.z)
        }
        if (mv.t >= mv.dur) {
          gpos.x = b.x
          gpos.z = b.z
          entry.group.rotation.y = targetRot
          entry.mv = null
        }
      } else if (
        Math.abs(gpos.x - b.x) > 1e-3 ||
        Math.abs(gpos.z - b.z) > 1e-3 ||
        Math.abs(entry.group.rotation.y - targetRot) > 1e-3
      ) {
        // Shortest path: normalize the start rotation so the delta is ±π or less.
        let fr = entry.group.rotation.y
        while (targetRot - fr > Math.PI) fr += Math.PI * 2
        while (targetRot - fr < -Math.PI) fr -= Math.PI * 2
        entry.mv = { fx: gpos.x, fz: gpos.z, fr, t: 0, dur: 0.9 }
      }
    }

    // Commit pulses.
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]
      p.t += dtReal
      const k = p.t / 1.3
      if (k >= 1) {
        scene.remove(p.mesh)
        const mats = p.mesh.material
        if (Array.isArray(mats))
          mats.forEach((m) => {
            m.dispose()
          })
        else mats.dispose()
        pulses.splice(i, 1)
        continue
      }
      p.mesh.scale.setScalar(1 + k * 6)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k)
    }

    // Dressed blocks: an undressed plot keeps its dressing until a building,
    // a construction or a reservation takes the plot (R031).
    for (const plot of world.plots) {
      const key = `${plot.x}:${plot.z}`
      const undressed = !plot.buildingId && !plot.construction && !plot.reservedName
      const g = dressingGroups.get(key)
      if (undressed && !g) {
        dressingGroups.set(key, makeDressing(plot))
      } else if (!undressed && g) {
        scene.remove(g)
        dressingGroups.delete(key)
      }
    }

    // Planned plots: every reserved plot keeps a faint marker; its name is a
    // screen-space label (the label layer, R012.7).
    for (const plot of world.plots) {
      const key = `${plot.x}:${plot.z}`
      const wants = !plot.buildingId && !plot.construction && plot.reservedName !== null
      let marker = reservedMarkers.get(key)
      if (wants) {
        if (!marker) {
          marker = new THREE.Mesh(plotMarkerGeo, plotMarkerMat)
          marker.rotation.x = -Math.PI / 2
          marker.position.set(plot.x, 0.04, plot.z)
          marker.userData.marker = 'reserved-plot'
          scene.add(marker)
          reservedMarkers.set(key, marker)
        }
      } else if (marker) {
        scene.remove(marker)
        reservedMarkers.delete(key)
      }
    }

    // Construction sync.
    for (const plot of world.plots) {
      const key = `${plot.x}:${plot.z}`
      if (plot.construction) {
        let c = constructionGroups.get(key)
        if (!c) {
          c = makeConstruction(plot)
          constructionGroups.set(key, c)
        }
        c.runner.update(dtReal * 1000)
        const prog = plot.construction.progress
        // The finished building stays hidden while the rig is up.
        const fEntry = plot.buildingId ? buildingGroups.get(plot.buildingId) : undefined
        if (fEntry) fEntry.group.visible = false
        const n = c.slabs.length
        const full = Math.floor(prog * n)
        const frac = prog * n - full
        c.slabs.forEach((slab, i) => {
          const target = i < full ? 1 : i === full ? frac : 0
          slab.scale.y = Math.max(0.001, slab.scale.y + (target - slab.scale.y) * Math.min(1, dtReal * 6))
        })
        c.armP.rotation.y = Math.sin(timeAcc * 0.5 + plot.x) * 0.8
        const drop = 2 * (1 - frac)
        c.cable.scale.y = 1 + drop * 0.5
        c.hookBlock.position.y = -4.4 + drop
        if (c.marker) c.marker.rotation.y = timeAcc * 1.2
      } else if (constructionGroups.has(key)) {
        const done = constructionGroups.get(key)
        if (done) {
          disposeConstruction(done)
        }
        constructionGroups.delete(key)
        // Reveal the finished building with a pop and lights on (the
        // 'lights-on' beat of the construction sequence).
        const bid = plot.buildingId
        const entry = bid ? buildingGroups.get(bid) : undefined
        if (entry) {
          entry.group.visible = true
          entry.group.scale.setScalar(0.7)
          entry.wallBoost = 2
        }
      }
    }

    // 'door-queue' channel: pending approvals at the arbora gate (R025).
    updateDoorQueue()

    // Building reveal pop.
    for (const [id, entry] of buildingGroups) {
      const b = id in world.buildings ? world.buildings[id] : null
      if (b && b.fresh > 900) b.fresh = 900
      if (entry.group.scale.x < 1) entry.group.scale.setScalar(Math.min(1, entry.group.scale.x + dtReal * 2.5))
    }
  }

  function dispose(): void {
    unsubPulse()
    for (const pulse of pulses) {
      scene.remove(pulse.mesh)
      const materials = Array.isArray(pulse.mesh.material) ? pulse.mesh.material : [pulse.mesh.material]
      for (const material of materials) material.dispose()
    }
    pulses.length = 0
    for (const fig of queueFigs) scene.remove(fig)
    queueFigs.length = 0
    queueFigGeo.dispose()
    queueFigMat.dispose()
    for (const marker of reservedMarkers.values()) scene.remove(marker)
    reservedMarkers.clear()
    for (const g of dressingGroups.values()) scene.remove(g)
    dressingGroups.clear()
    for (const c of constructionGroups.values()) disposeConstruction(c)
    constructionGroups.clear()
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    for (const entry of buildingGroups.values()) {
      scene.remove(entry.group)
      entry.group.traverse((object) => {
        if (!isMesh(object)) return
        geometries.add(object.geometry)
        const material = object.material
        if (Array.isArray(material)) material.forEach((item) => materials.add(item))
        else materials.add(material)
      })
    }
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    buildingGroups.clear()
    plotMarkerGeo.dispose()
    plotMarkerMat.dispose()
    pulseGeo.dispose()
    for (const geometry of [dressingPatchGeo, plazaPatchGeo, treeGeo, benchGeo, signGeo, binGeo]) geometry.dispose()
    for (const material of [wallTemplate, windowTemplate, roofTemplate, propMat, doorMat, parkMat, plazaMat])
      material.dispose()
    for (const texture of [trimTex, litSheet, roofSheet]) texture.dispose()
  }

  return { syncBuildings, update, dispose }
}

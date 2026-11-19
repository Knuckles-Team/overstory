/**
 * @file buildings.ts
 * @description Building and construction visuals for the 3D city (part of
 * the render3d/ split, T025). Connector buildings, core landmarks, reserved
 * plots and construction rigs are all built from the shared world state; the
 * per-frame updates (lit windows, error flash, landmark animation, commit
 * pulses, reserved-plot labels, construction progress and reveal pops) run
 * here. Colours that encode a fact come from the one encoding table (R025).
 */
import * as THREE from 'three'
import { PLOT_W } from '../layout'
import { encodingColor } from '../encoding'
import { bus } from '../events'
import { facadeSet, nameplateTexture, reservedLabelTexture } from './labels'
import { isMesh } from './scene'
import type { world as SimWorld } from '../sim'

export type World = typeof SimWorld

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
  /** The roof materials — the separate 'error-flash' channel (R025). */
  roofMats?: THREE.MeshStandardMaterial[]
  /** True while the error-flash channel has touched this landmark's materials. */
  flashActive?: boolean
  sign: THREE.Sprite
  height: number
  landmark?: boolean
  bits?: LandmarkBits
}

interface ConstructionEntry {
  group: THREE.Group
  slabs: THREE.Mesh[]
  armP: THREE.Group
  cable: THREE.Mesh
  hookBlock: THREE.Mesh
  marker?: THREE.Object3D
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

  // ---- Building meshes ------------------------------------------------------
  function archetypeProps(arch: string, g: THREE.Group, w: number, h: number, d: number, colorHex: number): void {
    const mat = (col: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 })
    const add = (mesh: THREE.Mesh): void => {
      mesh.castShadow = true
      g.add(mesh)
    }
    switch (arch) {
      case 'containers': {
        const cm = [0xd86f5e, 0x4d9de0, 0x6faf5e, 0xd8845e]
        for (let i = 0; i < 4; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.5), mat(cm[i % 4]))
          box.position.set(w / 2 + 1.4 + (i % 2) * 0.1, 0.6 + Math.floor(i / 2) * 1.2, (i < 2 ? -1 : 1) * 1.2)
          add(box)
        }
        break
      }
      case 'antenna': {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3.4, 5), mat(0x8a94a8))
        mast.position.set(0, h + 1.7, 0)
        const arm1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), mat(0x8a94a8))
        arm1.position.set(0, h + 2.6, 0)
        const arm2 = arm1.clone()
        arm2.position.y = h + 2.1
        add(mast)
        add(arm1)
        add(arm2)
        break
      }
      case 'books': {
        const bm = [0xb08968, 0x6fa86f, 0x5b8def]
        for (let i = 0; i < 3; i++) {
          const book = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.4), mat(bm[i]))
          book.position.set(-w / 2 - 0.4, 0.15 + i * 0.32, d / 2 + 0.9)
          add(book)
        }
        break
      }
      case 'tanks': {
        for (const s of [-1, 1]) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.4, 10), mat(0x9aa5b5))
          tank.rotation.z = Math.PI / 2
          tank.position.set(s * (w / 2 + 1.5), 0.9, -d / 2 - 0.6)
          add(tank)
        }
        break
      }
      case 'screen': {
        const scr = new THREE.Mesh(
          new THREE.PlaneGeometry(4.4, 2.6),
          new THREE.MeshStandardMaterial({
            color: 0x10141f,
            emissive: colorHex,
            emissiveIntensity: 0.7,
            roughness: 0.4,
          }),
        )
        scr.position.set(0, h * 0.55, d / 2 + 0.03)
        g.add(scr)
        break
      }
      case 'kiosk': {
        const awn = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.4), mat(0xe8e2d2))
        awn.position.set(0, 2.2, d / 2 + 0.7)
        awn.rotation.x = 0.2
        add(awn)
        break
      }
      case 'gate': {
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), mat(colorHex))
          post.position.set(s * 1.6, 1.5, d / 2 + 1.2)
          add(post)
        }
        break
      }
      case 'depot': {
        const can = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.16, 2.6), mat(0xd86f5e))
        can.position.set(0, 3.1, d / 2 + 1.3)
        add(can)
        break
      }
      case 'booth': {
        const hut = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 10), mat(0x8f7bd8))
        hut.position.set(w / 2 + 1.4, 0.8, d / 2 - 0.8)
        add(hut)
        break
      }
      case 'house': {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 4), mat(0x7a4438))
        roof.rotation.y = Math.PI / 4
        roof.position.set(0, h + 0.6, 0)
        add(roof)
        break
      }
      case 'diner': {
        const table = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 8), mat(0xe8e2d2))
        table.position.set(-w / 2 - 1.2, 0.45, d / 2 + 0.8)
        add(table)
        break
      }
      default: {
        // tower / works-ish
        const unit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), mat(0x8a94a8))
        unit.position.set(0, h + 0.4, 0)
        add(unit)
      }
    }
  }

  function makeBuildingMesh(b: World['buildings'][string]): BuildingEntry {
    const g = new THREE.Group()
    // Deterministic per-building seed (R014): the facade window pattern is
    // identical on every boot.
    let seed = 0
    for (let i = 0; i < b.id.length; i++) seed = (seed * 31 + b.id.charCodeAt(i)) >>> 0
    // The 'building-height' channel (R025): height encodes the served tool
    // count — one visual, one fact.
    const height = b.category === 'core' ? 6 : 3 + Math.min(b.toolCount, 16) * 0.4
    const mats = facadeSet(b.color, seed)
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, height, b.d), mats)
    body.position.y = height / 2
    body.castShadow = true
    body.userData.entity = { kind: 'building', id: b.id }
    g.add(body)
    const sign = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: nameplateTexture(b.name, b.color, b.served),
        depthWrite: false,
      }),
    )
    sign.scale.set(4.6, 0.86, 1)
    sign.position.y = height + 1.5
    sign.userData.entity = { kind: 'building', id: b.id }
    g.add(sign)
    if (b.category === 'connector') archetypeProps(b.kind, g, b.w, height, b.d, b.color)
    g.position.set(b.x, 0, b.z)
    scene.add(g)
    // BoxGeometry face order: +x, -x, +y (roof), -y, +z, -z — the two middle
    // materials are the roof, the 'error-flash' channel's own surface (R025).
    const entry: BuildingEntry = {
      group: g,
      body,
      mats,
      roofMats: [mats[2], mats[3]],
      sign,
      height,
    }
    buildingGroups.set(b.id, entry)
    // Door mat on the road.
    if (b.door) {
      const mat = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 1 }),
      )
      mat.rotation.x = -Math.PI / 2
      mat.position.set(b.door.x, 0.035, b.door.z)
      scene.add(mat)
    }
    return entry
  }

  // Landmark-specific geometry (core components get bespoke silhouettes).
  function buildLandmark(b: World['buildings'][string]): void {
    const g = new THREE.Group()
    const C = b.color
    const stone = new THREE.MeshStandardMaterial({ color: C, roughness: 0.9 })
    const stoneDark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(C).multiplyScalar(0.5),
      roughness: 0.95,
    })
    const bits: LandmarkBits = {}
    const add = (m: THREE.Mesh): THREE.Mesh => {
      m.castShadow = true
      m.userData.entity = { kind: 'building', id: b.id }
      g.add(m)
      return m
    }

    if (b.kind === 'gate') {
      const plaza = new THREE.Mesh(
        new THREE.BoxGeometry(14, 0.18, 14),
        new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1 }),
      )
      plaza.position.y = 0.09
      plaza.receiveShadow = true
      plaza.userData.entity = { kind: 'building', id: b.id }
      g.add(plaza)
      for (const s of [-1, 1]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 11, 3.4), stone)).position.set(s * 6.2, 5.5, 0)
        add(new THREE.Mesh(new THREE.BoxGeometry(3.7, 1, 3.7), stoneDark)).position.set(s * 6.2, 9.4, 0)
      }
      const arch = add(new THREE.Mesh(new THREE.BoxGeometry(15.8, 2, 3), stone))
      arch.position.y = 11.4
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4.6, 0.14, 10, 40),
        new THREE.MeshBasicMaterial({ color: C, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 7.6
      g.add(ring)
      bits.ring = ring
    } else if (b.kind === 'vault') {
      add(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 1.2, 6), stoneDark)).position.y = 0.6
      add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 6.4, 6), stone)).position.y = 4.4
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x2a2344, emissive: 0xb08cff, emissiveIntensity: 1.4 }),
      )
      core.position.y = 4.8
      g.add(core)
      bits.core = core
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(3.3, 0.1, 8, 44),
        new THREE.MeshBasicMaterial({ color: C, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
      )
      halo.position.y = 8.8
      halo.rotation.x = 1.15
      g.add(halo)
      bits.halo = halo
    } else if (b.kind === 'works') {
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(b.w, 5, b.d), stone))
      body.position.y = 2.5
      for (let i = -1; i <= 1; i++) {
        const prism = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, b.d * 0.94, 3), stoneDark)
        prism.rotation.z = Math.PI / 2
        prism.rotation.x = Math.PI / 2
        prism.position.set(0, 6.1, i * 2.6)
        prism.userData.entity = { kind: 'building', id: b.id }
        g.add(prism)
      }
      const mast = add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 9.5, 0.35), stoneDark))
      mast.position.set(b.w / 2 - 1, 4.7, b.d / 2 - 1)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.28, 0.28), stoneDark)
      arm.position.y = 9.3
      const armPivot = new THREE.Group()
      armPivot.position.set(b.w / 2 - 1, 9.3, b.d / 2 - 1)
      armPivot.add(arm)
      g.add(armPivot)
      bits.craneArm = armPivot
    } else if (b.kind === 'tower') {
      const glass = new THREE.MeshStandardMaterial({
        color: 0x22303a,
        roughness: 0.25,
        metalness: 0.3,
        emissive: C,
        emissiveIntensity: 0.35,
      })
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(b.w, 20, b.d), glass))
      body.position.y = 10
      const crown = add(new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 1.2, b.d + 0.6), stoneDark))
      crown.position.y = 20.6
      const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 3.4, 6), stoneDark))
      antenna.position.y = 22.6
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x552222, emissive: 0xff4444, emissiveIntensity: 2 }),
      )
      tip.position.y = 24.4
      g.add(tip)
      bits.tip = tip
    } else if (b.kind === 'kiosk') {
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.9, b.d), stoneDark)).position.y = 0.45
      add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), stone)).position.y = 2.2
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x0d1410, emissive: 0x7dffab, emissiveIntensity: 0.9 }),
      )
      screen.position.set(0, 2.3, b.d / 2 + 0.05)
      screen.userData.entity = { kind: 'building', id: b.id }
      g.add(screen)
    } else if (b.kind === 'pavilion') {
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.5, b.d), stoneDark)).position.y = 0.25
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.28, b.d), stone)).position.y = 3.2
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.22), stoneDark))
          post.position.set(sx * (b.w / 2 - 0.4), 1.6, sz * (b.d / 2 - 0.4))
        }
      const desk = add(
        new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a4150 })),
      )
      desk.position.set(0, 0.95, -0.8)
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x140d14, emissive: 0xff8fb3, emissiveIntensity: 0.9 }),
      )
      screen.position.set(0, 2, -0.85)
      g.add(screen)
    } else if (b.kind === 'dock') {
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.7, b.d), stone)).position.y = 0.35
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w + 1.4, 0.24, b.d + 1), stoneDark)).position.y = 0.8
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 3, 0.24), stoneDark))
          post.position.set(sx * (b.w / 2 - 0.5), 2.3, sz * (b.d / 2 - 0.5))
        }
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.6, 0.3, b.d - 0.6), stone)).position.y = 3.9
      for (let i = 0; i < 3; i++) {
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: [0x7fd06f, 0xd8c24a, 0x5ea0ff][i] }),
        )
        crate.position.set(-1.6 + i * 1.5, 1.3, 0)
        crate.rotation.y = i * 0.5
        g.add(crate)
      }
    }

    const sign = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameplateTexture(b.name, b.color, false), depthWrite: false }),
    )
    sign.scale.set(5.2, 0.98, 1)
    sign.position.y = b.kind === 'tower' ? 26 : 13.5
    sign.userData.entity = { kind: 'building', id: b.id }
    g.add(sign)
    g.position.set(b.x, 0, b.z)
    scene.add(g)
    buildingGroups.set(b.id, {
      group: g,
      body: g,
      mats: [],
      sign,
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
    const wm = new THREE.MeshStandardMaterial({ color: 0xc7a24a, roughness: 0.8 })
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), wm)
        post.position.set(sx * (PLOT_W / 2 - 0.3), h / 2, sz * (PLOT_W / 2 - 0.3))
        g.add(post)
      }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(PLOT_W, 0.1, 0.12), wm)
    beam.position.y = h
    g.add(beam)
    const beam2 = beam.clone()
    beam2.rotation.y = Math.PI / 2
    beam2.position.y = h * 0.66
    g.add(beam2)
    // Crane.
    const crane = new THREE.Group()
    crane.position.set(PLOT_W / 2 + 1.2, 0, PLOT_W / 2 + 1.2)
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 13, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }),
    )
    mast.position.y = 6.5
    const armP = new THREE.Group()
    armP.position.y = 12.6
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 0.3), wm)
    arm.position.x = -3.5
    armP.add(arm)
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, 4, 0.05), wm)
    cable.position.set(-6.5, -2, 0)
    armP.add(cable)
    const hookBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.2, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.9 }),
    )
    hookBlock.position.set(-6.5, -4.4, 0)
    armP.add(hookBlock)
    crane.add(mast, armP)
    g.add(crane)
    // Marker cube (the pinned placeholder asset).
    let marker: THREE.Object3D | undefined
    if (markerRoot) {
      const cube = markerRoot.clone(true)
      cube.scale.setScalar(2.4)
      cube.position.y = 0.4
      g.add(cube)
      marker = cube
    }
    // Rising slabs.
    const slabs: THREE.Mesh[] = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(PLOT_W - 0.6, (h - 0.4) / n, PLOT_W - 0.6),
        new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95 }),
      )
      slab.position.y = 0.2 + (i + 0.5) * ((h - 0.4) / n)
      slab.scale.y = 0.001
      g.add(slab)
      slabs.push(slab)
    }
    scene.add(g)
    return { group: g, slabs, armP, cable, hookBlock, marker }
  }

  // ---- Planned-plot markers + labels (every registered pack is named) -------
  const plotMarkerGeo = new THREE.PlaneGeometry(PLOT_W - 0.4, PLOT_W - 0.4)
  const plotMarkerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  })
  const reservedMarkers = new Map<string, THREE.Mesh>()
  const reservedLabels = new Map<string, THREE.Sprite>()

  // ---- Commit pulses at the vault ---------------------------------------------
  const pulses: { mesh: THREE.Mesh; t: number }[] = []
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
  const queueFigMat = new THREE.MeshStandardMaterial({
    color: encodingColor('door-queue'),
    roughness: 0.7,
  })
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
    const inFlight: Record<string, number> = {}
    for (const c of world.characters) {
      if (c.state === 'working' && c.task?.buildingId) {
        const bid = c.task.buildingId
        inFlight[bid] = (inFlight[bid] ?? 0) + 1
      }
    }

    // Buildings: windows, flash, landmark animation.
    for (const [id, entry] of buildingGroups) {
      const b = id in world.buildings ? world.buildings[id] : null
      if (!b) continue
      if (entry.mats.length) {
        const calls = inFlight[id] ?? 0
        for (const m of entry.mats) {
          if (entry.roofMats?.includes(m)) continue
          m.emissiveIntensity = Math.min(1.5, calls * 0.45)
        }
      }
      // 'error-flash' channel (R025): while a recent error is fresh the roof
      // lights up in the table's red; connector roofs own it, landmarks flash
      // their whole material set and restore the baseline when it ends.
      if (entry.roofMats) {
        for (const m of entry.roofMats) {
          m.emissive.setHex(b.flash > 0 ? encodingColor('error-flash') : 0x000000)
          m.emissiveIntensity = b.flash > 0 ? Math.min(2.5, b.flash * 2) : 0
        }
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

    // Planned plots: every reserved plot keeps a faint marker and its name.
    for (const plot of world.plots) {
      const key = `${plot.x}:${plot.z}`
      const wants = !plot.buildingId && !plot.construction && plot.reservedName !== null
      let marker = reservedMarkers.get(key)
      if (wants) {
        if (!marker) {
          marker = new THREE.Mesh(plotMarkerGeo, plotMarkerMat)
          marker.rotation.x = -Math.PI / 2
          marker.position.set(plot.x, 0.04, plot.z)
          scene.add(marker)
          reservedMarkers.set(key, marker)
        }
        let label = reservedLabels.get(key)
        if (!label && plot.reservedName) {
          label = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: reservedLabelTexture(plot.reservedName),
              depthWrite: false,
              transparent: true,
            }),
          )
          label.scale.set(5.4, 1, 1)
          label.position.set(plot.x, 0.5, plot.z + PLOT_W / 2 + 0.8)
          scene.add(label)
          reservedLabels.set(key, label)
        }
      } else {
        if (marker) {
          scene.remove(marker)
          reservedMarkers.delete(key)
        }
        const label = reservedLabels.get(key)
        if (label) {
          scene.remove(label)
          label.material.map?.dispose()
          label.material.dispose()
          reservedLabels.delete(key)
        }
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
        if (done) scene.remove(done.group)
        constructionGroups.delete(key)
        // Reveal the finished building with a pop.
        const bid = plot.buildingId
        const entry = bid ? buildingGroups.get(bid) : undefined
        if (entry) {
          entry.group.visible = true
          entry.group.scale.setScalar(0.7)
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
    for (const fig of queueFigs) scene.remove(fig)
    queueFigs.length = 0
    queueFigGeo.dispose()
    queueFigMat.dispose()
    for (const label of reservedLabels.values()) {
      scene.remove(label)
      label.material.map?.dispose()
      label.material.dispose()
    }
    reservedLabels.clear()
    for (const marker of reservedMarkers.values()) scene.remove(marker)
    reservedMarkers.clear()
    plotMarkerGeo.dispose()
    plotMarkerMat.dispose()
    pulseGeo.dispose()
  }

  return { syncBuildings, update, dispose }
}

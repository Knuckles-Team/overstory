/**
 * @file render3d.ts
 * @description 3D renderer for Arbora City (OVERSTORY-CITY-R009/R011). Consumes
 * the shared world state and the event bus; owns no facts of its own.
 * The scene library ships only in the city route chunk (OVERSTORY-CITY-R016).
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { X_ROADS, Z_ROADS, ROAD_W, WATER_Z, GROUND_SIZE, PLOT_W, HOUSES, PARKS, PIER, SHIPS } from './layout'
import { bus, type CityEvent } from './events'
import { pinnedBytes } from './assets'
import { world as simWorld } from './sim'
import type { CityRenderer, SelectionHit } from './types'

const DAY_SKY = new THREE.Color(0x9fd8ff)
const NIGHT_SKY = new THREE.Color(0x0b1226)
const tmpColor = new THREE.Color()

/** Overview framing for the 200-unit city (district west, waterfront south). */
const OVERVIEW_CAM = new THREE.Vector3(36, 62, 108)
const OVERVIEW_TARGET = new THREE.Vector3(-20, 1, 8)

type Character = (typeof simWorld.characters)[number]
type World = typeof simWorld

/**
 * Mesh test as a type predicate: a bare `instanceof THREE.Mesh` narrows to
 * `Mesh<..., any, ...>` (the generic parameters are inferred as `any` from
 * the value position), which the strict rules then refuse to use. The
 * predicate form keeps the defaulted `Material | Material[]` element type.
 */
function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return o instanceof THREE.Mesh
}

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
  sign: THREE.Sprite
  height: number
  landmark?: boolean
  userData?: LandmarkBits
}

interface ConstructionEntry {
  group: THREE.Group
  slabs: THREE.Mesh[]
  armP: THREE.Group
  cable: THREE.Mesh
  hookBlock: THREE.Mesh
  marker?: THREE.Object3D
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

export async function init3D(
  container: HTMLElement,
  world: World,
  opts: { onSelect: (hit: SelectionHit | null) => void },
): Promise<CityRenderer> {
  const { onSelect } = opts
  const loader = new GLTFLoader()

  // Pinned GLBs are served from the startup-verified byte cache so each
  // pinned file is fetched exactly once (OVERSTORY-CITY-R013); unpinned
  // assets fall back to a plain fetch.
  function loadPinnedGLB(url: string): Promise<GLTF> {
    const cached = pinnedBytes(url)
    const buf: Promise<ArrayBuffer> = cached
      ? Promise.resolve(cached)
      : (async () => {
          const r = await fetch(url)
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
          return r.arrayBuffer()
        })()
    return new Promise((resolve, reject) => {
      buf.then(
        (data) => {
          loader.parse(
            data,
            '',
            (gltf) => {
              resolve(gltf)
            },
            (err) => {
              reject(err instanceof Error ? err : new Error('GLB parse failed'))
            },
          )
        },
        (err: unknown) => {
          reject(err instanceof Error ? err : new Error('pinned GLB unavailable'))
        },
      )
    })
  }

  // ---- Core three setup ---------------------------------------------------
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(DAY_SKY.clone(), 90, 320)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.5, 600)
  camera.position.copy(OVERVIEW_CAM)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(OVERVIEW_TARGET)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = 1.45
  controls.minDistance = 12
  controls.maxDistance = 200

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a5a3a, 0.9)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -100
  sun.shadow.camera.right = 100
  sun.shadow.camera.top = 100
  sun.shadow.camera.bottom = -100
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 420
  scene.add(sun)
  scene.add(sun.target)

  // ---- Ground, roads, water ------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x79a96b, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 })
  const xSpan = Z_ROADS[Z_ROADS.length - 1] - Z_ROADS[0]
  for (const x of X_ROADS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, xSpan), roadMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.02, (Z_ROADS[0] + Z_ROADS[Z_ROADS.length - 1]) / 2)
    m.receiveShadow = true
    scene.add(m)
  }
  const zSpan = X_ROADS[X_ROADS.length - 1] - X_ROADS[0]
  for (const z of Z_ROADS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(zSpan, ROAD_W), roadMat)
    m.rotation.x = -Math.PI / 2
    m.position.set((X_ROADS[0] + X_ROADS[X_ROADS.length - 1]) / 2, 0.02, z)
    m.receiveShadow = true
    scene.add(m)
  }

  // Lane dashes (instanced).
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 })
  const dashCount: number[][] = []
  for (const x of X_ROADS)
    for (let z = Z_ROADS[0] + 3; z < Z_ROADS[Z_ROADS.length - 1]; z += 3) dashCount.push([x, z, 0])
  for (const z of Z_ROADS)
    for (let x = X_ROADS[0] + 3; x < X_ROADS[X_ROADS.length - 1]; x += 3) dashCount.push([x, z, 1])
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.03, 1.1), dashMat, dashCount.length)
  {
    const M = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    dashCount.forEach(([x, z, axis], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), axis ? Math.PI / 2 : 0)
      p.set(x, 0.03, z)
      M.compose(p, q, s)
      dashes.setMatrixAt(i, M)
    })
    dashes.instanceMatrix.needsUpdate = true
  }
  scene.add(dashes)

  // Water + shore + pier + ships.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, 22),
    new THREE.MeshStandardMaterial({ color: 0x3d7fb5, roughness: 0.4, metalness: 0.15 }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.06, WATER_Z + 11)
  scene.add(water)

  const shore = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xc9b47f, roughness: 1 }),
  )
  shore.rotation.x = -Math.PI / 2
  shore.position.set(0, 0.04, WATER_Z - 0.4)
  scene.add(shore)

  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(PIER.w, 0.4, PIER.z1 - PIER.z0 + 1),
    new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }),
  )
  pier.position.set(PIER.x, 0.2, (PIER.z0 + PIER.z1) / 2)
  pier.castShadow = true
  scene.add(pier)

  const ships = SHIPS.map((s, _i) => {
    const g = new THREE.Group()
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.7, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x5a6b7d }),
    )
    hull.position.y = 0.35
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.6, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xd8dce4 }),
    )
    cabin.position.set(-0.7, 0.95, 0)
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x7fd06f }),
    )
    flag.position.set(1.2, 1.2, 0)
    g.add(hull, cabin, flag)
    g.position.set(s.x, 0.35, s.z)
    scene.add(g)
    return g
  })
  // Bob phases live in a typed array next to the ships (Object3D.userData is
  // an untyped bag the strict lint rules refuse to trust).
  const shipPhases = SHIPS.map((_, i) => i * 1.7)

  // Houses (residential quarter).
  const houseWindows: THREE.MeshStandardMaterial[] = []
  HOUSES.forEach((h, i) => {
    const g = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.4, 4),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xc2a184 : 0xb8987c, roughness: 1 }),
    )
    body.position.y = 1.2
    body.castShadow = true
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.1, 1.7, 4),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8a4b3c : 0x7a4438, roughness: 1 }),
    )
    roof.position.y = 3.25
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a3346, emissive: 0xffd98a, emissiveIntensity: 0 })
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), winMat)
    win.position.set(0.9, 1.5, 2.01)
    const win2 = win.clone()
    win2.position.x = -0.9
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), new THREE.MeshStandardMaterial({ color: 0x4a3a2c }))
    door.position.set(0, 0.7, 2.01)
    g.add(body, roof, win, win2, door)
    g.position.set(h.x, 0, h.z)
    scene.add(g)
    houseWindows.push(winMat)
  })

  // Parks.
  const treeGeo = {
    trunk: new THREE.CylinderGeometry(0.12, 0.18, 0.9, 5),
    crown: new THREE.ConeGeometry(0.75, 1.8, 6),
  }
  for (const pk of PARKS) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshStandardMaterial({ color: 0x85b874, roughness: 1 }),
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.set(pk.x, 0.03, pk.z)
    scene.add(patch)
    for (let i = 0; i < pk.trees; i++) {
      const t = 0.9 + Math.random() * 0.3
      const trunk = new THREE.Mesh(treeGeo.trunk, new THREE.MeshStandardMaterial({ color: 0x6f5336 }))
      const crown = new THREE.Mesh(
        treeGeo.crown,
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4f8a4f : 0x5d9a54 }),
      )
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 3.4
      trunk.position.set(pk.x + Math.cos(a) * r, 0.45 * t, pk.z + Math.sin(a) * r)
      crown.position.set(trunk.position.x, 1.5 * t, trunk.position.z)
      trunk.scale.setScalar(t)
      crown.scale.setScalar(t)
      trunk.castShadow = crown.castShadow = true
      scene.add(trunk, crown)
    }
  }

  // Streetlamps (every other intersection).
  const lampGlows: THREE.Sprite[] = []
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffd98a, emissiveIntensity: 0.2 })
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a5568 })
  const glowTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,225,170,0.85)')
    grad.addColorStop(1, 'rgba(255,225,170,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  for (let xi = 1; xi < X_ROADS.length - 1; xi += 2)
    for (let zi = 1; zi < Z_ROADS.length - 1; zi += 2) {
      const x = X_ROADS[xi] + 1.7
      const z = Z_ROADS[zi] + 1.7
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.2, 5), poleMat)
      pole.position.set(x, 1.6, z)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), lampMat)
      head.position.set(x, 3.25, z)
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }),
      )
      glow.position.set(x, 3.2, z)
      glow.scale.setScalar(2.2)
      scene.add(pole, head, glow)
      lampGlows.push(glow)
    }

  // ---- Facade + nameplate textures -----------------------------------------
  function facadeSet(color: number): THREE.MeshStandardMaterial[] {
    const hex = `#${color.toString(16).padStart(6, '0')}`
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 192
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    g.fillStyle = hex
    g.fillRect(0, 0, 128, 192)
    g.fillStyle = 'rgba(255,255,255,0.28)'
    g.fillRect(0, 0, 128, 16)
    g.fillStyle = '#20283a'
    for (let r = 0; r < 4; r++) for (let col = 0; col < 3; col++) g.fillRect(16 + col * 38, 36 + r * 38, 26, 28)
    g.fillStyle = '#171d2b'
    g.fillRect(46, 156, 36, 36)
    const map = new THREE.CanvasTexture(c)
    const ec = document.createElement('canvas')
    ec.width = 128
    ec.height = 192
    const eg = ec.getContext('2d')
    if (!eg) throw new Error('2D canvas context unavailable')
    eg.fillStyle = '#000'
    eg.fillRect(0, 0, 128, 192)
    eg.fillStyle = '#ffd98a'
    for (let r = 0; r < 4; r++)
      for (let col = 0; col < 3; col++) if (Math.random() < 0.45) eg.fillRect(16 + col * 38, 36 + r * 38, 26, 28)
    const emissiveMap = new THREE.CanvasTexture(ec)
    const side = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.9,
      emissive: 0xffffff,
      emissiveMap,
      emissiveIntensity: 0,
    })
    const top = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 1 })
    return [side, side.clone(), top, top, side.clone(), side.clone()]
  }

  function nameplate(name: string, colorHex: number, served: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    g.fillStyle = 'rgba(10,14,22,0.82)'
    roundRect(g, 4, 4, 504, 88, 18)
    g.fill()
    g.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`
    g.lineWidth = 4
    roundRect(g, 4, 4, 504, 88, 18)
    g.stroke()
    g.fillStyle = '#ffffff'
    g.font = '600 40px system-ui, sans-serif'
    g.textBaseline = 'middle'
    const label = served ? name.slice(0, 22) : name
    g.fillText(label, served ? 110 : 24, 50)
    if (served) {
      g.fillStyle = '#3ddc84'
      g.beginPath()
      g.arc(60, 48, 14, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#0a1226'
      g.font = '700 20px system-ui, sans-serif'
      g.fillText('SERVED', 26, 84)
    }
    return new THREE.CanvasTexture(c)
  }

  function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
  }

  // ---- Building construction ----------------------------------------------
  const buildingGroups = new Map<string, BuildingEntry>()
  const constructionGroups = new Map<string, ConstructionEntry>()

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
    // Deterministic per-building height variation from the id.
    let hsum = 0
    for (let i = 0; i < b.id.length; i++) hsum = (hsum * 31 + b.id.charCodeAt(i)) % 997
    const height = b.category === 'core' ? 6 : 4.4 + (hsum % 5) * 0.55
    const mats = facadeSet(b.color)
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, height, b.d), mats)
    body.position.y = height / 2
    body.castShadow = true
    body.userData.entity = { kind: 'building', id: b.id }
    g.add(body)
    const sign = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: nameplate(b.name, b.color, b.served),
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
    const entry: BuildingEntry = { group: g, body, mats, sign, height }
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
      g.userData.ring = ring
    } else if (b.kind === 'vault') {
      add(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 1.2, 6), stoneDark)).position.y = 0.6
      add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 6.4, 6), stone)).position.y = 4.4
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x2a2344, emissive: 0xb08cff, emissiveIntensity: 1.4 }),
      )
      core.position.y = 4.8
      g.add(core)
      g.userData.core = core
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(3.3, 0.1, 8, 44),
        new THREE.MeshBasicMaterial({ color: C, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
      )
      halo.position.y = 8.8
      halo.rotation.x = 1.15
      g.add(halo)
      g.userData.halo = halo
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
      g.userData.craneArm = armPivot
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
      g.userData.tip = tip
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
      new THREE.SpriteMaterial({ map: nameplate(b.name, b.color, false), depthWrite: false }),
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
      userData: g.userData as LandmarkBits,
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
    if (markerState.root) {
      const cube = markerState.root.clone(true)
      cube.scale.setScalar(2.4)
      cube.position.y = 0.4
      g.add(cube)
      g.userData.marker = cube
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
    return { group: g, slabs, armP, cable, hookBlock, marker: g.userData.marker as THREE.Object3D | undefined }
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

  function reservedLabelTexture(name: string): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 48
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    g.font = '600 22px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = 'rgba(232,236,244,0.75)'
    g.fillText(name.length > 16 ? `${name.slice(0, 15)}…` : name, 128, 24)
    return new THREE.CanvasTexture(c)
  }

  // ---- Characters -----------------------------------------------------------
  const characters = new Map<string, CharacterEntry>()

  function makeTag(name: string, kind: string, state: string): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    const border = kind === 'human' ? '#ffd166' : '#37d0c3'
    g.fillStyle = 'rgba(10,14,22,0.85)'
    roundRect(g, 4, 10, 504, 76, 16)
    g.fill()
    g.strokeStyle = border
    g.lineWidth = 4
    roundRect(g, 4, 10, 504, 76, 16)
    g.stroke()
    g.fillStyle = stateColor(state, kind)
    g.beginPath()
    g.arc(40, 48, 13, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = '600 34px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText(name, 72, 50)
    return new THREE.CanvasTexture(c)
  }

  const STATE_COLORS: Record<string, string> = {
    idle: '#8a94a8',
    tasked: '#5ea0ff',
    working: '#ffd166',
    committing: '#b08cff',
    sleeping: '#4a5568',
    awaiting: '#ff6f9c',
    patrolling: '#7fd06f',
  }
  function stateColor(state: string, kind: string): string {
    if (kind === 'human') return '#ffd166'
    return STATE_COLORS[state] ?? '#8a94a8'
  }

  function makeBubble(text: string): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const g = c.getContext('2d')
    if (!g) throw new Error('2D canvas context unavailable')
    g.fillStyle = 'rgba(250,250,245,0.95)'
    roundRect(g, 8, 8, 496, 64, 24)
    g.fill()
    g.beginPath()
    g.moveTo(240, 72)
    g.lineTo(260, 72)
    g.lineTo(250, 92)
    g.closePath()
    g.fill()
    g.fillStyle = '#141a26'
    g.font = '600 30px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText(text.length > 24 ? `${text.slice(0, 23)}…` : text, 24, 40)
    return new THREE.CanvasTexture(c)
  }

  const markerState: { root: THREE.Object3D | null } = { root: null } // set after the marker cube loads

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
    if (markerState.root) {
      const body = markerState.root.clone(true)
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

  function makeAssetFailedEvent(rider: string): CityEvent {
    // Emitted through the bus so it gets an id and the in-game timestamp.
    return { type: 'asset.failed', character: rider, detail: 'Rider model unavailable — placeholder in use' }
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
          bus.emit(makeAssetFailedEvent(ch.rider))
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
        new THREE.SpriteMaterial({ map: makeTag(ch.name, ch.kind, ch.state), depthWrite: false }),
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

  // ---- Event subscriptions ---------------------------------------------------
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

  // ---- Selection & focus ------------------------------------------------------
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
    const rect = renderer.domElement.getBoundingClientRect()
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
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)

  interface FocusAnim {
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    fromCam: THREE.Vector3
    toCam?: THREE.Vector3
    t: number
  }
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

  function tickSelection(timeAcc: number): void {
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

  // ---- Pose ------------------------------------------------------------------
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

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
    mat.map = makeBubble(text)
    mat.needsUpdate = true
    entry.bubble.visible = true
    entry.bubble.material.opacity = 1
  }

  // ---- Render loop ------------------------------------------------------------
  let disposed = false
  let timeAcc = 0

  function render(dtReal: number): void {
    if (disposed) return
    timeAcc += dtReal
    controls.update()

    // Focus animation.
    if (focusAnim) {
      focusAnim.t += dtReal / 0.8
      const k = focusAnim.t >= 1 ? 1 : 1 - Math.pow(1 - focusAnim.t, 3)
      controls.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, k)
      if (focusAnim.toCam) camera.position.lerpVectors(focusAnim.fromCam, focusAnim.toCam, k)
      if (focusAnim.t >= 1) focusAnim = null
    }

    // Day/night.
    const clock = world.clock
    const t = clock / 86400
    const ang = (t - 0.25) * Math.PI * 2
    const elev = Math.sin(ang)
    const night = clamp01((-elev + 0.06) * 3)
    const dayK = 1 - night

    tmpColor.copy(DAY_SKY).lerp(NIGHT_SKY, night)
    scene.background = tmpColor
    scene.fog?.color.copy(tmpColor)
    const sr = Math.cos(ang)
    if (elev > -0.12) {
      sun.position.set(sr * 110, Math.max(8, elev * 110), 30)
      sun.intensity = 1.25 * dayK + 0.05
      sun.color.setHex(elev < 0.25 ? 0xffb37a : 0xfff2d8)
    } else {
      sun.position.set(-sr * 110, 70, 30)
      sun.intensity = 0.35
      sun.color.setHex(0x8fa8d8)
    }
    hemi.intensity = 0.85 * dayK + 0.22

    // Buildings: windows, flash, activity.
    for (const [id, entry] of buildingGroups) {
      const b = id in world.buildings ? world.buildings[id] : null
      if (!b) continue
      if (entry.mats.length) {
        for (const m of entry.mats) m.emissiveIntensity = 1.15 * night + b.flash * 1.6
      }
      if (b.flash > 0 && entry.landmark) {
        entry.group.traverse((o) => {
          if (!isMesh(o) || !(o.material instanceof THREE.MeshStandardMaterial)) return
          o.material.emissiveIntensity = Math.min(2.5, 0.5 + b.flash * 2)
        })
      }
      if (entry.userData?.ring) entry.userData.ring.rotation.z = timeAcc * 0.4
      if (entry.userData?.halo) entry.userData.halo.rotation.z = timeAcc * 0.6
      if (entry.userData?.core)
        (entry.userData.core.material as THREE.MeshStandardMaterial).emissiveIntensity =
          1.2 + 0.5 * Math.sin(timeAcc * 2.2)
      if (entry.userData?.craneArm) entry.userData.craneArm.rotation.y = Math.sin(timeAcc * 0.35) * 0.9
      if (entry.userData?.tip)
        (entry.userData.tip.material as THREE.MeshStandardMaterial).emissiveIntensity =
          1.2 + Math.sin(timeAcc * 3) * 1.2
    }

    // House windows at night.
    for (const m of houseWindows) m.emissiveIntensity = 1.4 * night
    for (const g of lampGlows) g.material.opacity = 0.55 * night

    // Ships bobbing.
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i]
      s.position.y = 0.35 + Math.sin(timeAcc * 0.8 + shipPhases[i]) * 0.06
      s.rotation.z = Math.sin(timeAcc * 0.6 + shipPhases[i]) * 0.02
    }

    // Pulses.
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

    // Building reveal pop.
    for (const [id, entry] of buildingGroups) {
      const b = id in world.buildings ? world.buildings[id] : null
      if (b && b.fresh > 900) b.fresh = 900
      if (entry.group.scale.x < 1) entry.group.scale.setScalar(Math.min(1, entry.group.scale.x + dtReal * 2.5))
    }

    // Characters.
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
        entry.tag.material.map = makeTag(ch.name, ch.kind, ch.state)
        entry.tag.material.needsUpdate = true
      }
      if (entry.bubbleTimer > 0) {
        entry.bubbleTimer -= dtReal
        if (entry.bubbleTimer <= 0) entry.bubble.visible = false
      }
    }

    // Sync newly onboarded buildings (created at runtime by the sim).
    for (const b of Object.values(world.buildings)) {
      if (buildingGroups.has(b.id)) continue
      if (b.category === 'core') buildLandmark(b)
      else makeBuildingMesh(b)
      const plot = world.plots.find((p) => p.buildingId === b.id)
      const entry = buildingGroups.get(b.id)
      if (plot?.construction && entry) entry.group.visible = false
    }

    tickSelection(timeAcc)

    renderer.render(scene, camera)
  }

  // Expose the speech API to the sim/UI layer.
  function say(charId: string, text: string): void {
    const entry = characters.get(charId)
    if (entry) speech(entry, text)
  }

  function dispose(): void {
    disposed = true
    unsubPulse()
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
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('pointerup', onUp)
    renderer.dispose()
    container.removeChild(renderer.domElement)
  }

  function onResize(w: number, h: number): void {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  // ---- Boot -------------------------------------------------------------------
  // Marker cube first (used by placeholders + construction).
  try {
    const mc = await loadPinnedGLB('city-assets/riders/marker-cube.glb')
    mc.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true
    })
    markerState.root = mc.scene
  } catch (err) {
    console.warn('[city] marker cube unavailable:', err)
  }

  await loadCharacters()

  // Landmarks + pre-existing buildings.
  for (const b of Object.values(world.buildings)) {
    if (b.category === 'core') buildLandmark(b)
    else makeBuildingMesh(b)
  }

  return { render, dispose, focus, overview, say, onResize, setSelected }
}

/**
 * @file scene.ts
 * @description The 3D scene core of the Arbora City renderer (part of the
 * render3d/ split, T025): the renderer, camera, controls, lights, the static
 * city geometry (ground, roads, water, pier, houses, parks, streetlamps) and
 * the day/night cycle. The WebGL context-loss listener lives here
 * (OVERSTORY-CITY-R015): on `webglcontextlost` the page is notified and falls
 * back to the 2D schematic of the same city graph — never a dead canvas. The
 * facade (render3d.ts) composes this with the buildings, characters and
 * picking layers.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GROUND_SIZE, HOUSES, PARKS, PIER, ROAD_W, SHIPS, WATER_Z, X_ROADS, Z_ROADS } from '../layout'
import type { world as SimWorld } from '../sim'

export type World = typeof SimWorld

/** Mesh test as a type predicate (strict rules refuse the bare instanceof). */
export function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return o instanceof THREE.Mesh
}

const DAY_SKY = new THREE.Color(0x9fd8ff)
const NIGHT_SKY = new THREE.Color(0x0b1226)
const tmpColor = new THREE.Color()

/** Overview framing for the 200-unit city (district west, waterfront south). */
export const OVERVIEW_CAM = new THREE.Vector3(36, 62, 108)
export const OVERVIEW_TARGET = new THREE.Vector3(-20, 1, 8)

/** The day/night factor (0 = full day, 1 = full night) for one in-game clock. */
export function nightFactor(clock: number): number {
  const t = clock / 86400
  const ang = (t - 0.25) * Math.PI * 2
  const elev = Math.sin(ang)
  return Math.max(0, Math.min(1, (-elev + 0.06) * 3))
}

export interface CityScene {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  /** Day/night + ambient animation for one frame. */
  updateEnvironment(timeAcc: number): void
  /** True once the WebGL context was lost — the page has fallen back to 2D. */
  isLost(): boolean
  onResize(width: number, height: number): void
  dispose(): void
}

export function createCityScene(container: HTMLElement, world: World, onContextLost: () => void): CityScene {
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

  // ---- WebGL context loss (R015) -------------------------------------------
  // On `webglcontextlost` the page is notified and falls back to the 2D
  // schematic of the same city graph — never a dead canvas. The restore
  // listener keeps the now-abandoned canvas from resurrecting a view the
  // page has already replaced.
  let lost = false
  const onLost = (e: Event): void => {
    e.preventDefault()
    lost = true
    onContextLost()
  }
  const onRestored = (e: Event): void => {
    e.preventDefault() // the page owns the view choice; it already fell back
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)
  renderer.domElement.addEventListener('webglcontextrestored', onRestored)

  // ---- Lights ---------------------------------------------------------------
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

  // ---- Per-frame environment (day/night, houses, lamps, ships) --------------
  function updateEnvironment(timeAcc: number): void {
    const clock = world.clock
    const night = nightFactor(clock)
    const dayK = 1 - night

    tmpColor.copy(DAY_SKY).lerp(NIGHT_SKY, night)
    scene.background = tmpColor
    scene.fog?.color.copy(tmpColor)
    const t = clock / 86400
    const ang = (t - 0.25) * Math.PI * 2
    const elev = Math.sin(ang)
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

    // House windows at night.
    for (const m of houseWindows) m.emissiveIntensity = 1.4 * night
    for (const g of lampGlows) g.material.opacity = 0.55 * night

    // Ships bobbing.
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i]
      s.position.y = 0.35 + Math.sin(timeAcc * 0.8 + shipPhases[i]) * 0.06
      s.rotation.z = Math.sin(timeAcc * 0.6 + shipPhases[i]) * 0.02
    }
  }

  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
    renderer.domElement.removeEventListener('webglcontextlost', onLost)
    renderer.domElement.removeEventListener('webglcontextrestored', onRestored)
    renderer.dispose()
    container.removeChild(renderer.domElement)
  }

  function onResize(w: number, h: number): void {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  return {
    scene,
    renderer,
    camera,
    controls,
    updateEnvironment,
    isLost: () => lost,
    onResize,
    dispose,
  }
}

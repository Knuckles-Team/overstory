/**
 * @file scene.ts
 * @description The 3D scene core of the Arbora City renderer (part of the
 * render3d/ split, T025), rebuilt on the shared scene pipeline
 * (OVERSTORY-CITY-R031 / OVERSTORY-DESIGN-R012): the pipeline owns the
 * renderer state (linear lighting, sRGB, ACES tone mapping, PCF shadows),
 * the image-based environment, the one clock-following sun and the quality
 * tiers; this module supplies the real post pipeline (SSAO, bloom, FXAA),
 * the two sky domes, the controls and the static kit-built city geometry
 * (ground, roads, crosswalks, water, shore, pier, ships, houses, parks,
 * streetlamps) plus the day/night ambience. The WebGL context-loss
 * listener lives here (OVERSTORY-CITY-R015): on `webglcontextlost` the page
 * is notified and falls back to the 2D schematic of the same city graph —
 * never a dead canvas. The facade (render3d.ts) composes this with the
 * buildings, characters, labels and picking layers.
 */
// spec: OVERSTORY-CITY-R031, OVERSTORY-DESIGN-R012.1
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import {
  createScenePipeline,
  type PipelineComposer,
  type PipelineRenderer,
  type ScenePipeline,
} from '@/lib/scene3d/pipeline'
import { buildingAsset, mulberry32, propAsset } from '@/lib/scene3d/generators'
import { ARCHETYPE_GUIDE, SCENE_COLORS } from '@/lib/scene3d/palette'
import { BUILDING_POS, GROUND_SIZE, HOUSES, PARKS, PIER, PLOTS, SHIPS, WATER_Z, X_ROADS, Z_ROADS } from '../layout'
import {
  clearPropPositions,
  clearsRoad,
  CITY_WORLD_SEED,
  generateRegionalMassing,
  generateRoadsideMassing,
  generateRoadsideProps,
  islandCoastPoint,
  isRegionalWater,
  regionalBiome,
  regionalTerrainHeight,
  SEA_LEVEL_M,
  type RegionalMassing,
} from '../worldgen'
import type { world as SimWorld } from '../sim'
import { derivedRoadGraph } from '../layoutEdit'
import type { RoadGraph } from '@/lib/scene3d/roads'
import { createRoads, sampleRoadCurve, type RoadPathSample, type RoadsApi } from './roads'
import { makeTrafficRoutes, sampleTrafficPose, type TrafficControl, type TrafficMotion } from './traffic'
import { createJunctionControls } from './junctionControls'
import {
  litWindowSheet,
  metalTexture,
  parkTexture,
  terrainTexture,
  skyDayTexture,
  skyNightTexture,
  trimSheetTexture,
  remapUVs,
  waterTexture,
  woodTexture,
} from './trimSheet'

export type World = typeof SimWorld

/** Mesh test as a type predicate (strict rules refuse the bare instanceof). */
export function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return o instanceof THREE.Mesh
}

const DAY_SKY = new THREE.Color(SCENE_COLORS['tropical-sky'].hex)
const NIGHT_SKY = new THREE.Color(SCENE_COLORS['sky-night'].hex)
const tmpColor = new THREE.Color()
const OCEAN_SIZE = 3600

/**
 * A low-poly shoreline ribbon follows the same deterministic island recipe
 * used by generation. This is deliberately geometry, not a stretched beach
 * texture: it gives the player a visible, physical coast in every direction.
 */
function createCoastlineRibbon(): THREE.BufferGeometry {
  const segments = 144
  const vertices: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const sand = new THREE.Color(SCENE_COLORS['terrain-sand'].hex)
  const rock = new THREE.Color(SCENE_COLORS['terrain-canyon'].hex)
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    // A sandier south/east coast and a darker, rockier north/west coast
    // make the large island read as a place with varied shore conditions.
    const beachMix = Math.max(0, Math.min(1, (Math.sin(theta) + 0.35) * 0.72))
    const colour = rock.clone().lerp(sand, beachMix)
    for (const inset of [13, 2, -9]) {
      const point = islandCoastPoint(theta, inset)
      vertices.push(point.x, inset < -1 ? -0.15 : 0.035, point.z)
      colors.push(colour.r, colour.g, colour.b)
    }
  }
  for (let i = 0; i < segments; i++) {
    const start = i * 3
    indices.push(start, start + 3, start + 1, start + 1, start + 3, start + 4)
    indices.push(start + 1, start + 4, start + 2, start + 2, start + 4, start + 5)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The default is a true regional overview: the live basin, canal bridges,
 * waterfront and civic skyline must all be visible in the first frame.  A
 * closer inspection remains one focus action or scroll away; defaulting to
 * the former tight grid shot hid the water and made the world read as a test
 * board instead of a coastal city.
 */
export const OVERVIEW_CAM = new THREE.Vector3(62, 55, 112)
export const OVERVIEW_TARGET = new THREE.Vector3(-8, 2, 10)

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
  /** The shared pipeline the render loop drives (tiers, sun, composer). */
  pipeline: ScenePipeline
  /** The road layer (R032): rebuilds for the saved layout edit's graph. */
  roads: RoadsApi
  /** Day/night + ambient animation for one frame at the supplied scene clock. */
  updateEnvironment(clockS: number, dtReal: number): void
  /** True once the WebGL context was lost — the page has fallen back to 2D. */
  isLost(): boolean
  onResize(width: number, height: number): void
  /** Move the camera into the generated room stage for one building. */
  enterInterior(buildingId: string): void
  /** Restore the exterior camera after leaving the room stage. */
  exitInterior(): void
  dispose(): void
}

/** The per-frame handles of the static city geometry (ambient animation). */
export interface CityCore {
  /** House window materials (the night ambience). */
  houseWindows: THREE.MeshStandardMaterial[]
  /** Streetlamp glow sprites (the night ambience). */
  lampGlows: THREE.Sprite[]
  /** The ship groups (the bobbing). */
  ships: THREE.Group[]
  /** The ship bob phases, one per ship. */
  shipPhases: number[]
  /**
   * Batched vessels use the harbour as playable scenery: cargo, fishing,
   * yachts, kayaks and personal watercraft share three instanced meshes.
   */
  watercraft: {
    hull: THREE.InstancedMesh
    cabin: THREE.InstancedMesh
    mast: THREE.InstancedMesh
    routes: {
      radiusX: number
      radiusZ: number
      phase: number
      speed: number
      kind: 'cargo' | 'fishing' | 'yacht' | 'kayak' | 'jetski'
    }[]
  }
  /** Distant aircraft that give the skyline a living scale reference. */
  aircraft: THREE.Group[]
  /** Pooled car instances that circulate on sampled routes from the live road graph. */
  traffic: {
    body: THREE.InstancedMesh
    cabin: THREE.InstancedMesh
    routes: {
      points: RoadPathSample[]
      distances: number[]
      length: number
      laneOffset: number
      phase: number
      speed: number
      controls: TrafficControl[]
      motion: TrafficMotion
    }[]
  }
  junctionControls: ReturnType<typeof createJunctionControls>
  /** The road layer (R032): rebuilds for a new road graph, disposes with the scene. */
  roads: RoadsApi
}

/** Deterministic per-park seed (R014): the scene core never calls Math.random. */
function parkSeed(x: number, z: number): number {
  let h = 2166136261 >>> 0
  for (const v of [Math.round(x * 1000), Math.round(z * 1000)]) {
    h ^= v
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * Extend the editable basin graph into deterministic regional access roads.
 * Background buildings are non-interactive scenery, but they must still be
 * reached by actual rendered graph edges rather than sitting beyond a visual
 * board boundary.  The road tree starts at real basin endpoints and joins a
 * building's front setback, avoiding per-frame pathfinding or physics.
 */
function withRegionalRoads(base: RoadGraph, massing: readonly RegionalMassing[]): RoadGraph {
  const nodes: RoadGraph['nodes'] = { ...base.nodes }
  const segments: RoadGraph['segments'] = { ...base.segments }
  const anchors = Object.values(nodes).filter((node) => node.kind === 'endpoint' || node.z <= -50)
  const candidates = massing
    // A representative branch per nearby regional block is enough for a
    // connected-looking hinterland. Hundreds of individual driveways turn
    // the otherwise merged road layer into unnecessary vertex and shadow
    // work on an integrated GPU.
    .filter((building) => building.z < 68 && Math.hypot(building.x, building.z) < 245)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
    .slice(0, 32)
  for (let index = 0; index < candidates.length; index++) {
    const building = candidates[index]
    const id = `regional:${index}`
    const yaw = building.yaw ?? 0
    const frontage = building.d / 2 + 3.2
    const node = {
      id,
      x: building.x + Math.sin(yaw) * frontage,
      z: building.z + Math.cos(yaw) * frontage,
      kind: 'endpoint' as const,
    }
    const segmentId = `regional-road:${index}`
    const distanceTo = (anchor: { x: number; z: number }): number => Math.hypot(anchor.x - node.x, anchor.z - node.z)
    const previous = anchors
      .filter((anchor) => distanceTo(anchor) >= 6)
      .sort((a, b) => distanceTo(a) - distanceTo(b) || a.id.localeCompare(b.id))
      .slice(0, 8)
      .find((anchor) =>
        sampleRoadCurve(anchor.x, anchor.z, node.x, node.z, 1, segmentId, 1).every(
          ({ x, z }) => !isRegionalWater(x, z, undefined, 3),
        ),
      )
    if (!previous) continue
    nodes[id] = node
    segments[segmentId] = {
      id: segmentId,
      from: previous.id,
      to: id,
      curve: 1,
      width: 3.25,
    }
    anchors.push(node)
  }
  return { nodes, segments }
}

/**
 * The static city geometry (R014/R028/R031): ground, roads, crosswalks,
 * water, shore, pier, ships, houses, parks and streetlamps, all kit-built
 * with the shared trim sheet as their authored base-colour map (R012.2),
 * added to the scene they are handed. `createCityScene` composes it with
 * the pipeline, the sky domes and the day/night cycle; the performance
 * test (R028) measures its real triangles, draw calls and texture memory
 * with a bare `THREE.Scene` — no WebGL renderer required.
 */
export function buildCityCore(scene: THREE.Scene, graph?: RoadGraph): CityCore {
  // The city's authored maps (R012.2): every non-marker surface in the
  // scene carries one of these — the material audit enforces it.
  const trimTex = trimSheetTexture()
  const parkTex = parkTexture()
  const terrainTex = terrainTexture()
  const waterTex = waterTexture()
  const woodTex = woodTexture()
  const metalTex = metalTexture()
  const litSheet = litWindowSheet()
  // One graph drives both asphalt and vehicle routes. Layout edits therefore
  // cannot leave traffic moving over stale, invisible straight lanes.
  const editableRoadGraph = graph ?? derivedRoadGraph()

  // ---- Ground ----------------------------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 72, 72)
  groundGeo.rotateX(-Math.PI / 2)
  const terrainPos = groundGeo.getAttribute('position')
  const terrainColor: number[] = []
  const biomeColor: Record<ReturnType<typeof regionalBiome>, string> = {
    grassland: SCENE_COLORS['terrain-grass'].hex,
    jungle: SCENE_COLORS['terrain-jungle'].hex,
    sand: SCENE_COLORS['terrain-sand'].hex,
    canyon: SCENE_COLORS['terrain-canyon'].hex,
    alpine: SCENE_COLORS['terrain-alpine'].hex,
    snow: SCENE_COLORS['terrain-snow'].hex,
  }
  for (let i = 0; i < terrainPos.count; i++) {
    const x = terrainPos.getX(i)
    const z = terrainPos.getZ(i)
    // Water is a real basin, never a paper strip lying across a hillside.
    terrainPos.setY(i, isRegionalWater(x, z) ? -1.25 : regionalTerrainHeight(x, z))
    const biome = new THREE.Color(biomeColor[regionalBiome(x, z)])
    terrainColor.push(biome.r, biome.g, biome.b)
  }
  terrainPos.needsUpdate = true
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColor, 3))
  groundGeo.computeVertexNormals()
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ map: terrainTex, vertexColors: true, roughness: 1 }),
  )
  ground.receiveShadow = true
  scene.add(ground)
  // Match the rendered triangle surface when anchoring distant vegetation.
  // The analytic height field can differ substantially between the 12.5 m
  // terrain vertices, especially at the edge of the water mask.
  function visibleGroundHeight(x: number, z: number): number {
    const cells = 72
    const step = GROUND_SIZE / cells
    const gridX = (x + GROUND_SIZE / 2) / step
    const gridZ = (z + GROUND_SIZE / 2) / step
    const ix = Math.max(0, Math.min(cells - 1, Math.floor(gridX)))
    const iz = Math.max(0, Math.min(cells - 1, Math.floor(gridZ)))
    const u = gridX - ix
    const v = gridZ - iz
    const a = terrainPos.getY(iz * (cells + 1) + ix)
    const b = terrainPos.getY((iz + 1) * (cells + 1) + ix)
    const c = terrainPos.getY((iz + 1) * (cells + 1) + ix + 1)
    const d = terrainPos.getY(iz * (cells + 1) + ix + 1)
    return u + v <= 1 ? a * (1 - u - v) + b * v + d * u : c * (u + v - 1) + b * (1 - u) + d * (1 - v)
  }

  // ---- Distant terrain --------------------------------------------------------
  // The same deterministic heightfield drives the entire landscape.  Do not
  // add isolated hill primitives here: at overview scale they read as dark
  // UFO-like blobs, and their silhouettes cannot meet the coastal terrain.

  // ---- Streamed regional massing ---------------------------------------------
  // The active basin uses factual connector buildings.  Beyond it, a few
  // batched silhouettes per regional tile establish the suburban/rural scale
  // without pretending that those background buildings are live connectors.
  const facadeRoles = {
    // Regional massing is city fabric, not a domain-status visualization.
    // Keep its palettes architectural so the skyline supports the live
    // connector district instead of becoming a field of warning-red blocks.
    coral: 'facade-stone',
    mango: 'facade-sand',
    aqua: 'facade-ocean',
    lime: 'facade-sage',
  } as const
  const facadeColumns: Record<keyof typeof facadeRoles, number> = {
    // Match trimSheetTexture's stable material-family columns.  Mapping a
    // background box across all four columns made one building look like a
    // stack of unrelated coloured blocks instead of one coherent facade.
    aqua: 0,
    mango: 1,
    coral: 2,
    lime: 3,
  }
  const regionalMassing =
    'seed:0' in editableRoadGraph.nodes
      ? generateRoadsideMassing(editableRoadGraph, CITY_WORLD_SEED, [
          ...Object.values(BUILDING_POS),
          ...PLOTS.map((plot) => ({ ...plot, w: 7, d: 7 })),
          ...HOUSES.map((house) => ({ ...house, w: 4, d: 4 })),
        ])
      : generateRegionalMassing()
  const approachPositions: number[] = []
  const approachIndices: number[] = []
  for (const building of regionalMassing) {
    const access = building.access
    if (!access) continue
    const dx = access.doorX - access.roadX
    const dz = access.doorZ - access.roadZ
    const length = Math.hypot(dx, dz)
    const segments = Math.max(1, Math.ceil(length / 2))
    const px = (-dz / length) * 0.5
    const pz = (dx / length) * 0.5
    const base = approachPositions.length / 3
    for (let i = 0; i <= segments; i++) {
      const x = access.roadX + (dx * i) / segments
      const z = access.roadZ + (dz * i) / segments
      approachPositions.push(x + px, visibleGroundHeight(x + px, z + pz) + 0.04, z + pz)
      approachPositions.push(x - px, visibleGroundHeight(x - px, z - pz) + 0.04, z - pz)
      if (i < segments) {
        const index = base + i * 2
        approachIndices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3)
      }
    }
  }
  if (approachPositions.length) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(approachPositions, 3))
    geometry.setIndex(approachIndices)
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ color: SCENE_COLORS.sidewalk.hex, roughness: 1 })
    const approaches = new THREE.Mesh(geometry, material)
    approaches.name = 'regional-pedestrian-approaches'
    approaches.userData.marker = 'regional-pedestrian-approaches'
    scene.add(approaches)
  }
  const regionalTransform = new THREE.Object3D()
  for (const facade of Object.keys(facadeRoles) as (keyof typeof facadeRoles)[]) {
    const members = regionalMassing.filter((building) => building.facade === facade)
    if (!members.length) continue
    const column = facadeColumns[facade]
    const regionalGeo = new THREE.BoxGeometry(1, 1, 1)
    const setbackGeo = new THREE.BoxGeometry(1, 1, 1)
    const roofGeo = new THREE.BoxGeometry(1, 1, 1)
    remapUVs(regionalGeo, column * 0.25 + 0.025, 0.26, (column + 1) * 0.25 - 0.025, 0.49)
    remapUVs(setbackGeo, column * 0.25 + 0.025, 0.26, (column + 1) * 0.25 - 0.025, 0.49)
    remapUVs(roofGeo, column * 0.25 + 0.025, 0.7, (column + 1) * 0.25 - 0.025, 0.75)
    const material = new THREE.MeshStandardMaterial({
      map: trimTex,
      color: SCENE_COLORS[facadeRoles[facade]].hex,
      roughness: 0.92,
    })
    const roofMaterial = new THREE.MeshStandardMaterial({
      map: trimTex,
      color: SCENE_COLORS.roof.hex,
      roughness: 0.84,
    })
    // A stepped base, narrower upper volume and roof cap turn the distant
    // boxes into actual low-rise / mid-rise silhouettes while retaining the
    // original four façade batches. These are scenery, never fake connector
    // entities, so their detail must remain entirely instanced.
    const mesh = new THREE.InstancedMesh(regionalGeo, material, members.length)
    const setbacks = new THREE.InstancedMesh(setbackGeo, material, members.length)
    const roofs = new THREE.InstancedMesh(roofGeo, roofMaterial, members.length)
    members.forEach((building, index) => {
      const ground = regionalTerrainHeight(building.x, building.z)
      const lowerH = building.h * 0.7
      const upperH = building.h - lowerH
      regionalTransform.rotation.y = building.yaw ?? 0
      regionalTransform.position.set(building.x, ground + lowerH / 2, building.z)
      regionalTransform.scale.set(building.w, lowerH, building.d)
      regionalTransform.updateMatrix()
      mesh.setMatrixAt(index, regionalTransform.matrix)
      regionalTransform.position.set(building.x, ground + lowerH + upperH / 2, building.z)
      regionalTransform.scale.set(building.w * 0.74, upperH, building.d * 0.74)
      regionalTransform.updateMatrix()
      setbacks.setMatrixAt(index, regionalTransform.matrix)
      regionalTransform.position.set(building.x, ground + building.h + 0.13, building.z)
      regionalTransform.scale.set(building.w * 0.82, 0.26, building.d * 0.82)
      regionalTransform.updateMatrix()
      roofs.setMatrixAt(index, regionalTransform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = setbacks.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    setbacks.computeBoundingSphere()
    roofs.computeBoundingSphere()
    mesh.userData.marker = 'regional-massing'
    setbacks.userData.marker = 'regional-massing-detail'
    roofs.userData.marker = 'regional-massing-detail'
    scene.add(mesh, setbacks, roofs)
  }

  // ---- Roads (one merged geometry + one instanced crosswalk, R032) ---------
  // The layer owns its materials and rebuilds for a new road graph when a
  // saved layout edit swaps the derived grid for the overrides' graph. The
  // caller may hand in the live graph (the world's, when a stored document
  // was applied before the renderer booted); absent it the derived grid is
  // drawn — the tests measure the core against that default.
  const roadGraph =
    'seed:0' in editableRoadGraph.nodes ? editableRoadGraph : withRegionalRoads(editableRoadGraph, regionalMassing)
  const roadLayer = createRoads(scene, roadGraph)
  const roadClearance = Object.values(roadGraph.segments).map((segment) => ({
    x1: roadGraph.nodes[segment.from].x,
    z1: roadGraph.nodes[segment.from].z,
    x2: roadGraph.nodes[segment.to].x,
    z2: roadGraph.nodes[segment.to].z,
    width: segment.width,
  }))

  // ---- Regional biome vegetation -------------------------------------------
  // Two instanced meshes provide the island's ecological scale.  Candidate
  // positions are generated once from the world seed and rejected against
  // water, the serviced basin, regional roads and building footprints; this
  // is generation-time collision control, never a per-frame physics pass.
  const regionalRoadClearance = Object.values(roadGraph.segments).flatMap((segment) => {
    if (!(segment.from in roadGraph.nodes) || !(segment.to in roadGraph.nodes)) return []
    const a = roadGraph.nodes[segment.from]
    const b = roadGraph.nodes[segment.to]
    return [{ x1: a.x, z1: a.z, x2: b.x, z2: b.z, width: segment.width }]
  })
  const regionalPlants: { x: number; z: number; scale: number; biome: ReturnType<typeof regionalBiome> }[] = []
  const foliageRand = mulberry32(0x6c616e64)
  for (let z = -330; z <= 270; z += 24) {
    for (let x = -360; x <= 360; x += 24) {
      const px = x + (foliageRand() - 0.5) * 15
      const pz = z + (foliageRand() - 0.5) * 15
      if (px > -112 && px < 124 && pz > -96 && pz < 104) continue
      if (isRegionalWater(px, pz) || visibleGroundHeight(px, pz) <= SEA_LEVEL_M + 0.1) continue
      if (!clearsRoad(px, pz, regionalRoadClearance, 3.4)) continue
      if (
        regionalMassing.some(
          (building) =>
            Math.abs(px - building.x) < building.w * 0.8 + 3 && Math.abs(pz - building.z) < building.d * 0.8 + 3,
        )
      )
        continue
      const biome = regionalBiome(px, pz)
      // Sandy shores remain open, while jungle and alpine zones get the
      // density needed to establish an actual ecological silhouette.
      const probability = biome === 'jungle' ? 0.92 : biome === 'alpine' ? 0.68 : biome === 'sand' ? 0.26 : 0.5
      if (foliageRand() > probability) continue
      regionalPlants.push({ x: px, z: pz, scale: 0.72 + foliageRand() * 0.9, biome })
    }
  }
  const regionalTrunkGeo = new THREE.CylinderGeometry(0.09, 0.18, 3.4, 6)
  // A fuller crown avoids the flat, lollipop silhouette that a vertically
  // compressed icosahedron produced in the regional overview.
  const regionalCrownGeo = new THREE.DodecahedronGeometry(1.08, 0)
  // Do not use the general trim atlas for free-standing foliage: an
  // icosahedron's default UVs span unrelated atlas rows and turn canopies
  // black. The authored wood/park maps are tileable across these simple
  // biome forms and preserve their per-instance colour variation.
  const regionalTrunkMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: SCENE_COLORS['tropical-trunk'].hex,
    roughness: 0.95,
  })
  const regionalCrownMat = new THREE.MeshStandardMaterial({
    map: parkTex,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    emissive: 0x27482a,
    emissiveMap: parkTex,
    emissiveIntensity: 0.45,
  })
  const regionalTrunks = new THREE.InstancedMesh(regionalTrunkGeo, regionalTrunkMat, regionalPlants.length)
  regionalTrunks.name = 'regional-vegetation-trunks'
  const regionalCrowns = new THREE.InstancedMesh(regionalCrownGeo, regionalCrownMat, regionalPlants.length)
  const regionalPlantTransform = new THREE.Object3D()
  const biomeFoliage: Record<ReturnType<typeof regionalBiome>, string> = {
    grassland: SCENE_COLORS.park.hex,
    jungle: SCENE_COLORS['tropical-forest'].hex,
    sand: '#82934d',
    canyon: '#62733d',
    alpine: '#54755a',
    snow: '#8ca7a8',
  }
  regionalPlants.forEach((plant, index) => {
    const ground = visibleGroundHeight(plant.x, plant.z)
    regionalPlantTransform.position.set(plant.x, ground + 1.7 * plant.scale, plant.z)
    regionalPlantTransform.rotation.y = index * 1.91
    regionalPlantTransform.scale.set(plant.scale, plant.scale, plant.scale)
    regionalPlantTransform.updateMatrix()
    regionalTrunks.setMatrixAt(index, regionalPlantTransform.matrix)
    regionalPlantTransform.position.set(plant.x, ground + 3.45 * plant.scale, plant.z)
    regionalPlantTransform.scale.set(1.18 * plant.scale, 0.98 * plant.scale, 1.18 * plant.scale)
    regionalPlantTransform.updateMatrix()
    regionalCrowns.setMatrixAt(index, regionalPlantTransform.matrix)
    regionalCrowns.setColorAt(index, new THREE.Color(biomeFoliage[plant.biome]))
  })
  regionalTrunks.castShadow = regionalCrowns.castShadow = true
  regionalTrunks.instanceMatrix.needsUpdate = regionalCrowns.instanceMatrix.needsUpdate = true
  if (regionalCrowns.instanceColor) regionalCrowns.instanceColor.needsUpdate = true
  scene.add(regionalTrunks, regionalCrowns)

  // ---- Water + shore + pier + ships -------------------------------------------
  const water = new THREE.Mesh(
    // This exceeds the camera far plane in every view direction. The ocean
    // therefore has no discoverable square edge even though the island's
    // finite terrain mesh is intentionally bounded for performance.
    new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.1 }),
  )
  water.rotation.x = -Math.PI / 2
  // Civic terrain is at y=0 while off-island terrain is sunk to -1.25.
  // Keep sea between them: a full-plane ocean then surrounds the island
  // without flooding roads, sidewalks, or the live city basin.
  water.position.set(0, SEA_LEVEL_M, 0)
  scene.add(water)

  // A sheltered canal joins the regional waterfront to the city. It is an
  // actual water surface (not a painted line), deliberately east of the
  // serviced grid so it frames the city without cutting through parcels.
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 180),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.24, metalness: 0.14 }),
  )
  canal.rotation.x = -Math.PI / 2
  canal.position.set(42, 0.08, -10)
  scene.add(canal)

  // Two compact road bridges make the water corridor part of the city
  // network.  Their deck sits above the water (no coplanar overlap) and the
  // piers are deliberately inset from the banks, preserving a navigable
  // canal rather than pretending water can simply terminate at a road tile.
  const bridgeMat = new THREE.MeshStandardMaterial({ map: trimTex, color: SCENE_COLORS.asphalt.hex, roughness: 0.82 })
  const bridgePierMat = new THREE.MeshStandardMaterial({ map: trimTex, color: 0x4a6658, roughness: 0.95 })
  for (const z of [-30, 20]) {
    const deckGeo = new THREE.BoxGeometry(20, 0.42, 3.1)
    remapUVs(deckGeo, 0.02, 0.78, 0.98, 0.98)
    const deck = new THREE.Mesh(deckGeo, bridgeMat)
    deck.position.set(42, 0.48, z)
    deck.castShadow = true
    deck.receiveShadow = true
    scene.add(deck)
    for (const x of [35.5, 48.5]) {
      const pierGeo = new THREE.BoxGeometry(0.7, 0.65, 1.1)
      remapUVs(pierGeo, 0.02, 0.26, 0.98, 0.49)
      const pier = new THREE.Mesh(pierGeo, bridgePierMat)
      pier.position.set(x, 0.32, z)
      pier.castShadow = true
      scene.add(pier)
    }
  }

  // The continuous island shore replaces the old 900m-wide rectangular beach
  // strips. It shares the worldgen coast, so this is a navigable boundary,
  // not a cosmetic layer over an invisible square limit.
  const coastline = new THREE.Mesh(
    createCoastlineRibbon(),
    new THREE.MeshStandardMaterial({ map: terrainTex, vertexColors: true, roughness: 1 }),
  )
  coastline.receiveShadow = true
  scene.add(coastline)

  // A compact civic beach gives the harbour its own walkable waterfront;
  // unlike the previous strip it does not imply that the harbour is the map
  // boundary or cut straight through the rest of the island.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 5.5),
    new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffd68a, roughness: 1 }),
  )
  beach.rotation.x = -Math.PI / 2
  beach.position.set(0, 0.045, WATER_Z - 2.6)
  scene.add(beach)

  const shore = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 2.6),
    new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }),
  )
  shore.rotation.x = -Math.PI / 2
  shore.position.set(0, 0.04, WATER_Z - 0.4)
  scene.add(shore)

  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(PIER.w, 0.4, PIER.z1 - PIER.z0 + 1),
    new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 }),
  )
  pier.position.set(PIER.x, 0.2, (PIER.z0 + PIER.z1) / 2)
  pier.castShadow = true
  scene.add(pier)

  const hullMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.3 })
  const cabinMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 })
  const flagMat = new THREE.MeshStandardMaterial({ map: parkTex, roughness: 0.9 })
  const ships = SHIPS.map((s) => {
    const g = new THREE.Group()
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 1.5), hullMat)
    hull.position.y = 0.35
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.1), cabinMat)
    cabin.position.set(-0.7, 0.95, 0)
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.3), flagMat)
    flag.position.set(1.2, 1.2, 0)
    g.add(hull, cabin, flag)
    g.position.set(s.x, 0.35, s.z)
    scene.add(g)
    return g
  })
  // Bob phases live in a typed array next to the ships (Object3D.userData is
  // an untyped bag the strict lint rules refuse to trust).
  const shipPhases = SHIPS.map((_, i) => i * 1.7)

  // The island's water is part of the world, not a skybox.  A compact
  // instanced fleet gives the harbour traffic at nearly constant render cost:
  // shared hull/cabin/mast geometry covers freight, fishing, leisure and
  // small water-sport craft without one Object3D tree per vehicle.
  const vesselKinds = ['cargo', 'fishing', 'yacht', 'yacht', 'kayak', 'kayak', 'jetski', 'jetski', 'fishing'] as const
  type VesselKind = (typeof vesselKinds)[number]
  const vesselHullMat = new THREE.MeshStandardMaterial({
    map: metalTex,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.25,
  })
  const vesselCabinMat = new THREE.MeshStandardMaterial({
    map: trimTex,
    color: SCENE_COLORS['window-glass'].hex,
    roughness: 0.26,
    metalness: 0.12,
  })
  const vesselMastMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.78,
  })
  const watercraft = {
    hull: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), vesselHullMat, vesselKinds.length),
    cabin: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), vesselCabinMat, vesselKinds.length),
    mast: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), vesselMastMat, vesselKinds.length),
    routes: vesselKinds.map((kind, index) => ({
      kind,
      // This loop is entirely inside the broadest part of the harbour bay;
      // it is intentionally not a synthetic straight line across dry land.
      radiusX: 55 + (index % 3) * 23,
      radiusZ: 20 + (index % 2) * 11,
      phase: (index / vesselKinds.length) * Math.PI * 2,
      speed: 0.055 + (index % 4) * 0.012,
    })),
  }
  const vesselColors: Record<VesselKind, THREE.Color> = {
    cargo: new THREE.Color('#c05c3e'),
    fishing: new THREE.Color('#f1d39a'),
    yacht: new THREE.Color('#f4f4e8'),
    kayak: new THREE.Color('#e8a53a'),
    jetski: new THREE.Color('#38a7b8'),
  }
  for (let i = 0; i < watercraft.routes.length; i++) {
    const colour = vesselColors[watercraft.routes[i]?.kind ?? 'yacht']
    watercraft.hull.setColorAt(i, colour)
    watercraft.mast.setColorAt(i, colour)
  }
  watercraft.hull.instanceColor!.needsUpdate = true
  watercraft.mast.instanceColor!.needsUpdate = true
  watercraft.hull.castShadow = watercraft.cabin.castShadow = watercraft.mast.castShadow = true
  scene.add(watercraft.hull, watercraft.cabin, watercraft.mast)

  // ---- Distant aircraft -------------------------------------------------------
  // Three tiny shared-kit silhouettes animate far above the active city.
  // They add life at negligible geometry cost and never take picking focus.
  const aircraftMat = new THREE.MeshStandardMaterial({ map: metalTex, color: 0xe8edf0, roughness: 0.45 })
  const aircraft = [-1, 0, 1].map((lane) => {
    const plane = new THREE.Group()
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.3), aircraftMat)
    const wings = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 1.8), aircraftMat)
    plane.add(fuselage, wings)
    plane.position.set(lane * 48, 28 + Math.abs(lane) * 7, -82 - lane * 13)
    scene.add(plane)
    return plane
  })

  // ---- Traffic ---------------------------------------------------------------
  // Cars are a visual activity layer, not simulated citizens. Two instanced
  // meshes hold the entire fleet; every route comes from the same curved
  // graph segments used by the visible road mesh.
  const trafficBodyMat = new THREE.MeshStandardMaterial({
    map: metalTex,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.28,
  })
  const trafficCabinMat = new THREE.MeshStandardMaterial({
    map: trimTex,
    color: SCENE_COLORS['window-glass'].hex,
    roughness: 0.24,
    metalness: 0.12,
  })
  const trafficBodyGeo = new THREE.BoxGeometry(1.55, 0.38, 0.72)
  const trafficCabinGeo = new THREE.BoxGeometry(0.78, 0.34, 0.58)
  remapUVs(trafficBodyGeo, 0.02, 0.26, 0.98, 0.49)
  remapUVs(trafficCabinGeo, 0.02, 0.5, 0.98, 0.7)
  // One instanced fleet can be dense enough to read as a living island city
  // without multiplying draw calls or scene objects.
  const trafficCount = 28
  const trafficBody = new THREE.InstancedMesh(trafficBodyGeo, trafficBodyMat, trafficCount)
  const trafficCabin = new THREE.InstancedMesh(trafficCabinGeo, trafficCabinMat, trafficCount)
  trafficBody.castShadow = trafficCabin.castShadow = true
  const vehicleColors = ['#2f7287', '#d9a54a', '#c96f56', '#4f8968', '#e1d4bd', '#6f7e9d']
  vehicleColors.forEach((hex, index) => trafficBody.setColorAt(index, new THREE.Color(hex)))
  for (let index = vehicleColors.length; index < trafficCount; index++)
    trafficBody.setColorAt(index, new THREE.Color(vehicleColors[index % vehicleColors.length] ?? '#2f7287'))
  if (trafficBody.instanceColor) trafficBody.instanceColor.needsUpdate = true
  scene.add(trafficBody, trafficCabin)

  // ---- Houses (residential quarter, kit-built) --------------------------------
  // One shared trim-sheet wall map; each house carries its own emissive
  // clone so the 'lit windows' ambience is per house (R031 ambient life).
  const houseTemplate = new THREE.MeshStandardMaterial({
    map: trimTex,
    roughness: 0.9,
    // Houses use the same thin-bay generator as connectors.  Render both
    // sides so a rotated residential block never loses an entire facade.
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveMap: litSheet,
    emissiveIntensity: 0,
  })
  const houseCoreMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.94 })
  const houseWindows: THREE.MeshStandardMaterial[] = []
  HOUSES.forEach((h, i) => {
    const archetype = i % 2 ? 'workshop' : 'studio'
    const floorHeight = archetype === 'workshop' ? 3 : 3.6
    const house = buildingAsset({
      seed: 1000 + i,
      archetype,
      footprint: [4, 4],
      floors: 1,
    })
    const mat = houseTemplate.clone()
    const wallHex = parseInt(SCENE_COLORS[ARCHETYPE_GUIDE[archetype].wall].hex.slice(1), 16)
    mat.color.setHex(wallHex)
    const group = new THREE.Group()
    // A shallow opaque core prevents the residential kit from reading as
    // floating window strips when seen from across the avenue.
    const coreGeo = new THREE.BoxGeometry(3.84, floorHeight - 0.1, 3.84)
    remapUVs(coreGeo, 0.02, 0.26, 0.98, 0.49)
    const core = new THREE.Mesh(coreGeo, houseCoreMat)
    core.material = houseCoreMat.clone()
    core.material.color.setHex(wallHex)
    core.position.y = (floorHeight - 0.1) / 2
    const mesh = new THREE.Mesh(house.geometry, mat)
    core.castShadow = mesh.castShadow = true
    core.receiveShadow = mesh.receiveShadow = true
    group.add(core, mesh)
    group.position.set(h.x, 0, h.z)
    scene.add(group)
    houseWindows.push(mat)
  })

  // ---- Parks (kit street-furniture trees, seeded per park) --------------------
  const propMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.95 })
  const treeMat = new THREE.MeshStandardMaterial({
    map: trimTex,
    color: SCENE_COLORS['tropical-forest'].hex,
    roughness: 1,
  })
  const treeGeo = propAsset({ seed: 1, kind: 'tree' }).geometry
  for (const pk of PARKS) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }),
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.set(pk.x, 0.03, pk.z)
    scene.add(patch)
    // Seeded per park: the tree layout is identical on every boot (R014).
    const rand = mulberry32(parkSeed(pk.x, pk.z))
    const positions = clearPropPositions(parkSeed(pk.x, pk.z), pk, pk.trees, 3.4, roadClearance)
    for (const position of positions) {
      const t = 0.9 + rand() * 0.3
      const tree = new THREE.Mesh(treeGeo, treeMat)
      tree.position.set(position.x, 0, position.z)
      tree.scale.setScalar(t)
      tree.castShadow = true
      scene.add(tree)
    }
  }

  // ---- Public-realm kit ------------------------------------------------------
  // These are static, shared-kit details: no additional simulation state or
  // per-frame allocation. Bus stops inhabit the sidewalk rather than a road;
  // small signals and hydrants are instanced so civic texture does not cost a
  // draw call per intersection.
  const publicMat = new THREE.MeshStandardMaterial({ map: trimTex, color: SCENE_COLORS.sidewalk.hex, roughness: 0.8 })
  const signalMat = new THREE.MeshStandardMaterial({ map: trimTex, color: SCENE_COLORS.roof.hex, roughness: 0.66 })
  const hydrantMat = new THREE.MeshStandardMaterial({
    map: trimTex,
    color: SCENE_COLORS['wall-storehouse'].hex,
    roughness: 0.72,
  })
  const shelterPostGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.35, 6)
  const shelterRoofGeo = new THREE.BoxGeometry(2.7, 0.16, 1.05)
  const shelterBenchGeo = new THREE.BoxGeometry(1.65, 0.28, 0.36)
  const signalPoleGeo = new THREE.CylinderGeometry(0.055, 0.075, 2.28, 6)
  const signalGeo = new THREE.BoxGeometry(0.26, 0.7, 0.22)
  const hydrantGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.52, 8)
  for (const geo of [shelterPostGeo, shelterRoofGeo, shelterBenchGeo, signalPoleGeo, signalGeo, hydrantGeo]) {
    remapUVs(geo, 0.02, 0.26, 0.98, 0.49)
  }
  const roadsideObstacles = [
    ...Object.values(BUILDING_POS),
    ...PLOTS.map((plot) => ({ ...plot, w: 7, d: 7 })),
    ...HOUSES.map((house) => ({ ...house, w: 4, d: 4 })),
    ...regionalMassing.map((building) => ({
      ...building,
      w: Math.hypot(building.w, building.d),
      d: Math.hypot(building.w, building.d),
    })),
  ]
  const roadsideGroup = new THREE.Group()
  roadsideGroup.name = 'generated-roadside-props'
  scene.add(roadsideGroup)
  const civicTransform = new THREE.Object3D()
  function rebuildRoadsideProps(graph: RoadGraph): void {
    for (const child of roadsideGroup.children) if (child instanceof THREE.InstancedMesh) child.dispose()
    roadsideGroup.clear()
    const props = generateRoadsideProps(graph, CITY_WORLD_SEED, roadsideObstacles).filter(
      (prop) => visibleGroundHeight(prop.x, prop.z) > SEA_LEVEL_M + 0.1,
    )
    for (const stop of props.filter((prop) => prop.kind === 'shelter')) {
      const shelter = new THREE.Group()
      const roof = new THREE.Mesh(shelterRoofGeo, publicMat)
      roof.position.y = 2.28
      const bench = new THREE.Mesh(shelterBenchGeo, publicMat)
      bench.position.set(0, 0.45, -0.22)
      shelter.add(roof, bench)
      for (const x of [-1.12, 1.12]) {
        const post = new THREE.Mesh(shelterPostGeo, publicMat)
        post.position.set(x, 1.15, 0)
        shelter.add(post)
      }
      shelter.position.set(stop.x, visibleGroundHeight(stop.x, stop.z), stop.z)
      shelter.rotation.y = stop.rotation
      roadsideGroup.add(shelter)
    }
    const positions = props.filter((prop) => prop.kind === 'hydrant')
    if (positions.length) {
      const hydrants = new THREE.InstancedMesh(hydrantGeo, hydrantMat, positions.length)
      positions.forEach(({ x, z }, i) => {
        civicTransform.position.set(x, visibleGroundHeight(x, z) + 0.27, z)
        civicTransform.rotation.set(0, 0, 0)
        civicTransform.updateMatrix()
        hydrants.setMatrixAt(i, civicTransform.matrix)
      })
      hydrants.instanceMatrix.needsUpdate = true
      roadsideGroup.add(hydrants)
    }
  }
  rebuildRoadsideProps(roadGraph)
  const legacySignals = Array.from({ length: 16 }, (_, i) => ({
    x: X_ROADS[1 + ((i * 3) % (X_ROADS.length - 2))] + 1.7,
    z: Z_ROADS[1 + ((i * 5) % (Z_ROADS.length - 2))] + 1.7,
    rotation: i % 2 ? Math.PI / 2 : 0,
  }))
  const junctionControls = createJunctionControls(
    scene,
    roadGraph,
    signalPoleGeo,
    signalGeo,
    signalMat,
    regionalTerrainHeight,
    legacySignals,
  )
  // Waterfront vegetation is instanced: a lively tropical edge costs two
  // draw calls rather than one Object3D per palm, preserving the 60fps budget.
  const palmPositions = Array.from({ length: 22 }, (_, i) => ({
    x: -78 + i * 4.55,
    // Start beyond the carriageway verge; foliage may not cover a road.
    z: WATER_Z - 1.5 + (i % 2) * 0.45,
    scale: 1.15 + (i % 4) * 0.11,
  }))
  const palmMat = new THREE.MeshStandardMaterial({
    map: parkTex,
    roughness: 0.95,
    emissive: 0x27482a,
    emissiveMap: parkTex,
    emissiveIntensity: 0.45,
  })
  const palmTrunkMat = new THREE.MeshStandardMaterial({
    map: trimTex,
    color: SCENE_COLORS['tropical-trunk'].hex,
    roughness: 0.92,
  })
  const palmTrunkGeo = new THREE.CylinderGeometry(0.1, 0.17, 3.2, 6)
  const palmCrownGeo = new THREE.IcosahedronGeometry(0.92, 1)
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palmPositions.length)
  const palmCrowns = new THREE.InstancedMesh(palmCrownGeo, palmMat, palmPositions.length)
  const palmTransform = new THREE.Object3D()
  palmPositions.forEach((p, index) => {
    palmTransform.position.set(p.x, 1.6 * p.scale, p.z)
    palmTransform.rotation.y = index * 0.73
    palmTransform.scale.set(p.scale, p.scale, p.scale)
    palmTransform.updateMatrix()
    palmTrunks.setMatrixAt(index, palmTransform.matrix)
    palmTransform.position.set(p.x, 3.35 * p.scale, p.z)
    palmTransform.scale.set(1.1 * p.scale, 0.48 * p.scale, 1.1 * p.scale)
    palmTransform.updateMatrix()
    palmCrowns.setMatrixAt(index, palmTransform.matrix)
  })
  palmTrunks.castShadow = palmCrowns.castShadow = true
  palmTrunks.instanceMatrix.needsUpdate = palmCrowns.instanceMatrix.needsUpdate = true
  scene.add(palmTrunks, palmCrowns)

  // ---- Streetlamps (every other intersection) ---------------------------------
  const lampGeo = propAsset({ seed: 2, kind: 'streetlamp' }).geometry
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
  const lampGlows: THREE.Sprite[] = []
  for (let xi = 1; xi < X_ROADS.length - 1; xi += 2)
    for (let zi = 1; zi < Z_ROADS.length - 1; zi += 2) {
      const x = X_ROADS[xi] + 1.7
      const z = Z_ROADS[zi] + 1.7
      const pole = new THREE.Mesh(lampGeo, propMat)
      pole.position.set(x, 0, z)
      pole.castShadow = true
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }),
      )
      glow.position.set(x, 3.2, z)
      glow.scale.setScalar(2.2)
      scene.add(pole, glow)
      lampGlows.push(glow)
    }

  // The waterfront terminates the grid, so it needs its own lamp cadence
  // rather than inheriting the interior-intersection rule above.
  for (let xi = 1; xi < X_ROADS.length - 1; xi += 2) {
    const x = X_ROADS[xi] + 1.7
    const z = Z_ROADS[Z_ROADS.length - 1] - 1.7
    const pole = new THREE.Mesh(lampGeo, propMat)
    pole.position.set(x, 0, z)
    pole.castShadow = true
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }),
    )
    glow.position.set(x, 3.2, z)
    glow.scale.setScalar(2.2)
    scene.add(pole, glow)
    lampGlows.push(glow)
  }

  const traffic = { body: trafficBody, cabin: trafficCabin, routes: makeTrafficRoutes(roadGraph) }
  const roads: RoadsApi = {
    rebuild(nextGraph): void {
      const nextRegionalGraph = 'seed:0' in nextGraph.nodes ? nextGraph : withRegionalRoads(nextGraph, regionalMassing)
      roadLayer.rebuild(nextRegionalGraph)
      traffic.routes = makeTrafficRoutes(nextRegionalGraph)
      junctionControls.rebuild(nextRegionalGraph)
      rebuildRoadsideProps(nextRegionalGraph)
    },
    dispose(): void {
      roadLayer.dispose()
      junctionControls.dispose()
      for (const child of roadsideGroup.children) if (child instanceof THREE.InstancedMesh) child.dispose()
      scene.remove(roadsideGroup)
      for (const geometry of [shelterPostGeo, shelterRoofGeo, shelterBenchGeo, hydrantGeo]) geometry.dispose()
      publicMat.dispose()
      hydrantMat.dispose()
    },
  }
  return {
    houseWindows,
    lampGlows,
    ships,
    shipPhases,
    watercraft,
    aircraft,
    traffic,
    junctionControls,
    roads,
  }
}

/** The real post pipeline: render, SSAO, bloom, FXAA, output (R012.1). */
function composerFor(
  renderer: PipelineRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): PipelineComposer {
  const gl = renderer as unknown as THREE.WebGLRenderer
  const composer = new EffectComposer(gl)
  composer.addPass(new RenderPass(scene, camera))
  const aoPass = new SSAOPass(scene, camera, width, height)
  aoPass.kernelRadius = 8
  composer.addPass(aoPass)
  // Bloom is reserved for window, lamp and error emission. A low threshold
  // blooms the whole sunlit city into a white haze.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.12, 0.3, 1.25)
  composer.addPass(bloomPass)
  const fxaaPass = new FXAAPass()
  // The FXAA pass keeps its resolution uniform as a Vector2 value; capture
  // it once so the typed set below replaces both resizes.
  const fxaaResolution = fxaaPass.material.uniforms.resolution.value as unknown as THREE.Vector2
  fxaaResolution.set(1 / width, 1 / height)
  composer.addPass(fxaaPass)
  // Output conversion must be last: FXAA works in linear space and the
  // output pass applies tone mapping plus sRGB conversion once.
  composer.addPass(new OutputPass())
  return {
    aoPass,
    bloomPass,
    fxaaPass,
    setSize: (w: number, h: number): void => {
      composer.setSize(w, h)
      fxaaResolution.set(1 / w, 1 / h)
    },
    render: (): void => {
      composer.render()
    },
    dispose: (): void => {
      composer.dispose()
    },
  }
}

export interface CitySceneOptions {
  /** Called once when the WebGL context is lost; the page overlays the 2D schematic. */
  onContextLost: () => void
  /**
   * Called when a lost context is restored by the browser (R015): the page
   * resumes this renderer and drops the schematic — the fallback is not a
   * one-way door.
   */
  onContextRestored?: () => void
}

export function createCityScene(container: HTMLElement, world: World, opts: CitySceneOptions): CityScene {
  const { onContextLost, onContextRestored } = opts

  // ---- The shared pipeline (R012.1) --------------------------------------------
  // The renderer is created here so the image-based environment can be
  // PMREM-processed from it before the pipeline binds it.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  // The initial tier is intentionally `low`; match that declaration at the
  // raster level as well. A 0.75 render scale cuts the overview's fill-rate
  // almost in half on integrated GPUs while the retained tone mapping, IBL,
  // textured geometry and CSS-sized label layer keep the scene legible.
  renderer.setPixelRatio(0.75)
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  const pipeline = createScenePipeline(container, {
    createRenderer: () => renderer,
    createComposer: composerFor,
    environment,
    // Keep the long city grid legible in the overview: the former near fog
    // plane turned ordinary daylight blocks into a blank cream field before
    // their own material and shadow detail could read.
    // Depth only.  The former near, cream fog washed the whole city into a
    // polluted-looking haze before its material contrast could register.
    fog: new THREE.Fog(DAY_SKY.clone(), 430, 900),
    // The old medium-tier warmup held 1024px shadows, bloom, and FXAA for
    // thirty frames before the watchdog could react. At 2fps that meant a
    // visibly frozen city for fifteen seconds. Boot at the 60fps-safe tier.
    initialTier: 'low',
  })
  const { scene, camera } = pipeline
  // The room IBL is useful as fill, but at full strength it removes the
  // shadow and material contrast that makes city blocks readable outdoors.
  scene.environmentIntensity = 0.25

  // One reusable, enclosed room stage makes a selected building enterable
  // without duplicating the entire city or inventing a second simulation.
  // It lives below the exterior terrain, receives its label/state from the
  // selected building, and restores the exact exterior view on exit.
  const interior = new THREE.Group()
  const INTERIOR_Y = -46
  interior.position.y = INTERIOR_Y
  interior.visible = false
  const interiorFloorMat = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xd5c39d, roughness: 0.82 })
  const interiorWallMat = new THREE.MeshStandardMaterial({ map: trimSheetTexture(), color: 0xd9ded7, roughness: 0.9 })
  const interiorAccentMat = new THREE.MeshStandardMaterial({
    map: metalTexture(),
    color: SCENE_COLORS['facade-ocean'].hex,
    roughness: 0.48,
    metalness: 0.18,
  })
  const interiorFloor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.24, 9), interiorFloorMat)
  interiorFloor.position.y = -0.12
  const interiorCeiling = new THREE.Mesh(new THREE.BoxGeometry(12, 0.18, 9), interiorWallMat)
  interiorCeiling.position.y = 5.5
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 5.5, 0.24), interiorWallMat)
  backWall.position.set(0, 2.65, -4.38)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.5, 9), interiorWallMat)
  leftWall.position.set(-5.88, 2.65, 0)
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.5, 9), interiorWallMat)
  rightWall.position.set(5.88, 2.65, 0)
  const desk = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.82, 1.35), interiorAccentMat)
  desk.position.set(0, 1.08, -2.35)
  const consoleGlow = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 1.15, 0.08),
    new THREE.MeshBasicMaterial({ color: SCENE_COLORS['tropical-sky'].hex, transparent: true, opacity: 0.8 }),
  )
  consoleGlow.position.set(0, 2.5, -3.66)
  consoleGlow.userData.marker = 'interior-console-glow'
  const interiorLight = new THREE.PointLight(0xd8f4ff, 2.2, 18)
  interiorLight.position.set(0, 4.4, 0)
  interior.add(interiorFloor, interiorCeiling, backWall, leftWall, rightWall, desk, consoleGlow, interiorLight)
  interior.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })
  scene.add(interior)
  let interiorExteriorCamera: THREE.Vector3 | null = null
  let interiorExteriorTarget: THREE.Vector3 | null = null
  function enterInterior(buildingId: string): void {
    if (!(buildingId in world.buildings)) return
    const building = world.buildings[buildingId]
    if (!interiorExteriorCamera) {
      interiorExteriorCamera = camera.position.clone()
      interiorExteriorTarget = controls.target.clone()
    }
    interior.visible = true
    controls.target.set(0, INTERIOR_Y + 2.1, -1.2)
    camera.position.set(0, INTERIOR_Y + 2.3, 8.3)
    controls.minDistance = 3.2
    controls.maxDistance = 16
    const accent =
      building.category === 'core' ? SCENE_COLORS['tropical-sky'].hex : SCENE_COLORS['tropical-forest'].hex
    consoleGlow.material.color.set(accent)
  }
  function exitInterior(): void {
    if (!interiorExteriorCamera || !interiorExteriorTarget) return
    interior.visible = false
    camera.position.copy(interiorExteriorCamera)
    controls.target.copy(interiorExteriorTarget)
    controls.minDistance = 12
    controls.maxDistance = 520
    interiorExteriorCamera = null
    interiorExteriorTarget = null
  }

  // ---- Sky domes (day/night crossfade, unlit) ----------------------------------
  const dayDome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 16),
    new THREE.MeshStandardMaterial({
      map: skyDayTexture(),
      emissive: 0xffffff,
      emissiveMap: skyDayTexture(),
      color: 0x000000,
      emissiveIntensity: 0.24,
      side: THREE.BackSide,
      fog: false,
      transparent: true,
      roughness: 1,
    }),
  )
  const nightDome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 16),
    new THREE.MeshStandardMaterial({
      map: skyNightTexture(),
      emissive: 0xffffff,
      emissiveMap: skyNightTexture(),
      color: 0x000000,
      emissiveIntensity: 0.24,
      side: THREE.BackSide,
      fog: false,
      transparent: true,
      roughness: 1,
    }),
  )
  scene.add(dayDome, nightDome)

  // Low-cost layered cloud cards break the empty dome and give the bright
  // tropical sky a readable depth cue. They are intentionally distant and
  // unpicked, so they do not compete with city simulation state.
  const cloudCanvas = document.createElement('canvas')
  cloudCanvas.width = cloudCanvas.height = 128
  const cloudContext = cloudCanvas.getContext('2d')
  if (!cloudContext) throw new Error('2D canvas context unavailable')
  const cloudGradient = cloudContext.createRadialGradient(64, 64, 8, 64, 64, 58)
  cloudGradient.addColorStop(0, 'rgba(255,255,255,0.92)')
  cloudGradient.addColorStop(0.58, 'rgba(255,255,255,0.42)')
  cloudGradient.addColorStop(1, 'rgba(255,255,255,0)')
  cloudContext.fillStyle = cloudGradient
  cloudContext.fillRect(0, 0, 128, 128)
  const cloudTex = new THREE.CanvasTexture(cloudCanvas)
  cloudTex.colorSpace = THREE.SRGBColorSpace
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.72 })
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Sprite(cloudMat)
    cloud.position.set(-150 + i * 38, 52 + (i % 3) * 7, -125 + (i % 2) * 20)
    cloud.scale.set(42 + (i % 3) * 13, 14 + (i % 2) * 5, 1)
    cloud.userData.marker = 'cloud-layer'
    scene.add(cloud)
  }

  // A visible solar disc gives the clear daytime sky a directional source.
  // It is unlit and outside the playable world, so it adds no shadow cost.
  const sunCanvas = document.createElement('canvas')
  sunCanvas.width = sunCanvas.height = 128
  const sunContext = sunCanvas.getContext('2d')
  if (!sunContext) throw new Error('2D canvas context unavailable')
  const sunGradient = sunContext.createRadialGradient(64, 64, 6, 64, 64, 61)
  sunGradient.addColorStop(0, 'rgba(255,255,230,1)')
  sunGradient.addColorStop(0.52, 'rgba(255,198,90,0.96)')
  sunGradient.addColorStop(1, 'rgba(255,198,90,0)')
  sunContext.fillStyle = sunGradient
  sunContext.fillRect(0, 0, 128, 128)
  const sunTexture = new THREE.CanvasTexture(sunCanvas)
  sunTexture.colorSpace = THREE.SRGBColorSpace
  const sunDisc = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: sunTexture, transparent: true, depthWrite: false, opacity: 0.94 }),
  )
  sunDisc.position.set(-118, 104, -195)
  sunDisc.scale.set(26, 26, 1)
  sunDisc.userData.marker = 'sun-disc'
  scene.add(sunDisc)

  camera.position.copy(OVERVIEW_CAM)
  const cw = container.clientWidth || 800
  const ch = container.clientHeight || 600
  renderer.setSize(cw, ch)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(OVERVIEW_TARGET)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = 1.45
  controls.minDistance = 12
  // The 9×9 regional recipe is explorable; nearby inspection still clamps
  // before the camera can enter a façade.
  controls.maxDistance = 520

  // ---- WebGL context loss and restore (R015) -------------------------------
  // On `webglcontextlost` the page is notified and overlays the 2D schematic
  // of the same city graph — never a dead canvas. The renderer itself is kept
  // (paused): the fallback is not a one-way door. When the browser restores
  // the context (three re-initialises its GL state), `onContextRestored`
  // resumes this renderer and the page drops the schematic.
  let lost = false
  let disposed = false
  const onLost = (e: Event): void => {
    e.preventDefault()
    lost = true
    onContextLost()
  }
  const onRestored = (e: Event): void => {
    e.preventDefault()
    if (disposed || !lost) return
    lost = false
    onContextRestored?.()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)
  renderer.domElement.addEventListener('webglcontextrestored', onRestored)

  // ---- Static city geometry (ground, roads, water, houses, parks, lamps) ----
  // The world's live road graph (a stored layout document may already be
  // applied at boot — the second viewer boots into the edited city, R032).
  const core = buildCityCore(scene, world.roadGraph ?? undefined)
  // Retain the occupancy map rather than allocating a new Map every frame.
  // This is part of the steady-state renderer contract: leaving a demo open
  // must not gradually turn ordinary ambience into garbage-collection stalls.
  const homeOccupancy = new Map<string, number>()
  // Reuse the one transform for every instanced car. Creating even this tiny
  // helper inside the frame loop is enough to become a steady GC source in a
  // scene that is intentionally left open for hours.
  const trafficTransform = new THREE.Object3D()
  const vesselTransform = new THREE.Object3D()
  // Vehicles use real elapsed time, not the deliberately accelerated
  // simulation clock (which advances a city day in minutes during demo).
  const trafficPose = { x: 0, z: 0, heading: 0 }

  // ---- Per-frame environment (day/night, houses, lamps, ships) --------------
  function updateEnvironment(clockS: number, _dtReal: number): void {
    // The sun follows the in-game clock through the shared pipeline (R012.1).
    pipeline.updateEnvironment(clockS)
    const night = nightFactor(clockS)

    // Sky and fog crossfade with the mood.
    dayDome.material.opacity = 1 - night
    nightDome.material.opacity = night
    sunDisc.material.opacity = Math.max(0, 0.94 * (1 - night * 1.25))
    tmpColor.copy(DAY_SKY).lerp(NIGHT_SKY, night)
    scene.fog?.color.copy(tmpColor)

    // House windows: lit while a character is at home — the ambient life of
    // R031. No night floor: an empty house stays dark at any hour.
    homeOccupancy.clear()
    for (const c of world.characters) {
      const dx = c.pos.x - c.home.x
      const dz = c.pos.z - c.home.z
      if (dx * dx + dz * dz < 25) {
        const key = `${c.home.x}|${c.home.z}`
        homeOccupancy.set(key, (homeOccupancy.get(key) ?? 0) + 1)
      }
    }
    core.houseWindows.forEach((m, i) => {
      const h = HOUSES[i]
      m.emissiveIntensity = (homeOccupancy.get(`${h.x}|${h.z}`) ?? 0) > 0 ? 1.4 : 0
    })

    // Lamps with the night (R031 ambient life).
    for (const g of core.lampGlows) g.material.opacity = 0.55 * night

    // Ships bobbing.
    for (let i = 0; i < core.ships.length; i++) {
      const s = core.ships[i]
      s.position.y = 0.35 + Math.sin(clockS * 0.8 + core.shipPhases[i]) * 0.06
      s.rotation.z = Math.sin(clockS * 0.6 + core.shipPhases[i]) * 0.02
    }

    // Harbour craft follow slow deterministic water circuits. Updating their
    // existing instance matrices avoids the allocation and scene traversal
    // cost that made prior long-open sessions degrade over time.
    for (let i = 0; i < core.watercraft.routes.length; i++) {
      const route = core.watercraft.routes[i]
      const t = clockS * route.speed + route.phase
      const x = -10 + Math.cos(t) * route.radiusX
      const z = 150 + Math.sin(t) * route.radiusZ
      const heading = Math.atan2(Math.cos(t) * route.radiusZ, -Math.sin(t) * route.radiusX)
      const bob = 0.18 + Math.sin(clockS * 1.1 + i * 0.77) * 0.035
      const hullScale =
        route.kind === 'cargo'
          ? [7.5, 0.85, 2.7]
          : route.kind === 'fishing'
            ? [4.2, 0.64, 1.65]
            : route.kind === 'yacht'
              ? [5.1, 0.56, 1.72]
              : route.kind === 'kayak'
                ? [2.2, 0.22, 0.58]
                : [1.6, 0.25, 0.72]
      const hasCabin = route.kind !== 'kayak' && route.kind !== 'jetski'
      const hasMast = route.kind === 'cargo' || route.kind === 'fishing' || route.kind === 'yacht'
      vesselTransform.position.set(x, bob, z)
      vesselTransform.rotation.set(0, heading, 0)
      vesselTransform.scale.set(hullScale[0], hullScale[1], hullScale[2])
      vesselTransform.updateMatrix()
      core.watercraft.hull.setMatrixAt(i, vesselTransform.matrix)
      vesselTransform.position.set(
        x - Math.sin(heading) * (route.kind === 'cargo' ? 0.9 : 0.35),
        bob + 0.6,
        z - Math.cos(heading) * (route.kind === 'cargo' ? 0.9 : 0.35),
      )
      vesselTransform.scale.set(
        hasCabin ? hullScale[0] * 0.32 : 0.01,
        hasCabin ? 0.7 : 0.01,
        hasCabin ? hullScale[2] * 0.52 : 0.01,
      )
      vesselTransform.updateMatrix()
      core.watercraft.cabin.setMatrixAt(i, vesselTransform.matrix)
      vesselTransform.position.set(
        x + Math.sin(heading) * hullScale[0] * 0.12,
        bob + 1.1,
        z + Math.cos(heading) * hullScale[0] * 0.12,
      )
      vesselTransform.scale.set(
        hasMast ? 0.08 : 0.01,
        hasMast ? (route.kind === 'yacht' ? 2.8 : 1.7) : 0.01,
        hasMast ? 1.0 : 0.01,
      )
      vesselTransform.updateMatrix()
      core.watercraft.mast.setMatrixAt(i, vesselTransform.matrix)
    }
    core.watercraft.hull.instanceMatrix.needsUpdate = true
    core.watercraft.cabin.instanceMatrix.needsUpdate = true
    core.watercraft.mast.instanceMatrix.needsUpdate = true

    // Aircraft cross the distant skyline slowly, then wrap outside the view.
    for (let i = 0; i < core.aircraft.length; i++) {
      const plane = core.aircraft[i]
      plane.position.x = ((clockS * (3.5 + i * 0.45) + i * 83) % 250) - 125
      plane.position.y = 30 + i * 6 + Math.sin(clockS * 0.35 + i) * 0.7
    }

    const fleet = world.traffic
    core.junctionControls.update(fleet?.elapsed ?? 0)
    core.traffic.body.count = core.traffic.cabin.count = fleet?.routes.length ?? 0
    for (let i = 0; i < (fleet?.routes.length ?? 0); i++) {
      const route = fleet!.routes[i]
      if (!sampleTrafficPose(route, trafficPose)) continue
      const roadY = regionalTerrainHeight(trafficPose.x, trafficPose.z)
      trafficTransform.position.set(trafficPose.x, roadY + 0.34, trafficPose.z)
      trafficTransform.rotation.set(0, trafficPose.heading, 0)
      trafficTransform.updateMatrix()
      core.traffic.body.setMatrixAt(i, trafficTransform.matrix)
      trafficTransform.position.y = roadY + 0.68
      trafficTransform.updateMatrix()
      core.traffic.cabin.setMatrixAt(i, trafficTransform.matrix)
    }
    core.traffic.body.instanceMatrix.needsUpdate = true
    core.traffic.cabin.instanceMatrix.needsUpdate = true
  }

  // Complete disposal at the GPU level (R018): the scene graph is traversed
  // and every geometry, material and texture it owns is disposed, the camera
  // controls are disposed, and the WebGL context is force-lost — a 2D/3D
  // toggle or a remount never piles up contexts or leaked GPU memory.
  function dispose(): void {
    if (disposed) return
    disposed = true
    renderer.domElement.removeEventListener('webglcontextlost', onLost)
    renderer.domElement.removeEventListener('webglcontextrestored', onRestored)
    // The road layer owns its meshes and materials (R032); remove it before
    // the traversal so the traversal never disposes a mid-rebuild geometry.
    core.roads.dispose()
    const geos = new Set<THREE.BufferGeometry>()
    const mats = new Set<THREE.Material>()
    const texs = new Set<THREE.Texture>()
    scene.traverse((o) => {
      if (isMesh(o)) {
        geos.add(o.geometry)
        const material = o.material
        if (Array.isArray(material)) material.forEach((m) => mats.add(m))
        else mats.add(material)
      }
      if (o instanceof THREE.Sprite) {
        mats.add(o.material)
        if (o.material.map) texs.add(o.material.map)
      }
    })
    for (const m of mats) {
      // Dispose every texture the material references (map, emissive, ...).
      for (const key of Object.keys(m)) {
        const v = (m as unknown as Record<string, unknown>)[key]
        if (v instanceof THREE.Texture) texs.add(v as THREE.Texture)
      }
      m.dispose()
    }
    for (const g of geos) g.dispose()
    for (const t of texs) t.dispose()
    controls.dispose()
    pipeline.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    container.removeChild(renderer.domElement)
  }

  function onResize(w: number, h: number): void {
    pipeline.onResize(w, h)
    renderer.setSize(w, h)
  }

  return {
    scene,
    renderer,
    camera,
    controls,
    pipeline,
    roads: core.roads,
    updateEnvironment,
    isLost: () => lost,
    onResize,
    enterInterior,
    exitInterior,
    dispose,
  }
}

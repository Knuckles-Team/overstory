/**
 * Deterministic world-generation rules for Arbora City.  These rules are
 * intentionally cheap enough to run during layout generation: no physics
 * engine or noise texture is required to decide whether a road, tree or
 * building may occupy a place.
 */
import { mulberry32 } from '@/lib/scene3d/generators'
import { isCitySandbox } from '@/lib/city-sandbox'
import { sampleRoadCurve, type RoadGraph } from '@/lib/scene3d/roads'

export interface WorldRect {
  x: number
  z: number
  w: number
  d: number
}

/** A road span. A span with a curve is the quadratic centreline between its endpoints, not the chord. */
export interface RoadSpan {
  x1: number
  z1: number
  x2: number
  z2: number
  width: number
  curve?: number
  id?: string
}

/** The straight pieces a span really occupies: its curve sampled, or the chord for a straight span. */
function spanPieces(road: RoadSpan): readonly RoadSpan[] {
  if (!road.curve) return [road]
  const samples = sampleRoadCurve(road.x1, road.z1, road.x2, road.z2, road.curve, road.id ?? 'span', 2)
  return samples.slice(1).map((p, i) => ({
    x1: samples[i].x,
    z1: samples[i].z,
    x2: p.x,
    z2: p.z,
    width: road.width,
  }))
}

export interface GeneratedRoad {
  id: string
  x1: number
  z1: number
  x2: number
  z2: number
  width: number
}

export interface LayoutIssue {
  kind: 'building-overlap' | 'road-overlap' | 'road-clearance' | 'terrain-slope' | 'water-exclusion'
  ids: [string, string]
}

export type RegionalZone = 'waterfront' | 'civic-core' | 'suburban' | 'rural'
export type RegionalBiome = 'grassland' | 'jungle' | 'sand' | 'canyon' | 'alpine' | 'snow'

/** A streamed 9×9 world tile.  This is data, not render state, so every
 * viewer gets the same coast, terrain and zoning from the saved recipe. */
export interface RegionalTile {
  id: string
  x: number
  z: number
  zone: RegionalZone
  height: number
  hasWater: boolean
  foliage: 'palm' | 'broadleaf' | 'scrub'
  facade: 'coral' | 'mango' | 'aqua' | 'lime'
}

/** A low-detail, non-interactive volume used beyond the active city chunk. */
export interface RegionalMassing {
  x: number
  z: number
  w: number
  d: number
  h: number
  yaw?: number
  access?: { roadId: string; roadX: number; roadZ: number; doorX: number; doorZ: number }
  facade: RegionalTile['facade']
  zone: Exclude<RegionalZone, 'waterfront'>
}

/** The world seed is part of the city recipe, never a call to Math.random. */
export function cityWorldSeed(search: string, sandbox: boolean): number {
  const value = new URLSearchParams(search).get('seed')
  if (!sandbox || value === null || !/^\d{1,10}$/.test(value)) return 20261120
  const seed = Number(value)
  return seed <= 0xffffffff ? seed : 20261120
}

export const CITY_WORLD_SEED = cityWorldSeed(
  typeof window === 'undefined' ? '' : window.location.search,
  isCitySandbox(),
)
export const SEA_LEVEL_M = -0.18
const FOUNDATION_FREEBOARD_M = 0.12

/**
 * The playable world has one finite landmass.  Keep this definition shared
 * between terrain, parcel validation and the coastline renderer: a renderer
 * only mask is how invisible borders and flooded scenery sneak back in.
 */
const ISLAND_CENTRE_X = -12
const ISLAND_CENTRE_Z = -18

function islandRadii(theta: number, seed = CITY_WORLD_SEED) {
  const coastNoise = Math.sin(theta * 5 + seed * 0.00003) * 13 + Math.sin(theta * 9 - seed * 0.00001) * 7
  return { x: 390 + coastNoise, z: 330 + coastNoise * 0.72 }
}

/** Returns a point on the deterministic coastline, inset (+) or offshore (-). */
export function islandCoastPoint(theta: number, inset = 0, seed = CITY_WORLD_SEED) {
  const radii = islandRadii(theta, seed)
  return {
    x: ISLAND_CENTRE_X + Math.cos(theta) * Math.max(1, radii.x - inset),
    z: ISLAND_CENTRE_Z + Math.sin(theta) * Math.max(1, radii.z - inset),
  }
}

/** Approximate metres from a point to the coast; negative values are sea. */
export function islandShoreDistance(x: number, z: number, seed = CITY_WORLD_SEED): number {
  const theta = Math.atan2(z - ISLAND_CENTRE_Z, x - ISLAND_CENTRE_X)
  const radii = islandRadii(theta, seed)
  const radialRatio = Math.hypot((x - ISLAND_CENTRE_X) / radii.x, (z - ISLAND_CENTRE_Z) / radii.z)
  return (1 - radialRatio) * Math.min(radii.x, radii.z)
}

/** Smooth, deterministic terrain height in metres for a ground coordinate. */
export function terrainHeight(x: number, z: number, seed = CITY_WORLD_SEED): number {
  const broad = Math.sin((x + seed * 0.01) * 0.021) * Math.cos((z - seed * 0.007) * 0.018)
  const detail = Math.sin(x * 0.11 + z * 0.07 + seed) * 0.18
  return broad * 2.6 + detail
}

/** Smoothly preserves a flat, serviceable civic basin while the regional map rises around it. */
export function regionalTerrainHeight(x: number, z: number, seed = CITY_WORLD_SEED): number {
  const distance = Math.max(Math.abs(x), Math.abs(z))
  if (distance <= 95) return 0
  const t = Math.max(0, Math.min(1, (distance - 95) / 115))
  const blend = t * t * (3 - 2 * t)
  // Keep the serviced basin genuinely flat, then let the regional landform
  // take over gradually.  The former ±2.6m noise was effectively invisible
  // at overview distance and led the renderer to compensate with giant
  // floating icospheres.  These two broad frequencies read as terrain,
  // retain a cheap deterministic height query, and never affect a city plot.
  const regionalHills =
    Math.sin((x + seed * 0.0007) * 0.017) * 7.5 +
    Math.cos((z - seed * 0.0004) * 0.014) * 5.5 +
    Math.sin((x - z) * 0.008) * 3
  // Distinct landforms are outside the serviced basin: a northern alpine
  // massif and a western canyon make the island legible at regional scale
  // without destabilising building plots or road grades in the live city.
  const mountain = 74 * Math.exp(-(((x - 190) / 72) ** 2 + ((z + 190) / 58) ** 2))
  const canyon = -19 * Math.exp(-(((x + 190) / 82) ** 2 + ((z + 125) / 42) ** 2))
  // Land meets sea at sea level.  This shallow coastal shelf prevents the
  // heightfield from becoming a vertical invisible wall where the ocean mask
  // begins, while leaving inland mountains and canyons untouched.
  const shoreFade = Math.max(0, Math.min(1, islandShoreDistance(x, z, seed) / 28))
  return (terrainHeight(x, z, seed) * 1.8 + regionalHills + mountain + canyon) * blend * shoreFade
}

/** A deterministic climate/landform label for terrain tinting and placement. */
export function regionalBiome(x: number, z: number): RegionalBiome {
  const mountainDistance = ((x - 190) / 72) ** 2 + ((z + 190) / 58) ** 2
  if (mountainDistance < 0.28) return 'snow'
  if (mountainDistance < 1.15) return 'alpine'
  const canyonDistance = ((x + 190) / 82) ** 2 + ((z + 125) / 42) ** 2
  if (canyonDistance < 1.1) return 'canyon'
  if (x > 150 && z > -90) return 'sand'
  if (x < -95 || z < -125) return 'jungle'
  return 'grassland'
}

/**
 * The playable region is a single deterministic island, not a square ground
 * plane with an arbitrary ocean edge. A restrained coastline perturbation
 * keeps the silhouette natural while preserving a broad, buildable basin.
 */
export function isIslandLand(x: number, z: number, seed = CITY_WORLD_SEED): boolean {
  return islandShoreDistance(x, z, seed) > 0
}

/** The same centreline and half-width drive water exclusion and rendering. */
export function riverCentreAt(z: number): number {
  return 42 + Math.sin(z * 0.012) * 15
}

export const RIVER_HALF_WIDTH = 8

/** The coast and river corridor reserved by the regional recipe. */
export function isRegionalWater(x: number, z: number, seed = CITY_WORLD_SEED, setback = 0): boolean {
  if (islandShoreDistance(x, z, seed) <= setback) return true
  // The serviced basin opens onto a *local* curving bay.  The former
  // full-width strip severed the southern half of the island and made the
  // world read as a rectangular board.  This bay widens near the civic
  // waterfront then blends into the real island coast at either end.
  const bayDistance = Math.abs(x + 10) / 245
  if (bayDistance < 1) {
    const harbourCoast =
      67 + bayDistance * bayDistance * 205 + Math.sin((x + seed * 0.0002) * 0.035) * 5 + Math.sin(x * 0.09) * 2.5
    if (z >= harbourCoast - setback) return true
  }
  return Math.abs(x - riverCentreAt(z)) < RIVER_HALF_WIDTH + setback
}

/** Height of the same triangulated ground mesh used by the renderer. */
export function islandSurfaceHeight(x: number, z: number, seed = CITY_WORLD_SEED): number {
  const cells = 72,
    size = 900,
    step = size / cells
  const gridX = (x + size / 2) / step,
    gridZ = (z + size / 2) / step
  const ix = Math.max(0, Math.min(cells - 1, Math.floor(gridX)))
  const iz = Math.max(0, Math.min(cells - 1, Math.floor(gridZ)))
  const u = gridX - ix,
    v = gridZ - iz
  const height = (gx: number, gz: number): number => {
    const px = gx * step - size / 2,
      pz = gz * step - size / 2
    return isRegionalWater(px, pz, seed) ? -1.25 : regionalTerrainHeight(px, pz, seed)
  }
  const a = height(ix, iz),
    b = height(ix, iz + 1),
    c = height(ix + 1, iz + 1),
    d = height(ix + 1, iz)
  return u + v <= 1 ? a * (1 - u - v) + b * v + d * u : c * (u + v - 1) + b * (1 - u) + d * (1 - v)
}

export interface RegionalPlant {
  x: number
  z: number
  scale: number
  biome: RegionalBiome
}

/** Seeded vegetation is shared world data, with clearance from water, paths, roads and parcels. */
export function generateRegionalPlants(
  graph: RoadGraph,
  seed: number,
  obstacles: readonly WorldRect[],
  paths: readonly { roadX: number; roadZ: number; entranceX: number; entranceZ: number }[] = [],
): RegionalPlant[] {
  const roads = Object.values(graph.segments).flatMap((segment) => {
    const a = graph.nodes[segment.from],
      b = graph.nodes[segment.to]
    if (!(segment.from in graph.nodes) || !(segment.to in graph.nodes)) return []
    const samples = sampleRoadCurve(a.x, a.z, b.x, b.z, segment.curve, segment.id, 2)
    return samples
      .slice(1)
      .map((p, index) => ({ x1: samples[index].x, z1: samples[index].z, x2: p.x, z2: p.z, width: segment.width }))
  })
  const rand = mulberry32(seed ^ 0x6c616e64)
  const plants: RegionalPlant[] = []
  for (let z = -330; z <= 330; z += 24)
    for (let x = -390; x <= 390; x += 24) {
      const px = x + (rand() - 0.5) * 15,
        pz = z + (rand() - 0.5) * 15
      const footprint = { x: px, z: pz, w: 4.4, d: 4.4 }
      if (!isDryFootprint(footprint, 0, seed) || islandSurfaceHeight(px, pz, seed) <= SEA_LEVEL_M + 0.1) continue
      if (!clearsRoad(px, pz, roads, 2.5)) continue
      if (obstacles.some((obstacle) => rectsOverlap(footprint, obstacle, 0.5))) continue
      if (
        paths.some(
          (path) => pointSegmentDistanceSq(px, pz, path.roadX, path.roadZ, path.entranceX, path.entranceZ) < 9,
        )
      )
        continue
      const biome = regionalBiome(px, pz)
      const probability = biome === 'jungle' ? 0.92 : biome === 'alpine' ? 0.68 : biome === 'sand' ? 0.26 : 0.5
      if (rand() <= probability) plants.push({ x: px, z: pz, scale: 0.72 + rand() * 0.9, biome })
    }
  return plants
}

/** Survey the rotated foundation in bounded cells, with clearance at each sample. */
export function isDryFootprint(rect: WorldRect, yaw = 0, seed = CITY_WORLD_SEED): boolean {
  if (![rect.x, rect.z, rect.w, rect.d, yaw].every(Number.isFinite) || rect.w <= 0 || rect.d <= 0) return false
  const nx = Math.max(1, Math.ceil(rect.w))
  const nz = Math.max(1, Math.ceil(rect.d))
  if (nx * nz > 16_384) return false
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  for (let ix = 0; ix <= nx; ix++) {
    for (let iz = 0; iz <= nz; iz++) {
      const u = rect.w * (ix / nx - 0.5)
      const v = rect.d * (iz / nz - 0.5)
      const x = rect.x + u * cos + v * sin
      const z = rect.z - u * sin + v * cos
      if (isRegionalWater(x, z, seed, 1) || regionalTerrainHeight(x, z, seed) < SEA_LEVEL_M + FOUNDATION_FREEBOARD_M)
        return false
    }
  }
  return true
}

/** Approximate grade using the same terrain recipe the renderer displaces. */
export function terrainSlope(x: number, z: number, seed = CITY_WORLD_SEED): number {
  const step = 1
  const dx = (regionalTerrainHeight(x + step, z, seed) - regionalTerrainHeight(x - step, z, seed)) / (2 * step)
  const dz = (regionalTerrainHeight(x, z + step, seed) - regionalTerrainHeight(x, z - step, seed)) / (2 * step)
  return Math.hypot(dx, dz)
}

/**
 * The inexpensive regional recipe used by the streaming layer.  It gives the
 * city a legible urban-to-rural transition and reserves a continuous coastal
 * water corridor before any parcel or road assets are emitted.  Keeping this
 * deterministic is what makes collision validation useful across clients.
 */
export function generateRegionalTiles(seed = CITY_WORLD_SEED, tileSize = 96): RegionalTile[] {
  const rand = mulberry32(seed)
  const tiles: RegionalTile[] = []
  for (let tz = -4; tz <= 4; tz++) {
    for (let tx = -4; tx <= 4; tx++) {
      const x = tx * tileSize
      const z = tz * tileSize
      const distance = Math.hypot(x, z)
      // The east-side river carries water through the map to the southern sea.
      const hasWater = isRegionalWater(x, z, seed)
      const zone: RegionalZone = hasWater
        ? 'waterfront'
        : distance < tileSize * 1.25
          ? 'civic-core'
          : distance < tileSize * 2.65
            ? 'suburban'
            : 'rural'
      const foliage = zone === 'rural' ? 'scrub' : rand() > 0.56 ? 'palm' : 'broadleaf'
      const facades: RegionalTile['facade'][] = ['coral', 'mango', 'aqua', 'lime']
      tiles.push({
        id: `${tx}:${tz}`,
        x,
        z,
        zone,
        height: regionalTerrainHeight(x, z, seed),
        hasWater,
        foliage,
        facade: facades[Math.floor(rand() * facades.length)],
      })
    }
  }
  return tiles
}

/**
 * Generate distant regional silhouettes from the same recipe as the terrain.
 * These are intentionally outside the editable connector basin: they make a
 * large map read as a city and countryside without inventing connector state
 * or spending hundreds of draw calls on off-screen simulation buildings.
 */
export function generateRegionalMassing(
  seed = CITY_WORLD_SEED,
  tileSize = 96,
  roads: readonly { x1: number; z1: number; x2: number; z2: number; width: number }[] = [],
): RegionalMassing[] {
  const out: RegionalMassing[] = []
  const bounds = (building: RegionalMassing): WorldRect => {
    const cos = Math.abs(Math.cos(building.yaw ?? 0))
    const sin = Math.abs(Math.sin(building.yaw ?? 0))
    return {
      x: building.x,
      z: building.z,
      w: building.w * cos + building.d * sin,
      d: building.w * sin + building.d * cos,
    }
  }
  const fits = (building: RegionalMassing): boolean =>
    isDryFootprint(building, building.yaw, seed) &&
    out.every((other) => !rectsOverlap(bounds(building), bounds(other), 1))
  // The civic skyline belongs just across the river from the factual
  // connector basin.  These are regional, non-interactive volumes—not fake
  // connector records—and their modest seeded offsets prevent a static,
  // copy-pasted silhouette while retaining a dependable overview landmark.
  const skyline = mulberry32(seed ^ 0x5a17)
  const skylineBuildings: RegionalMassing[] = [
    {
      x: 62 + (skyline() - 0.5) * 4,
      z: -174 + (skyline() - 0.5) * 4,
      w: 14,
      d: 13,
      // One slender regional landmark gives the horizon a real downtown
      // silhouette; its distance and facade-only UVs keep it from reading
      // as a giant foreground crate.
      h: 50,
      facade: 'aqua',
      zone: 'civic-core',
    },
    {
      x: 78 + (skyline() - 0.5) * 4,
      z: -187 + (skyline() - 0.5) * 4,
      w: 12,
      d: 11,
      h: 18,
      facade: 'coral',
      zone: 'civic-core',
    },
    {
      x: 48 + (skyline() - 0.5) * 4,
      z: -160 + (skyline() - 0.5) * 4,
      w: 11,
      d: 12,
      h: 14,
      facade: 'mango',
      zone: 'civic-core',
    },
  ]
  for (const building of skylineBuildings) if (fits(building)) out.push(building)
  for (const tile of generateRegionalTiles(seed, tileSize)) {
    if (tile.hasWater || tile.zone === 'waterfront') continue
    const rand = mulberry32(
      seed ^ Math.imul(Math.round(tile.x + 500), 73856093) ^ Math.imul(Math.round(tile.z + 500), 19349663),
    )
    // Distant tiles establish neighbourhood scale, not a wall of downtown
    // boxes around the playable basin. Sparse silhouettes leave room for
    // terrain, trees and sky to do the regional storytelling.
    // Keep enough distributed silhouettes for a genuinely regional map;
    // their restrained heights (below) preserve the landscape instead of
    // erecting a wall of towers around the active basin.
    const count = tile.zone === 'civic-core' ? 10 : tile.zone === 'suburban' ? 7 : 3
    let placed = 0
    for (let attempt = 0; attempt < count * 20 && placed < count; attempt++) {
      const w = tile.zone === 'rural' ? 7 + rand() * 5 : 8 + rand() * 10
      const d = tile.zone === 'rural' ? 7 + rand() * 5 : 8 + rand() * 10
      const h =
        tile.zone === 'civic-core' ? 9 + rand() * 11 : tile.zone === 'suburban' ? 4 + rand() * 8 : 3.4 + rand() * 3.2
      const x = tile.x + (rand() - 0.5) * (tileSize - 22)
      const z = tile.z + (rand() - 0.5) * (tileSize - 22)
      // The central basin and default overview approach are rendered by live
      // city data.  Keep impostor massing out of that wider corridor so a
      // suburban batch cannot become a giant foreground box.
      if (x > -108 && x < 120 && z > -92 && z < 102) continue
      const yaw = rand() * Math.PI
      const building = { x, z, w, d, h, yaw, facade: tile.facade, zone: tile.zone }
      if (!fits(building)) continue
      if (roads.length > 0 && !footprintClearsRoads({ x, z, w, d }, yaw, roads, 0.75)) continue
      out.push(building)
      placed++
    }
  }
  return out
}

/** True when two axis-aligned footprints overlap, including a safety buffer. */
export function rectsOverlap(a: WorldRect, b: WorldRect, clearance = 0): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + clearance * 2 && Math.abs(a.z - b.z) * 2 < a.d + b.d + clearance * 2
}

/** Squared distance from a point to a road segment. */
function pointSegmentDistanceSq(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq))
  const px = ax + dx * t
  const pz = az + dz * t
  return (x - px) ** 2 + (z - pz) ** 2
}

/** A prop/building may not enter a road carriageway plus its declared verge. */
export function clearsRoad(x: number, z: number, roads: readonly RoadSpan[], margin = 0.75): boolean {
  return roads.every((road) =>
    spanPieces(road).every(
      (piece) =>
        pointSegmentDistanceSq(x, z, piece.x1, piece.z1, piece.x2, piece.z2) >= (road.width / 2 + margin) ** 2,
    ),
  )
}

/** The minimum metres between two 2-D segments; 0 when they intersect. */
export function segSegClearanceM(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  x3: number,
  z3: number,
  x4: number,
  z4: number,
): number {
  const dx1 = x2 - x1
  const dz1 = z2 - z1
  const dx2 = x4 - x3
  const dz2 = z4 - z3
  const rx = x1 - x3
  const rz = z1 - z3
  const a = dx1 * dx1 + dz1 * dz1
  const e = dx2 * dx2 + dz2 * dz2
  if (a < 1e-12 || e < 1e-12) return Math.sqrt(pointSegmentDistanceSq(x1, z1, x3, z3, x4, z4))
  const f = dx2 * rx + dz2 * rz
  const c = dx1 * rx + dz1 * rz
  const b = dx1 * dx2 + dz1 * dz2
  const denom = a * e - b * b
  let s = 0
  let t = f / e
  if (denom > 1e-12) {
    s = (b * f - c * e) / denom
    t = (a * f - b * c) / denom
    // The unclamped parameters interior to both segments: the segments cross.
    if (s > 0 && s < 1 && t > 0 && t < 1) return 0
  }
  s = Math.max(0, Math.min(1, s))
  t = Math.max(0, Math.min(1, t))
  const px = x1 + dx1 * s - (x3 + dx2 * t)
  const pz = z1 + dz1 * s - (z3 + dz2 * t)
  return Math.hypot(px, pz)
}

/** True when a point sits inside a rotated (plan) rectangle. */
export function inRotatedRect(px: number, pz: number, x: number, z: number, w: number, d: number, yaw = 0): boolean {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const ux = px - x
  const uz = pz - z
  // The same rotation isDryFootprint uses: u along the width, v along the depth.
  const localU = ux * cos + uz * -sin
  const localV = ux * sin + uz * cos
  return Math.abs(localU) <= w / 2 && Math.abs(localV) <= d / 2
}

/**
 * The minimum metres between a rotated footprint (in plan) and a road
 * segment: the footprint is never reported clear while the carriageway
 * crosses it, whatever the yaw.
 */
export function rectSegClearanceM(
  x: number,
  z: number,
  w: number,
  d: number,
  yaw: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  if (inRotatedRect(x1, z1, x, z, w, d, yaw) || inRotatedRect(x2, z2, x, z, w, d, yaw)) return 0
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const corner = (u: number, v: number): [number, number] => [x + u * cos + v * sin, z - u * sin + v * cos]
  let min = Infinity
  const edges: [number, number, number, number][] = []
  const corners = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)]
  for (let i = 0; i < 4; i++) edges.push([...corners[i], ...corners[(i + 1) % 4]])
  for (const [ax, az, bx, bz] of edges) {
    min = Math.min(min, segSegClearanceM(ax, az, bx, bz, x1, z1, x2, z2))
  }
  return min
}

/** The whole rotated footprint, not just its centre, clears every road carriageway. */
export function footprintClearsRoads(rect: WorldRect, yaw: number, roads: readonly RoadSpan[], margin = 0): boolean {
  for (const road of roads) {
    for (const piece of spanPieces(road)) {
      if (
        rectSegClearanceM(rect.x, rect.z, rect.w, rect.d, yaw, piece.x1, piece.z1, piece.x2, piece.z2) <
        road.width / 2 + margin
      )
        return false
    }
  }
  return true
}

export interface RoadsideProp {
  roadId: string
  kind: 'shelter' | 'hydrant' | 'lamp'
  x: number
  z: number
  rotation: number
}

export interface FrontageRequest {
  id: string
  w: number
  d: number
}

export interface FrontageSite extends FrontageRequest {
  x: number
  z: number
  roadId: string
  roadX: number
  roadZ: number
  entranceX: number
  entranceZ: number
}

/** Allocate bounded, dry parcels next to the actual generated road network. */
export function generateFrontageSites(
  graph: RoadGraph,
  seed: number,
  requests: readonly FrontageRequest[],
): FrontageSite[] {
  const segments = Object.values(graph.segments).sort((a, b) => a.id.localeCompare(b.id))
  const roads = segments.flatMap((segment) => {
    if (!(segment.from in graph.nodes) || !(segment.to in graph.nodes)) return []
    const a = graph.nodes[segment.from]
    const b = graph.nodes[segment.to]
    const points = sampleRoadCurve(a.x, a.z, b.x, b.z, segment.curve, segment.id, 2)
    return [{ segment, points }]
  })
  const spans = roads.flatMap(({ segment, points }) =>
    points.slice(1).map((point, i) => ({
      id: segment.id,
      x1: points[i].x,
      z1: points[i].z,
      x2: point.x,
      z2: point.z,
      width: segment.width,
    })),
  )
  const candidates = roads.flatMap(({ segment, points }) => {
    const result: { segment: typeof segment; point: (typeof points)[number]; side: number }[] = []
    for (let i = 3; i < points.length - 3; i += 4) {
      result.push({ segment, point: points[i], side: 1 }, { segment, point: points[i], side: -1 })
    }
    return result
  })
  const random = mulberry32(seed ^ 0x706c6f74)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const sites: FrontageSite[] = []
  for (const request of requests) {
    if (!Number.isFinite(request.w) || !Number.isFinite(request.d) || !(request.w > 0 && request.d > 0)) continue
    for (const candidate of candidates) {
      const { point, segment, side } = candidate
      const length = Math.hypot(point.tangentX, point.tangentZ) || 1
      const nx = (-point.tangentZ / length) * side
      const nz = (point.tangentX / length) * side
      const radius = Math.hypot(request.w, request.d) / 2
      const offset = segment.width / 2 + radius + 2
      const x = point.x + nx * offset
      const z = point.z + nz * offset
      const footprint = { x, z, w: request.w, d: request.d }
      if (!isDryFootprint(footprint, 0, seed) || !clearsRoad(x, z, spans, radius + 0.5)) continue
      if (sites.some((other) => rectsOverlap(footprint, other, 1))) continue
      if (
        sites.some((other) => {
          const steps = Math.ceil(Math.hypot(other.entranceX - other.roadX, other.entranceZ - other.roadZ))
          for (let i = 0; i <= steps; i++) {
            const t = i / steps
            if (
              rectsOverlap(
                footprint,
                {
                  x: other.roadX + (other.entranceX - other.roadX) * t,
                  z: other.roadZ + (other.entranceZ - other.roadZ) * t,
                  w: 1,
                  d: 1,
                },
                0.5,
              )
            )
              return true
          }
          return false
        })
      )
        continue
      const inset = Math.min(
        Math.abs(nx) > 1e-6 ? request.w / (2 * Math.abs(nx)) : Infinity,
        Math.abs(nz) > 1e-6 ? request.d / (2 * Math.abs(nz)) : Infinity,
      )
      const entranceX = x - nx * inset
      const entranceZ = z - nz * inset
      let accessible = true
      const otherRoads = spans.filter((span) => span.id !== segment.id)
      const steps = Math.ceil(Math.hypot(entranceX - point.x, entranceZ - point.z))
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const px = point.x + (entranceX - point.x) * t
        const pz = point.z + (entranceZ - point.z) * t
        if (
          !isDryFootprint({ x: px, z: pz, w: 1, d: 1 }, 0, seed) ||
          !clearsRoad(px, pz, otherRoads, 0.5) ||
          sites.some((other) => rectsOverlap({ x: px, z: pz, w: 1, d: 1 }, other, 0.5))
        ) {
          accessible = false
          break
        }
      }
      if (!accessible) continue
      sites.push({ ...request, x, z, roadId: segment.id, roadX: point.x, roadZ: point.z, entranceX, entranceZ })
      break
    }
  }
  return sites
}

/** Seeded roadside furniture with dry foundations and conservative clearance. */
export function generateRoadsideProps(
  graph: RoadGraph,
  seed: number,
  obstacles: readonly WorldRect[],
): RoadsideProp[] {
  const segments = Object.values(graph.segments).sort((a, b) => a.id.localeCompare(b.id))
  const sampled = segments.flatMap((segment) => {
    if (!(segment.from in graph.nodes) || !(segment.to in graph.nodes)) return []
    const a = graph.nodes[segment.from]
    const b = graph.nodes[segment.to]
    const points = sampleRoadCurve(a.x, a.z, b.x, b.z, segment.curve, segment.id, 2)
    return [{ segment, points }]
  })
  const roads = sampled.flatMap(({ segment, points }) =>
    points.slice(1).map((point, index) => ({
      x1: points[index].x,
      z1: points[index].z,
      x2: point.x,
      z2: point.z,
      width: segment.width,
    })),
  )
  const out: RoadsideProp[] = []
  for (const { segment, points } of sampled) {
    if (points.length < 7) continue
    let hash = seed >>> 0
    for (const char of segment.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
    const random = mulberry32(hash)
    for (const kind of ['shelter', 'hydrant', 'lamp'] as const) {
      if (
        (kind === 'shelter' && (out.filter((prop) => prop.kind === kind).length >= 8 || random() > 0.35)) ||
        (kind === 'hydrant' && (out.filter((prop) => prop.kind === kind).length >= 24 || random() > 0.65)) ||
        (kind === 'lamp' && (out.filter((prop) => prop.kind === kind).length >= 60 || random() > 0.8))
      )
        continue
      const point = points[Math.floor((0.3 + random() * 0.4) * (points.length - 1))]
      const length = Math.hypot(point.tangentX, point.tangentZ) || 1
      const side = random() < 0.5 ? -1 : 1
      const radius = kind === 'shelter' ? 1.55 : 0.3
      const offset = segment.width / 2 + 1.15 + radius
      const x = point.x - (point.tangentZ / length) * offset * side
      const z = point.z + (point.tangentX / length) * offset * side
      const footprint = { x, z, w: radius * 2, d: radius * 2 }
      if (!isDryFootprint(footprint, 0, seed) || !clearsRoad(x, z, roads, radius + 0.2)) continue
      if (obstacles.some((box) => rectsOverlap(footprint, box, 0.5))) continue
      if (
        out.some(
          (other) => Math.hypot(x - other.x, z - other.z) < radius + (other.kind === 'shelter' ? 1.55 : 0.3) + 1,
        )
      )
        continue
      out.push({ roadId: segment.id, kind, x, z, rotation: Math.atan2(-point.tangentZ, point.tangentX) })
    }
  }
  return out
}

/** Grow a deterministic connected network while keeping corridors on dry, unoccupied ground. */
export function generateIslandRoads(seed: number, obstacles: readonly WorldRect[]): RoadGraph {
  const random = mulberry32(seed)
  const nodes: RoadGraph['nodes'] = { 'seed:0': { id: 'seed:0', x: -90, z: -85, kind: 'endpoint' } }
  const segments: RoadGraph['segments'] = {}
  const roads: GeneratedRoad[] = []
  for (let attempt = 0; attempt < 1400 && roads.length < 48; attempt++) {
    const candidates = Object.values(nodes)
    const origin = candidates[Math.floor(random() * candidates.length)]
    const angle = random() * Math.PI * 2
    const proposedLength = 20 + random() * 24
    const proposed = { x: origin.x + Math.cos(angle) * proposedLength, z: origin.z + Math.sin(angle) * proposedLength }
    const targetNode = candidates
      .filter((node) => node.id !== origin.id && Math.hypot(node.x - proposed.x, node.z - proposed.z) < 10)
      .sort((a, b) => Math.hypot(a.x - proposed.x, a.z - proposed.z) - Math.hypot(b.x - proposed.x, b.z - proposed.z))
      .at(0)
    const target = targetNode ?? proposed
    const length = Math.hypot(target.x - origin.x, target.z - origin.z)
    if (length < 12) continue
    if (Math.abs(target.x) > 240 || Math.abs(target.z) > 240) continue
    const incident = roads.filter(
      (road) =>
        (road.x1 === origin.x && road.z1 === origin.z) ||
        (road.x2 === origin.x && road.z2 === origin.z) ||
        (road.x1 === target.x && road.z1 === target.z) ||
        (road.x2 === target.x && road.z2 === target.z),
    )
    if (
      incident.some((road) => {
        const atOrigin =
          (road.x1 === origin.x && road.z1 === origin.z) || (road.x2 === origin.x && road.z2 === origin.z)
        const junction = atOrigin ? origin : target
        const otherX = road.x1 === junction.x && road.z1 === junction.z ? road.x2 : road.x1
        const otherZ = road.x1 === junction.x && road.z1 === junction.z ? road.z2 : road.z1
        const newX = atOrigin ? target.x - origin.x : origin.x - target.x
        const newZ = atOrigin ? target.z - origin.z : origin.z - target.z
        const oldX = otherX - junction.x
        const oldZ = otherZ - junction.z
        return (newX * oldX + newZ * oldZ) / (length * Math.hypot(oldX, oldZ)) > Math.cos(Math.PI / 4)
      })
    )
      continue
    const otherRoads = roads.filter((road) => !incident.includes(road))
    let valid = true
    const steps = Math.ceil(length / 2)
    for (let step = 0; step <= steps && valid; step++) {
      const t = step / steps
      const x = origin.x + (target.x - origin.x) * t
      const z = origin.z + (target.z - origin.z) * t
      if (
        !isDryFootprint({ x, z, w: 5, d: 5 }, 0, seed) ||
        obstacles.some((box) => Math.abs(x - box.x) < box.w / 2 + 3 && Math.abs(z - box.z) < box.d / 2 + 3)
      ) {
        valid = false
        break
      }
      if (!clearsRoad(x, z, otherRoads, 3)) valid = false
    }
    if (!valid) continue
    const id = targetNode?.id ?? `seed:${roads.length + 1}`
    const segmentId = `seed-road:${roads.length}`
    if (!targetNode) nodes[id] = { id, x: target.x, z: target.z, kind: 'endpoint' }
    else nodes[id].kind = 'intersection'
    nodes[origin.id].kind = 'intersection'
    segments[segmentId] = { id: segmentId, from: origin.id, to: id, curve: 0, width: 3 }
    roads.push({ id: segmentId, x1: origin.x, z1: origin.z, x2: target.x, z2: target.z, width: 3 })
  }
  return { nodes, segments }
}

/** Place regional buildings beside existing roads, retaining a dry pedestrian approach. */
export function generateRoadsideMassing(
  graph: RoadGraph,
  seed: number,
  obstacles: readonly WorldRect[],
): RegionalMassing[] {
  const random = mulberry32(seed ^ 0x52a4)
  const roads = Object.values(graph.segments).map((segment) => ({
    id: segment.id,
    x1: graph.nodes[segment.from].x,
    z1: graph.nodes[segment.from].z,
    x2: graph.nodes[segment.to].x,
    z2: graph.nodes[segment.to].z,
    width: segment.width,
  }))
  const buildings: RegionalMassing[] = []
  const facades: RegionalMassing['facade'][] = ['coral', 'mango', 'aqua', 'lime']
  const approachIntersects = (access: NonNullable<RegionalMassing['access']>, box: WorldRect): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(access.doorX - access.roadX, access.doorZ - access.roadZ) * 2))
    for (let i = 0; i <= steps; i++) {
      const x = access.roadX + ((access.doorX - access.roadX) * i) / steps
      const z = access.roadZ + ((access.doorZ - access.roadZ) * i) / steps
      if (Math.abs(x - box.x) < box.w / 2 + 0.5 && Math.abs(z - box.z) < box.d / 2 + 0.5) return true
    }
    return false
  }
  for (const road of roads) {
    const dx = road.x2 - road.x1
    const dz = road.z2 - road.z1
    const length = Math.hypot(dx, dz)
    if (length < 12) continue
    const nx = -dz / length
    const nz = dx / length
    for (const side of [-1, 1]) {
      const t = 0.35 + random() * 0.3
      const roadX = road.x1 + dx * t
      const roadZ = road.z1 + dz * t
      const width = 6 + random() * 2
      const depth = 6 + random() * 2
      const offset = road.width / 2 + Math.hypot(width, depth) / 2 + 2
      const building: RegionalMassing = {
        x: roadX + nx * offset * side,
        z: roadZ + nz * offset * side,
        w: width,
        d: depth,
        h: 5 + random() * 12,
        yaw: Math.atan2(-dz, dx),
        facade: facades[Math.floor(random() * facades.length)],
        zone: 'suburban',
        access: {
          roadId: road.id,
          roadX: roadX + nx * (road.width / 2 + 0.2) * side,
          roadZ: roadZ + nz * (road.width / 2 + 0.2) * side,
          doorX: roadX + nx * (offset - depth / 2) * side,
          doorZ: roadZ + nz * (offset - depth / 2) * side,
        },
      }
      const radius = Math.hypot(width, depth) / 2
      const bounds = { x: building.x, z: building.z, w: radius * 2, d: radius * 2 }
      if (!isDryFootprint(building, building.yaw, seed)) continue
      if (!clearsRoad(building.x, building.z, roads, radius + 0.75)) continue
      if (obstacles.some((other) => rectsOverlap(bounds, other, 0.75))) continue
      if (buildings.some((other) => other.access && approachIntersects(other.access, bounds))) continue
      if (
        buildings.some((other) => {
          const diameter = Math.hypot(other.w, other.d)
          return rectsOverlap(bounds, { ...other, w: diameter, d: diameter }, 0.75)
        })
      )
        continue
      if (
        [...obstacles, ...buildings].some((other) => {
          const diameter = 'yaw' in other ? Math.hypot(other.w, other.d) : 0
          const box = diameter ? { ...other, w: diameter, d: diameter } : other
          return approachIntersects(building.access!, box)
        })
      )
        continue
      let dryApproach = true
      for (let i = 0; i <= Math.ceil(offset); i++) {
        const t = i / Math.ceil(offset)
        if (
          !isDryFootprint(
            { x: roadX + nx * offset * side * t, z: roadZ + nz * offset * side * t, w: 1, d: 1 },
            0,
            seed,
          )
        ) {
          dryApproach = false
          break
        }
        const x = roadX + nx * offset * side * t
        const z = roadZ + nz * offset * side * t
        if (obstacles.some((box) => Math.abs(x - box.x) < box.w / 2 + 0.5 && Math.abs(z - box.z) < box.d / 2 + 0.5)) {
          dryApproach = false
          break
        }
      }
      if (dryApproach) buildings.push(building)
    }
  }
  return buildings
}

/** Deterministic rejection sampler used for vegetation and small props. */
export function clearPropPositions(
  seed: number,
  centre: { x: number; z: number },
  count: number,
  radius: number,
  roads: readonly { x1: number; z1: number; x2: number; z2: number; width: number }[],
): { x: number; z: number }[] {
  const rand = mulberry32(seed)
  const accepted: { x: number; z: number }[] = []
  for (let attempt = 0; attempt < count * 24 && accepted.length < count; attempt++) {
    const angle = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * radius
    const candidate = { x: centre.x + Math.cos(angle) * r, z: centre.z + Math.sin(angle) * r }
    if (!clearsRoad(candidate.x, candidate.z, roads)) continue
    if (accepted.some((p) => Math.hypot(p.x - candidate.x, p.z - candidate.z) < 1.4)) continue
    accepted.push(candidate)
  }
  return accepted
}

/**
 * Validate a generated district before it reaches the renderer.  A road may
 * meet another only at a declared shared endpoint; parcels must not overlap
 * each other or a road verge.  This is deliberately O(n²): a streamed tile
 * contains tens, not millions, of parcels, and this cheap gate avoids GPU
 * artifacts entirely.
 */
export function validateGeneratedLayout(
  parcels: readonly (WorldRect & { id: string })[],
  roads: readonly GeneratedRoad[],
  clearance = 0.75,
  options: { maxSlope?: number; excludeWater?: boolean; seed?: number } = {},
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (let i = 0; i < parcels.length; i++) {
    const parcel = parcels[i]
    for (let j = i + 1; j < parcels.length; j++) {
      if (rectsOverlap(parcel, parcels[j], clearance))
        issues.push({ kind: 'building-overlap', ids: [parcel.id, parcels[j].id] })
    }
    for (const road of roads) {
      const samples = [
        [parcel.x - parcel.w / 2, parcel.z - parcel.d / 2],
        [parcel.x + parcel.w / 2, parcel.z - parcel.d / 2],
        [parcel.x - parcel.w / 2, parcel.z + parcel.d / 2],
        [parcel.x + parcel.w / 2, parcel.z + parcel.d / 2],
      ]
      if (samples.some(([x, z]) => !clearsRoad(x, z, [road], clearance))) {
        issues.push({ kind: 'road-clearance', ids: [parcel.id, road.id] })
      }
    }
    if (options.excludeWater && !isDryFootprint(parcel, 0, options.seed)) {
      issues.push({ kind: 'water-exclusion', ids: [parcel.id, 'regional-water'] })
    }
    if (options.maxSlope !== undefined && terrainSlope(parcel.x, parcel.z, options.seed) > options.maxSlope) {
      issues.push({ kind: 'terrain-slope', ids: [parcel.id, 'terrain-grade'] })
    }
  }
  for (let i = 0; i < roads.length; i++) {
    const a = roads[i]
    for (let j = i + 1; j < roads.length; j++) {
      const b = roads[j]
      const sharedEndpoint =
        (a.x1 === b.x1 && a.z1 === b.z1) ||
        (a.x1 === b.x2 && a.z1 === b.z2) ||
        (a.x2 === b.x1 && a.z2 === b.z1) ||
        (a.x2 === b.x2 && a.z2 === b.z2)
      const aMidX = (a.x1 + a.x2) / 2
      const aMidZ = (a.z1 + a.z2) / 2
      const bMidX = (b.x1 + b.x2) / 2
      const bMidZ = (b.z1 + b.z2) / 2
      if (!sharedEndpoint && Math.hypot(aMidX - bMidX, aMidZ - bMidZ) < Math.max(a.width, b.width)) {
        issues.push({ kind: 'road-overlap', ids: [a.id, b.id] })
      }
    }
  }
  return issues
}

// ---- The fully procedural world manifest (R059) ---------------------------

/** One placed element, stamped with the generator rule that produced it. */
export interface WorldPlacement {
  id: string
  kind: 'road' | 'building' | 'vegetation' | 'prop'
  x: number
  z: number
  w: number
  d: number
  h: number
  yaw?: number
  /** Road endpoints, for the junction rule of the placement audit (R062). */
  x1?: number
  z1?: number
  x2?: number
  z2?: number
  /** The generator rule that produced this element — the only provenance a placement may have (R059). */
  rule: string
}

/** The complete world derived from the seed: environment, map and placements. */
export interface WorldManifest {
  seed: number
  environment: {
    seaLevel: number
    islandCentre: { x: number; z: number }
    coastline: { theta: number; x: number; z: number }[]
    biomes: { x: number; z: number; biome: RegionalBiome }[]
    waterTiles: string[]
  }
  map: {
    tiles: RegionalTile[]
    zoneCounts: Record<RegionalZone, number>
  }
  placements: WorldPlacement[]
}

// ---- Density tiers and zone-based spawn (R061) ----------------------------

/** The three density tiers of the generated map. */
export type DensityTier = 'rural' | 'suburban' | 'city-center'

/** A catalog building family as referenced by a tier program (dimensions from the catalog). */
export interface CatalogFamilyRef {
  id: string
  w: number
  d: number
  h: number
}

export interface ZoneSpawnRecipe {
  tier: DensityTier
  /** Max spawns per district tile. */
  perTile: number
  /** Probability the tile spawns at all (deterministic under the seed). */
  fill: number
  minH: number
  maxH: number
  /** The catalog program: the families this zone may spawn. */
  program: readonly CatalogFamilyRef[]
}

export const CITY_CENTRE_PROGRAM: readonly CatalogFamilyRef[] = [
  { id: 'building.skyscraper-slab', w: 15.0, d: 12.0, h: 34.75 },
  { id: 'building.skyscraper-setback', w: 22, d: 18, h: 51.65 },
  { id: 'building.skyscraper-tapered', w: 17.0, d: 17.0, h: 47.55 },
  { id: 'building.skyscraper-twin', w: 21.25, d: 9.25, h: 31.35 },
  { id: 'building.skyscraper-podium', w: 24, d: 20, h: 37.95 },
  { id: 'building.office-tower', w: 5.18, d: 4.89, h: 21.15 },
  { id: 'building.office-campus', w: 31.12, d: 25.06, h: 13.7 },
  { id: 'building.mall', w: 28.6, d: 22.7, h: 8.85 },
  { id: 'building.hotel', w: 6.135, d: 6.025, h: 14.65 },
  { id: 'building.hospital', w: 20.6, d: 15.3, h: 15.0 },
  { id: 'building.university', w: 28.0, d: 18, h: 7.7 },
  { id: 'building.city-hall', w: 24.0, d: 18.5, h: 13.1 },
  { id: 'building.civic-center', w: 28.3, d: 20, h: 9.0 },
  { id: 'building.courthouse', w: 22, d: 16, h: 11.0 },
  { id: 'building.stadium', w: 33.5, d: 28.0, h: 13.8 },
  { id: 'building.train-station', w: 24.6, d: 17.8, h: 12.2 },
  { id: 'building.apartment-rowhouse', w: 4.135, d: 5.03, h: 11.15 },
  { id: 'building.arcade', w: 12.6, d: 11.98, h: 6.75 },
  { id: 'building.restaurant-row', w: 16.6, d: 13.95, h: 6.45 },
]

export const SUBURBAN_PROGRAM: readonly CatalogFamilyRef[] = [
  { id: 'building.house-suburban', w: 14, d: 12, h: 8.5 },
  { id: 'building.house-detached', w: 6.4, d: 6.125, h: 6.32 },
  { id: 'building.grocery', w: 8.05, d: 7.025, h: 7.65 },
  { id: 'building.school-daycare', w: 20.965, d: 14.0, h: 4.8 },
  { id: 'building.school-middle', w: 28.15, d: 20.0, h: 6.8 },
  { id: 'building.school-high', w: 36.2, d: 34.0, h: 13.4 },
  { id: 'building.fast-food', w: 21.3, d: 14.6, h: 9.55 },
  { id: 'building.clinic', w: 8.05, d: 4.925, h: 7.85 },
  { id: 'building.library', w: 20, d: 18, h: 8.75 },
  { id: 'building.post-office', w: 20, d: 14, h: 7.95 },
  { id: 'building.shop-bakery', w: 4.185, d: 5.422, h: 4.55 },
  { id: 'building.movie-theater', w: 20.6, d: 15.9, h: 13.9 },
  { id: 'building.police-station', w: 12.6, d: 9.8, h: 13.3 },
  { id: 'building.firehouse', w: 14.6, d: 11.12, h: 9.3 },
  { id: 'building.apartment-rowhouse', w: 4.135, d: 5.03, h: 11.15 },
]

export const RURAL_PROGRAM: readonly CatalogFamilyRef[] = [
  { id: 'building.farm-barn', w: 18.232, d: 12.0, h: 9.2 },
  { id: 'building.farm-house', w: 14.0, d: 11.1, h: 8.346 },
  { id: 'building.fuel-station', w: 11.2, d: 8.3, h: 4.82 },
  { id: 'building.warehouse', w: 28, d: 20, h: 8.065 },
  { id: 'building.garage', w: 10.05, d: 6.825, h: 6.3 },
  { id: 'building.coal-plant', w: 22.6, d: 14.6, h: 12.4 },
  { id: 'building.energy-plant', w: 24.6, d: 14.6, h: 14.4 },
  { id: 'building.nuclear-plant', w: 24.6, d: 14.75, h: 8.0 },
  { id: 'building.oil-gas-plant', w: 28, d: 24, h: 14.1 },
  { id: 'building.ore-plant', w: 26, d: 22, h: 9.5 },
  { id: 'building.shipyard', w: 24.6, d: 16.6, h: 9.3 },
  { id: 'building.substation', w: 18, d: 12.12, h: 3.05 },
  { id: 'building.water-works', w: 18.6, d: 12.6, h: 7.0 },
  { id: 'building.waste-recycling', w: 20, d: 14, h: 5.15 },
]

export const WATERFRONT_PROGRAM: readonly CatalogFamilyRef[] = [
  { id: 'building.waterfront-pavilion', w: 7.0, d: 7.0, h: 4.78 },
  { id: 'building.pier-carnival', w: 14.6, d: 18.6, h: 17.54 },
  { id: 'building.hotel', w: 6.135, d: 6.025, h: 14.65 },
]

/** The tier and program recipe for a zone: density, height and program rules (R061). */
export function tierRecipeFor(zone: RegionalZone): ZoneSpawnRecipe {
  switch (zone) {
    case 'civic-core':
      return { tier: 'city-center', perTile: 4, fill: 0.9, minH: 6.45, maxH: 51.65, program: CITY_CENTRE_PROGRAM }
    case 'rural':
      return { tier: 'rural', perTile: 1, fill: 0.5, minH: 3.05, maxH: 14.4, program: RURAL_PROGRAM }
    case 'waterfront':
      return {
        tier: 'suburban',
        perTile: 2,
        fill: 0.8,
        minH: 4.55,
        maxH: 17.54,
        program: [...WATERFRONT_PROGRAM, ...SUBURBAN_PROGRAM],
      }
    default:
      return { tier: 'suburban', perTile: 2, fill: 0.8, minH: 4.55, maxH: 13.9, program: SUBURBAN_PROGRAM }
  }
}

/** A zone-based building spawn from the catalog recipes. */
export interface ZoneBuildingSpawn {
  id: string
  x: number
  z: number
  w: number
  d: number
  h: number
  yaw: number
  tier: DensityTier
  zone: RegionalZone
  familyId: string
  /** The generator rule that produced this spawn. */
  rule: string
}

/**
 * Zone-based building spawn (R061): each dry district tile spawns building
 * families from the catalog program of its tier at the tier's density,
 * height and program rules. Deterministic under the seed; a different seed
 * yields different counts, heights and programs. Tier boundaries emerge
 * from the generation (the distance field), not from hand-drawn lines.
 */
export function spawnZoneBuildings(
  seed = CITY_WORLD_SEED,
  roads: readonly { x1: number; z1: number; x2: number; z2: number; width: number }[] = [],
  existing: readonly WorldRect[] = [],
): ZoneBuildingSpawn[] {
  const out: ZoneBuildingSpawn[] = []
  const rand = mulberry32(seed ^ 0x7a6f6e)
  for (const tile of generateRegionalTiles(seed)) {
    if (tile.hasWater) continue
    const recipe = tierRecipeFor(tile.zone)
    if (rand() > recipe.fill) continue
    const placed: WorldRect[] = []
    for (let i = 0; i < recipe.perTile; i++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const family = recipe.program[Math.floor(rand() * recipe.program.length)]
        const yaw = rand() * Math.PI
        const x = tile.x + (rand() - 0.5) * 60
        const z = tile.z + (rand() - 0.5) * 60
        if (!isDryFootprint({ x, z, w: family.w, d: family.d }, yaw, seed)) continue
        if (roads.length > 0 && !footprintClearsRoads({ x, z, w: family.w, d: family.d }, yaw, roads, 2.0)) continue
        const cos = Math.abs(Math.cos(yaw))
        const sin = Math.abs(Math.sin(yaw))
        const bounds: WorldRect = { x, z, w: family.w * cos + family.d * sin, d: family.w * sin + family.d * cos }
        if (placed.some((p) => rectsOverlap(bounds, p, 1.5))) continue
        if (out.some((p) => rectsOverlap(bounds, rotatedAabb(p.x, p.z, p.w, p.d, p.yaw), 1.5))) continue
        if (existing.some((p) => rectsOverlap(bounds, p, 1.5))) continue
        placed.push(bounds)
        out.push({
          id: `spawn:${tile.id}:${i}`,
          x,
          z,
          w: family.w,
          d: family.d,
          h: family.h,
          yaw,
          tier: recipe.tier,
          zone: tile.zone,
          familyId: family.id,
          rule: `spawn:${recipe.tier}:${tile.zone}`,
        })
        break
      }
    }
  }
  return out
}

/**
 * The world as the sole source of placement (R059): the environment
 * (terrain, biomes, the seeded coastline and hydrology), the map (district
 * tiles and the zone field) and every placement, all derived from the seed
 * through generator rules. The hand-authored catalog supplies the
 * vocabulary; nothing here is hand-placed. The same seed reproduces the
 * manifest bit-for-bit; a different seed yields a different but equally
 * complete world.
 */
export function generateWorld(seed = CITY_WORLD_SEED): WorldManifest {
  // Environment: the seeded coastline, the biome field on the tile grid and
  // the hydrology (the water tiles).
  const coastline = Array.from({ length: 72 }, (_, i) => {
    const theta = (i / 72) * Math.PI * 2
    const point = islandCoastPoint(theta, 0, seed)
    return { theta, x: point.x, z: point.z }
  })
  const biomes: WorldManifest['environment']['biomes'] = []
  const waterTiles: string[] = []
  for (let tz = -4; tz <= 4; tz++) {
    for (let tx = -4; tx <= 4; tx++) {
      const x = tx * 96
      const z = tz * 96
      biomes.push({ x, z, biome: regionalBiome(x, z) })
      if (isRegionalWater(x, z, seed)) waterTiles.push(`${tx}:${tz}`)
    }
  }
  // Map: the district tiles and the zone field.
  const tiles = generateRegionalTiles(seed)
  const zoneCounts: Record<RegionalZone, number> = { waterfront: 0, 'civic-core': 0, suburban: 0, rural: 0 }
  for (const tile of tiles) zoneCounts[tile.zone]++
  // Placements, nature first (R062): the vegetation seeds the land before
  // any infrastructure; roads, buildings and street furniture then place
  // only on dry, unobstructed ground and displace the vegetation at their
  // conflict points rather than stacking over it. Every element is stamped
  // with its generator rule.
  const placements: WorldPlacement[] = []
  const graph = generateIslandRoads(seed, [])
  const roadSpans: { x1: number; z1: number; x2: number; z2: number; width: number }[] = Object.values(
    graph.segments,
  ).map((segment) => {
    const a = graph.nodes[segment.from]
    const b = graph.nodes[segment.to]
    return { x1: a.x, z1: a.z, x2: b.x, z2: b.z, width: segment.width }
  })
  for (const segment of Object.values(graph.segments)) {
    const a = graph.nodes[segment.from]
    const b = graph.nodes[segment.to]
    placements.push({
      id: segment.id,
      kind: 'road',
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      w: Math.hypot(b.x - a.x, b.z - a.z),
      d: segment.width,
      h: 0,
      x1: a.x,
      z1: a.z,
      x2: b.x,
      z2: b.z,
      rule: 'road:island-growth',
    })
  }
  const regionalMassing = generateRegionalMassing(seed, 96, roadSpans)
  const massing = [
    ...regionalMassing,
    ...generateRoadsideMassing(
      graph,
      seed,
      regionalMassing.map((b) => rotatedAabb(b.x, b.z, b.w, b.d, b.yaw)),
    ),
  ]
  massing.forEach((building, index) =>
    placements.push({
      id: `massing:${index}`,
      kind: 'building',
      x: building.x,
      z: building.z,
      w: building.w,
      d: building.d,
      h: building.h,
      yaw: building.yaw,
      rule: `massing:${building.zone}`,
    }),
  )
  const zoneSpawns = spawnZoneBuildings(
    seed,
    roadSpans,
    massing.map((b) => rotatedAabb(b.x, b.z, b.w, b.d, b.yaw)),
  )
  zoneSpawns.forEach((spawn) =>
    placements.push({
      id: spawn.id,
      kind: 'building',
      x: spawn.x,
      z: spawn.z,
      w: spawn.w,
      d: spawn.d,
      h: spawn.h,
      yaw: spawn.yaw,
      rule: spawn.rule,
    }),
  )
  const buildingObstacles = [
    ...massing.map((b) => rotatedAabb(b.x, b.z, b.w, b.d, b.yaw)),
    ...zoneSpawns.map((s) => rotatedAabb(s.x, s.z, s.w, s.d, s.yaw)),
  ]
  const props = generateRoadsideProps(graph, seed, buildingObstacles)
  props.forEach((prop, index) =>
    placements.push({
      id: `prop:${index}`,
      kind: 'prop',
      x: prop.x,
      z: prop.z,
      w: prop.kind === 'shelter' ? 3.1 : 0.6,
      d: prop.kind === 'shelter' ? 3.1 : 0.6,
      h: 0,
      yaw: prop.rotation,
      rule: `prop:${prop.kind}`,
    }),
  )
  // The wild vegetation, displaced wherever infrastructure or buildings
  // take their ground: a road crossing a forest pushes the vegetation back
  // along its path, and nothing ever stacks over nature (R062).
  const wildPlants = generateRegionalPlants({ nodes: {}, segments: {} }, seed, [])
  const buildingBounds = placements
    .filter((p) => p.kind === 'building')
    .map((p) => rotatedAabb(p.x, p.z, p.w, p.d, p.yaw ?? 0))
  const propBounds = props.map((prop) => {
    const w = prop.kind === 'shelter' ? 3.1 : 0.6
    return rotatedAabb(prop.x, prop.z, w, w, prop.rotation)
  })
  wildPlants
    .filter(
      (plant) =>
        footprintClearsRoads({ x: plant.x, z: plant.z, w: 4.4, d: 4.4 }, 0, roadSpans, 0.5) &&
        !buildingBounds.some((bounds) => rectsOverlap({ x: plant.x, z: plant.z, w: 4.4, d: 4.4 }, bounds, 0)) &&
        !propBounds.some((bounds) => rectsOverlap({ x: plant.x, z: plant.z, w: 4.4, d: 4.4 }, bounds, 0)),
    )
    .forEach((plant, index) =>
      placements.push({
        id: `vegetation:${index}`,
        kind: 'vegetation',
        x: plant.x,
        z: plant.z,
        w: 4.4,
        d: 4.4,
        h: 0,
        rule: `vegetation:${plant.biome}`,
      }),
    )
  return {
    seed,
    environment: {
      seaLevel: SEA_LEVEL_M,
      islandCentre: { x: ISLAND_CENTRE_X, z: ISLAND_CENTRE_Z },
      coastline,
      biomes,
      waterTiles,
    },
    map: { tiles, zoneCounts },
    placements,
  }
}

/** The axis-aligned bounds of a rotated footprint (the placement envelope in plan). */
export function rotatedAabb(x: number, z: number, w: number, d: number, yaw = 0): WorldRect {
  const cos = Math.abs(Math.cos(yaw))
  const sin = Math.abs(Math.sin(yaw))
  return { x, z, w: w * cos + d * sin, d: w * sin + d * cos }
}

export interface ManifestAuditIssue {
  kind: 'footprint-overlap' | 'road-junction' | 'wet-footprint'
  ids: [string, string]
}

/**
 * The full-manifest placement audit (R062): no two placed elements may
 * overlap in footprint or envelope (the envelope is the footprint times
 * height, so plan non-overlap implies envelope non-overlap); roads may
 * meet only at a declared shared endpoint; and no dry infrastructure
 * covers mapped water — every placement stands on a dry footprint.
 */
export function auditManifest(seed: number, manifest: WorldManifest): ManifestAuditIssue[] {
  const issues: ManifestAuditIssue[] = []
  const entries = manifest.placements.map((p) => ({
    p,
    rect:
      p.kind === 'road'
        ? rotatedAabb(p.x, p.z, p.w, p.d, Math.atan2((p.z2 ?? 0) - (p.z1 ?? 0), (p.x2 ?? 0) - (p.x1 ?? 0)))
        : rotatedAabb(p.x, p.z, p.w, p.d, p.yaw ?? 0),
  }))
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j]
      if (a.p.kind === 'road' && b.p.kind === 'road') {
        // Roads meet only at declared shared endpoints; the carriageways of
        // two roads that do not share a node may not cross anywhere.
        const shared =
          (a.p.x1 === b.p.x1 && a.p.z1 === b.p.z1) ||
          (a.p.x1 === b.p.x2 && a.p.z1 === b.p.z2) ||
          (a.p.x2 === b.p.x1 && a.p.z2 === b.p.z1) ||
          (a.p.x2 === b.p.x2 && a.p.z2 === b.p.z2)
        if (shared) continue
        const gap = segSegClearanceM(a.p.x1!, a.p.z1!, a.p.x2!, a.p.z2!, b.p.x1!, b.p.z1!, b.p.x2!, b.p.z2!)
        if (gap < (a.p.d + b.p.d) / 2) issues.push({ kind: 'road-junction', ids: [a.p.id, b.p.id] })
      } else if (a.p.kind === 'road' || b.p.kind === 'road') {
        // Exact road geometry: a non-road footprint violates the moment it
        // enters a carriageway, whatever the yaw of either footprint.
        const road = a.p.kind === 'road' ? a.p : b.p
        const other = a.p.kind === 'road' ? b.p : a.p
        const gap = rectSegClearanceM(
          other.x,
          other.z,
          other.w,
          other.d,
          other.yaw ?? 0,
          road.x1!,
          road.z1!,
          road.x2!,
          road.z2!,
        )
        if (gap < road.d / 2) issues.push({ kind: 'footprint-overlap', ids: [other.id, road.id] })
      } else if (rectsOverlap(a.rect, b.rect, 0)) {
        issues.push({ kind: 'footprint-overlap', ids: [a.p.id, b.p.id] })
      }
    }
    // Mapped water is never covered by dry infrastructure.
    if (a.p.kind !== 'road' && !isDryFootprint(a.p, a.p.yaw ?? 0, seed)) {
      issues.push({ kind: 'wet-footprint', ids: [a.p.id, 'regional-water'] })
    }
  }
  // Roads are surveyed along their length: their envelope is too large for
  // the bounded footprint surveyor.
  for (const p of manifest.placements) {
    if (p.kind !== 'road') continue
    const steps = Math.max(1, Math.ceil(p.w / 2))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = (p.x1 ?? p.x) + ((p.x2 ?? p.x) - (p.x1 ?? p.x)) * t
      const z = (p.z1 ?? p.z) + ((p.z2 ?? p.z) - (p.z1 ?? p.z)) * t
      if (!isDryFootprint({ x, z, w: p.d, d: p.d }, 0, seed)) {
        issues.push({ kind: 'wet-footprint', ids: [p.id, 'regional-water'] })
        break
      }
    }
  }
  return issues
}

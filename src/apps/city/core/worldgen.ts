/**
 * Deterministic world-generation rules for Arbora City.  These rules are
 * intentionally cheap enough to run during layout generation: no physics
 * engine or noise texture is required to decide whether a road, tree or
 * building may occupy a place.
 */
import { mulberry32 } from '@/lib/scene3d/generators'

export interface WorldRect {
  x: number
  z: number
  w: number
  d: number
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
  facade: RegionalTile['facade']
  zone: Exclude<RegionalZone, 'waterfront'>
}

/** The world seed is part of the city recipe, never a call to Math.random. */
export const CITY_WORLD_SEED = 20261120
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
  const riverCentre = 42 + Math.sin(z * 0.012) * 15
  return Math.abs(x - riverCentre) < 8 + setback
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
export function generateRegionalMassing(seed = CITY_WORLD_SEED, tileSize = 96): RegionalMassing[] {
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
export function clearsRoad(
  x: number,
  z: number,
  roads: readonly { x1: number; z1: number; x2: number; z2: number; width: number }[],
  margin = 0.75,
): boolean {
  return roads.every(
    (road) => pointSegmentDistanceSq(x, z, road.x1, road.z1, road.x2, road.z2) >= (road.width / 2 + margin) ** 2,
  )
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

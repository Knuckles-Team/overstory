/**
 * @file generators/index.ts
 * @description The R012.10 generator kit (OVERSTORY-DESIGN-R012.10): the
 * seeded, parametric generators the city (and any future 3D surface) uses
 * to produce buildings, road tiles and street furniture from recipes.
 * The same seed always produces the same asset, every asset stays within
 * its declared budget, and every manifest entry's hash regenerates from
 * the recipe — that is the bar `generators.test.ts` verifies.
 */
export { ARCHITECTURE, fnv1a, geometryHash, buildingAsset } from './buildings'
export type { AtlasRegion, BuildingAsset, BuildingParams, DistrictArchetype } from './buildings'
export { roadTileAsset } from './roads'
export type { RoadTileAsset, RoadTileParams } from './roads'
export { PROP_TRIANGLE_BUDGET, propAsset } from './props'
export type { PropAsset, PropKind, PropParams } from './props'
export { mulberry32 } from './rng'
export { DEFAULT_TERRAIN, generateTerrain, maxSlope, waterFraction } from './terrain'
export type { Heightmap, TerrainParams } from './terrain'

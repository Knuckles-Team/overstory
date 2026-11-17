/**
 * @file budgets.ts
 * @description The city's performance and asset-QA budgets, as data
 * (OVERSTORY-CITY-R013/R028). The asset-QA tests (R028 assetQa) and the scene
 * measurement tests (R028 perfBudget) read this one table rather than
 * carrying their own copies, so the budgets a locked asset must clear and the
 * budgets the scene must hold are stated once and stay in agreement.
 */

/**
 * The budget table. `asset*` are the per-locked-GLB QA budgets a pinned
 * asset must clear before it enters the lock (R013/R024); the rest are the
 * scene performance budgets checked against the bundled snapshot (R028).
 */
export const BUDGETS = {
  // Asset QA: per locked GLB (triangles, material count, texture size).
  assetTriangles: 4000,
  assetMaterials: 16,
  assetTexturePx: 2048,
  // Performance: the scene over the bundled snapshot.
  trianglesPerBuilding: 4000,
  drawCallsPerDistrict: 150,
  textureMemoryMB: 32,
  fpsIntegrated: 60,
  fpsMobile: 30,
} as const

export type Budgets = typeof BUDGETS

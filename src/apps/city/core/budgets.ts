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
  // Load (R028 amendment 2026-11-20): the whole shipped city, one streamed chunk.
  initialLoadBytes: 5 * 1024 * 1024,
  chunkBytes: 200 * 1024,
  chunkDrawCalls: 50,
  chunkMemoryMB: 8,
} as const

export type Budgets = typeof BUDGETS

/** The measured cost of one streamed chunk (R028, R041). */
export interface ChunkCost {
  /** The serialized payload size: what the chunk costs on the wire. */
  bytes: number
  /** Instanced draw calls: one per archetype family, plus roads and decor. */
  drawCalls: number
  /** Instance matrices (64 B each) plus the road ribbon vertices, in MB. */
  memoryMB: number
}

/** Measure a chunk from its real payload. The instanced layout fixes draw calls per family. */
export function chunkCost(chunk: { buildings: { archetype: { family: string } }[]; roads: unknown[] }): ChunkCost {
  const bytes = new TextEncoder().encode(JSON.stringify(chunk)).length
  const families = new Set(chunk.buildings.map((b) => b.archetype.family))
  const matrices = chunk.buildings.length * 64
  const ribbons = chunk.roads.length * 4 * 12 * 2
  return { bytes, drawCalls: families.size + 2, memoryMB: (matrices + ribbons) / (1024 * 1024) }
}

/** The chunk gate: the budgets a streamed chunk must hold. Returns the broken budgets, empty when it passes. */
export function chunkBreaches(cost: ChunkCost): string[] {
  const out: string[] = []
  if (cost.bytes > BUDGETS.chunkBytes) out.push('chunkBytes')
  if (cost.drawCalls > BUDGETS.chunkDrawCalls) out.push('chunkDrawCalls')
  if (cost.memoryMB > BUDGETS.chunkMemoryMB) out.push('chunkMemoryMB')
  return out
}

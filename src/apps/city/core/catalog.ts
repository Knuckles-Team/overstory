/**
 * @file catalog.ts
 * @description The versioned kit catalog at runtime (OVERSTORY-CITY-R063,
 * consumed by the catalog renderer of OVERSTORY-CITY-R067): the startup
 * verify fetches catalog.json once and installs the pinned-path → family
 * map, so every placed model can carry its catalog family id and source
 * stage as provenance without a render-time fetch. Catalog integrity
 * (catalog, lock and disk in sync at the full family count) is gated by
 * catalog.test.ts.
 */

/** One catalog family's provenance identity. */
export interface CatalogFamily {
  /** The catalog family id (e.g. `building.skyscraper-slab`). */
  id: string
  /** The asset-pipeline stage that authored the family. */
  source: string
}

/** The entry shape of catalog.json (the fields provenance records). */
export interface CatalogEntry {
  file: string
  id: string
  source: string
}

let byFile = new Map<string, CatalogFamily>()

/** Install the catalog entries (the startup verify fetches catalog.json). */
export function setCatalog(entries: CatalogEntry[]): void {
  byFile = new Map(entries.map((e) => [`city-assets/${e.file}`, { id: e.id, source: e.source }]))
}

/** The catalog family a pinned kit path belongs to; null for non-kit pins. */
export function catalogFamily(path: string): CatalogFamily | null {
  return byFile.get(path) ?? null
}

/** The installed family count (the debug surface and tests read it). */
export function catalogFamilyCount(): number {
  return byFile.size
}

/** Test seam. */
export function clearCatalog(): void {
  byFile = new Map()
}

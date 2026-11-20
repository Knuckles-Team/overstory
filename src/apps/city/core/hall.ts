/**
 * @file hall.ts
 * @description The Hall of Records growth rule (OVERSTORY-CITY-R038).
 * Memory is a building. New memories add shelves, then wings, then floors,
 * by declared constants. Each modality gets its own wing. The hall reads
 * counts only, never memory content (R017).
 */
import type { RecordCount } from './graphFacts'

/** Records one shelf holds. */
export const RECORDS_PER_SHELF = 10
/** Shelves one wing floor holds before a floor is added. */
export const SHELVES_PER_FLOOR = 8
/** The highest hall a single wing grows before it needs a neighbouring building. */
export const MAX_FLOORS = 12

export interface Wing {
  modality: string
  records: number
  shelves: number
  floors: number
}

export interface Hall {
  wings: Wing[]
  /** Total shelves across wings. */
  shelves: number
  /** The tallest wing: the building height in floors. */
  floors: number
}

/** Derive the hall from the record counts. Wings follow modality name order, so the result is stable. */
export function hallFor(records: RecordCount[]): Hall {
  const wings: Wing[] = [...records]
    .sort((a, b) => (a.modality < b.modality ? -1 : a.modality > b.modality ? 1 : 0))
    .map((r) => {
      const shelves = Math.ceil(Math.max(0, r.count) / RECORDS_PER_SHELF)
      const floors = Math.min(MAX_FLOORS, Math.max(1, Math.ceil(shelves / SHELVES_PER_FLOOR)))
      return { modality: r.modality, records: r.count, shelves, floors }
    })
  return {
    wings,
    shelves: wings.reduce((s, w) => s + w.shelves, 0),
    floors: wings.reduce((m, w) => Math.max(m, w.floors), 0),
  }
}

export interface RecallStep {
  at: 'entrance' | 'stacks' | 'catalogue'
  wing?: string
  shelf?: number
}

/**
 * A recall sends a clerk into the stacks and back: entrance, catalogue,
 * the wing's shelf, then back to the entrance. The shelf is a pure function
 * of the record index, so the same recall always walks the same path.
 */
export function planRecall(hall: Hall, modality: string, recordIndex: number): RecallStep[] {
  const wing = hall.wings.find((w) => w.modality === modality)
  if (!wing) return [{ at: 'entrance' }, { at: 'catalogue' }, { at: 'entrance' }]
  const shelf = Math.min(wing.shelves - 1, Math.floor(recordIndex / RECORDS_PER_SHELF))
  return [
    { at: 'entrance' },
    { at: 'catalogue' },
    { at: 'stacks', wing: modality, shelf: Math.max(0, shelf) },
    { at: 'entrance' },
  ]
}

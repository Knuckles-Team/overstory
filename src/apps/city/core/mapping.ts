/**
 * @file mapping.ts
 * @description The mapping registry: graph class to city archetype
 * (OVERSTORY-CITY-R035, constitution R-G1). The registry is data. No branch
 * names a class, a user, a business, a product or a connector, so a new
 * connector or business grows the city with no code change.
 */

/** The forms a graph fact can take in the city. */
export type PlaceForm =
  'district' | 'block' | 'building' | 'citizen' | 'workshop' | 'hall' | 'archive' | 'exchange' | 'postoffice' | 'lot'

/** One registry entry. `scale` orders forms: a district holds blocks, a block holds buildings. */
export interface Archetype {
  form: PlaceForm
  /** The generator archetype family (matches the layout archetype vocabulary). */
  family: 'gateway' | 'datahall' | 'workshop' | 'storehouse' | 'studio' | 'docks'
  /** True when the place is a container whose children are floors, rooms or buildings. */
  container: boolean
}

/** The one declared registry: ontology class to archetype. */
export const ARCHETYPE_REGISTRY: Readonly<Record<string, Archetype>> = {
  Organization: { form: 'district', family: 'gateway', container: true },
  Business: { form: 'district', family: 'gateway', container: true },
  Connector: { form: 'block', family: 'gateway', container: true },
  ConnectorApp: { form: 'building', family: 'studio', container: false },
  Tool: { form: 'building', family: 'workshop', container: false },
  Agent: { form: 'citizen', family: 'studio', container: false },
  Skill: { form: 'workshop', family: 'workshop', container: false },
  Workflow: { form: 'workshop', family: 'workshop', container: false },
  MemoryRecord: { form: 'hall', family: 'datahall', container: true },
  Document: { form: 'archive', family: 'storehouse', container: false },
  Media: { form: 'archive', family: 'storehouse', container: false },
  TimeSeries: { form: 'exchange', family: 'docks', container: false },
  Market: { form: 'exchange', family: 'docks', container: false },
  Message: { form: 'postoffice', family: 'gateway', container: false },
}

/** The honest fallback for a class the registry does not know. */
export const GENERIC_LOT: Archetype = { form: 'lot', family: 'storehouse', container: false }

/** Look up a class; an unknown class is a generic lot, never an invented archetype. */
export function archetypeFor(cls: string): Archetype {
  return ARCHETYPE_REGISTRY[cls] ?? GENERIC_LOT
}

/** True when the registry has an entry for the class. */
export function isMapped(cls: string): boolean {
  return cls in ARCHETYPE_REGISTRY
}

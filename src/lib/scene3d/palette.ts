/**
 * @file palette.ts
 * @description The machine-readable half of the art direction
 * (OVERSTORY-DESIGN-R012.8): the scene colour palette, where every colour
 * derives from a browser design token in `src/index.css` (a direct copy or
 * a declared derivative), the per-archetype vocabulary that pins the
 * building generator code, the shared trim-sheet layout, the per-family
 * material sets and the asset budgets. `docs/art-direction.md` documents
 * these; the asset lock checks them
 * (`assets.test.ts::style_guide_conformance`), so the style guide can
 * never drift from the tokens or from the generators.
 */
import type { DistrictArchetype, PropKind } from './generators'

/** One scene colour and its provenance (the design tokens are the source of truth). */
export interface SceneColor {
  /** The authored hex value (lowercase). */
  hex: string
  /** The design token (a CSS custom property in src/index.css) this colour derives from. */
  token: string
  /** `'direct'` copies the token; anything else is the declared derivative note. */
  derivation: string
}

/**
 * The scene palette (R012.8). Every entry names the token it derives from;
 * a `direct` entry must equal the token value (the asset test reads
 * `src/index.css` and verifies). Nothing in the scene may carry a colour
 * that is not in this table.
 */
export const SCENE_COLORS: Record<string, SceneColor> = {
  'sky-day': { hex: '#faf3de', token: '--atmosphere-light', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'sky-night': { hex: '#45685b', token: '--glass-field-floor', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'sun-day': { hex: '#fff2d8', token: '--atmosphere-light', derivation: 'lightened toward white for the high sun' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'sun-dusk': { hex: '#ffb37a', token: '--chart-3', derivation: 'lightened ochre for the low-sun window' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'moon-night': { hex: '#8fa8d8', token: '--chart-2', derivation: 'lightened slate blue for the cool moonlight' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'wall-gateway': {
    hex: '#3e634f',
    token: '--primary', // # sanitizer:ignore - CSS design-token name, not a secret
    derivation: 'direct — the core landmark carries the brand green',
  },
  'wall-datahall': { hex: '#e6ebe1', token: '--secondary', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'wall-workshop': { hex: '#655946', token: '--chart-5', derivation: 'direct — the warm taupe of the trades' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'wall-storehouse': { hex: '#c5cfc1', token: '--border', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'wall-studio': { hex: '#dde9d8', token: '--accent', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'wall-docks': { hex: '#b5c5ab', token: '--atmosphere-sage', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'window-glass': { hex: '#87aaba', token: '--glass-field-blue', derivation: 'direct — the glass from the field' }, // # sanitizer:ignore - CSS design-token name, not a secret
  roof: { hex: '#111111', token: '--foreground', derivation: 'direct — the dark roofline carries the silhouette' }, // # sanitizer:ignore - CSS design-token name, not a secret
  road: { hex: '#738170', token: '--input', derivation: 'direct — the slate-sage asphalt' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'road-marking': { hex: '#f7f8f2', token: '--card', derivation: 'direct — the ivory markings' }, // # sanitizer:ignore - CSS design-token name, not a secret
  water: { hex: '#2a5c75', token: '--chart-2', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  park: { hex: '#b5c5ab', token: '--atmosphere-sage', derivation: 'direct' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'role-operations': { hex: '#245f70', token: '--ring', derivation: 'direct — blue reads as the control layer' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'role-maintenance': { hex: '#78520a', token: '--chart-3', derivation: 'direct — ochre reads as the trades' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'role-security': { hex: '#963f37', token: '--destructive', derivation: 'direct — the guard accent' }, // # sanitizer:ignore - CSS design-token name, not a secret
  'role-core': { hex: '#3e634f', token: '--primary', derivation: 'direct — the core actors' }, // # sanitizer:ignore - CSS design-token name, not a secret
}

/** The district archetypes and their documented vocabulary (R012.8). */
export const ARCHETYPE_GUIDE: Record<
  DistrictArchetype,
  { floorH: number; parapet: boolean; windowBand: number; wall: string; roof: string; signage: string }
> = {
  gateway: {
    floorH: 3.4,
    parapet: true,
    windowBand: 0.34,
    wall: 'wall-gateway',
    roof: 'flat with a parapet rim',
    signage: 'tall core-landmark plate and double doors',
  },
  datahall: {
    floorH: 4.2,
    parapet: true,
    windowBand: 0.24,
    wall: 'wall-datahall',
    roof: 'flat with a parapet rim',
    signage: 'low band signage, wide door bays',
  },
  workshop: {
    floorH: 3.0,
    parapet: false,
    windowBand: 0.42,
    wall: 'wall-workshop',
    roof: 'flat, unrimmed',
    signage: 'painted shopfront sign and wide door',
  },
  storehouse: {
    floorH: 3.2,
    parapet: true,
    windowBand: 0.3,
    wall: 'wall-storehouse',
    roof: 'flat with a parapet rim',
    signage: 'stencilled door numbers',
  },
  studio: {
    floorH: 3.6,
    parapet: false,
    windowBand: 0.46,
    wall: 'wall-studio',
    roof: 'flat, unrimmed',
    signage: 'window displays',
  },
  docks: {
    floorH: 2.8,
    parapet: false,
    windowBand: 0.38,
    wall: 'wall-docks',
    roof: 'flat, unrimmed',
    signage: 'pier signs',
  },
}

/** The street-furniture kit the guide documents (R012.3/R012.10). */
export const PROP_KINDS: PropKind[] = ['tree', 'streetlamp', 'bench', 'sign', 'bin']

/** The shared trim sheet the whole city renders from (R012.2/R012.10). */
export const TRIM_SHEET = {
  id: 'city-trim-sheet',
  /** The authored sheet size in pixels (RGBA8). */
  sizePx: 1024,
  /** The disjoint UV bands the generators map onto (v ranges, 0–1). */
  bands: {
    'prop-band': [0.02, 0.2] as [number, number],
    'building-band': [0.25, 0.75] as [number, number],
    'road-band': [0.78, 0.98] as [number, number],
  },
}

/** The asset budgets the style guide declares per generator family (R012.10 QA). */
export const ASSET_BUDGETS: Record<'building' | 'road-tile' | 'prop', { triangles: number }> = {
  building: { triangles: 4000 },
  'road-tile': { triangles: 500 },
  prop: { triangles: 200 },
}

/** The whole-scene texture budget in bytes (R028: RGBA8, deduped per texture). */
export const TEXTURE_BUDGET_BYTES = 32 * 1024 * 1024

/**
 * The material budget (R012.2/R012.8): one authored material per family —
 * the city families share the single trim-sheet PBR material, and the
 * characters carry the shared rig's kit material (role variants through
 * the role palette).
 */
export const FAMILY_MATERIALS: Record<'building' | 'road-tile' | 'prop' | 'character', string> = {
  building: TRIM_SHEET.id,
  'road-tile': TRIM_SHEET.id,
  prop: TRIM_SHEET.id,
  character: 'character-kit',
}

/**
 * The license allowlist (R012.8): generated and third-party assets are
 * admitted only under permissive licenses — the asset lock checks every
 * entry against this list.
 */
export const LICENSE_ALLOWLIST = ['MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0', 'Unlicense'] as const

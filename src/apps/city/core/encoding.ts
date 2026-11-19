/**
 * @file encoding.ts
 * @description The one visual-encoding table for the city (OVERSTORY-CITY-R025).
 * Each visual property maps to exactly one fact, declared once here; the
 * scene modules (render3d/buildings.ts, render3d/characters.ts, render2d.ts)
 * read this table instead of carrying private copies, and the HUD legend is
 * derived from it so the two can never drift apart.
 */

/** One row: a visual channel and the single fact it encodes. */
export interface EncodingRow {
  /** Stable id the scene modules and tests address the row by. */
  id: string
  /** The visual channel — what the viewer sees. */
  visual: string
  /** The single fact the channel encodes (one visual = one fact). */
  fact: string
  /** The colour the channel uses, when the encoding is colour-coded. */
  colorHex?: number
}

/**
 * The v1 encoding table. Every entry is one-to-one: a channel encodes one
 * fact and nothing else, so the city's geography and motion carry meaning
 * and stay consistent across the 3D scene, the 2D schematic and the tests.
 */
export const ENCODING: readonly EncodingRow[] = [
  { id: 'building-height', visual: 'building height', fact: 'served tool count' },
  { id: 'lit-windows', visual: 'lit windows', fact: 'in-flight tool calls', colorHex: 0xffd98a },
  { id: 'scaffolding', visual: 'scaffolding', fact: 'registered but not yet published', colorHex: 0xc7a24a },
  { id: 'error-flash', visual: 'red light flash', fact: 'recent error', colorHex: 0xff5e5e },
  { id: 'door-queue', visual: 'queue at the door', fact: 'pending approvals', colorHex: 0xff6f9c },
  { id: 'character-silhouette', visual: 'character silhouette and colour', fact: 'agent type and role' },
]

/**
 * The state → colour mapping, declared once here (R025): the "state colour"
 * channel of the single source. The 3D scene, the 2D schematic and the HUD
 * all read it — none of them carries a private copy, so a state can never
 * mean two different colours in two views. Simulated operators ('npc')
 * always read gold, whatever their state.
 */
export const STATE_FALLBACK_COLOR = '#8a94a8'
export const NPC_COLOR = '#ffd166'
export const STATE_COLORS: Record<string, string> = {
  idle: '#8a94a8',
  tasked: '#5ea0ff',
  traveling: '#5ea0ff',
  working: '#ffd166',
  committing: '#b08cff',
  sleeping: '#4a5568',
  awaiting: '#ff6f9c',
  patrolling: '#7fd06f',
}

/** The one state → colour lookup (R025): `npc` characters read gold. */
export function stateColor(state: string, kind?: string): string {
  if (kind === 'npc') return NPC_COLOR
  return state in STATE_COLORS ? STATE_COLORS[state] : STATE_FALLBACK_COLOR
}

/** Address one encoding row by its stable id. */
export function encodingById(id: string): EncodingRow | undefined {
  return ENCODING.find((e) => e.id === id)
}

/** The colour a colour-coded encoding uses (falling back to a neutral grey). */
export function encodingColor(id: string): number {
  return encodingById(id)?.colorHex ?? 0x8a94a8
}

/** The legend the HUD renders — one line per table row, derived from it. */
export function legendLines(): string[] {
  return ENCODING.map((e) => `${e.visual} = ${e.fact}`)
}

/** The legend as a single string (for a <pre> or tooltip). */
export function legendText(): string {
  return legendLines().join('\n')
}

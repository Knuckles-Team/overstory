/**
 * @file roadClass.ts
 * @description Edges become roads (OVERSTORY-CITY-R036). The class comes
 * from the edge kind, the weight and whether the edge crosses a domain
 * boundary; the lane count comes from the weight. The table is declared data.
 */

export type RoadClass = 'freeway' | 'arterial' | 'lane' | 'bridge' | 'highway'

/** Edge weight at or above which a link counts as strong or frequent. */
export const STRONG_WEIGHT = 5

/** The edge kinds that always make a weak local lane, whatever their weight. */
export const LOCAL_KINDS: readonly string[] = ['contains', 'relates']

/** Lanes per weight band: the heavier the traffic, the wider the road. */
export const LANE_BANDS: readonly { min: number; lanes: number }[] = [
  { min: 8, lanes: 4 },
  { min: 5, lanes: 3 },
  { min: 2, lanes: 2 },
  { min: 0, lanes: 1 },
]

export interface RoadEdgeInput {
  kind: string
  weight: number
  /** The two endpoint domains. */
  fromDomain: string
  toDomain: string
  /** The two endpoint classes (a class change inside a domain is a bridge). */
  fromClass: string
  toClass: string
}

/** The lane count for a weight, read from the band table. */
export function lanesFor(weight: number): number {
  return (LANE_BANDS.find((b) => weight >= b.min) ?? LANE_BANDS[LANE_BANDS.length - 1]).lanes
}

/**
 * Classify one edge. A link across a domain boundary is a highway when it
 * is strong and a bridge otherwise; a very strong local link is a freeway,
 * a strong one an arterial, and everything else a lane.
 */
export function roadFor(edge: RoadEdgeInput): { cls: RoadClass; lanes: number } {
  const lanes = lanesFor(edge.weight)
  if (edge.fromDomain !== edge.toDomain) {
    return { cls: edge.weight >= STRONG_WEIGHT ? 'highway' : 'bridge', lanes }
  }
  if (LOCAL_KINDS.includes(edge.kind) && edge.weight < STRONG_WEIGHT) return { cls: 'lane', lanes }
  if (edge.weight >= 8) return { cls: 'freeway', lanes }
  if (edge.weight >= STRONG_WEIGHT) return { cls: 'arterial', lanes }
  if (edge.fromClass !== edge.toClass && edge.weight >= 2) return { cls: 'bridge', lanes }
  return { cls: 'lane', lanes }
}

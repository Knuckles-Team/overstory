/**
 * @file tiers.ts
 * @description The declared 3D quality tiers (OVERSTORY-DESIGN-R012.1). Each
 * tier lists exactly the passes it keeps; a scene that cannot hold a tier's
 * frame-time budget drops to the next declared tier, never to unlit,
 * untextured or unanimated geometry. The low tier still keeps image-based
 * environment lighting and tone mapping, so "lower fidelity" never means
 * "flat and unlit" (R012).
 *
 * The tier is chosen from measured frame time (p95) and can be overridden by
 * the operator. Selection never flaps: it only drops a tier when the budget
 * is exceeded and never auto-promotes back up.
 */

/** The pass ids a quality tier can keep or drop. */
export type PassId = 'shadows' | 'ao' | 'bloom' | 'toneMapping' | 'environment' | 'antialiasing' | 'fog' | 'sky'

/** The quality tier names, best to worst. */
export type TierName = 'high' | 'medium' | 'low'

/** One declared quality tier and the passes it keeps. */
export interface QualityTier {
  /** Stable name. */
  name: TierName
  /** Exactly the passes this tier keeps; everything not listed is dropped. */
  passes: Record<PassId, boolean>
  /** The shadow-map resolution this tier renders at. */
  shadowMapSize: number
  /**
   * The frame-time budget (ms) this tier must hold at p95. Exceeding it drops
   * the scene to the next declared tier (R012.1). Every tier targets the
   * 16.7 ms / 60 fps interaction cadence; lower tiers remove visual passes.
   */
  maxFrameMs: number
}

/**
 * The three declared tiers (R012.1). The pass sets are the acceptance: the
 * bound test `pipeline.test.ts::passes_per_tier` verifies each tier enables
 * exactly its declared passes. The low tier keeps `environment` and
 * `toneMapping` on purpose — dropping them would render the scene unlit,
 * which R012 forbids even at the lowest tier.
 */
export const TIERS: Record<TierName, QualityTier> = {
  high: {
    name: 'high',
    passes: {
      shadows: true,
      ao: true,
      bloom: true,
      toneMapping: true,
      environment: true,
      antialiasing: true,
      fog: true,
      sky: true,
    },
    shadowMapSize: 2048,
    // 60 fps on the reference GPU (R012.9).
    maxFrameMs: 16.7,
  },
  medium: {
    name: 'medium',
    passes: {
      shadows: true,
      ao: false,
      bloom: true,
      toneMapping: true,
      environment: true,
      antialiasing: true,
      fog: true,
      sky: true,
    },
    shadowMapSize: 1024,
    // The default interactive tier targets 60 fps.
    maxFrameMs: 16.7,
  },
  low: {
    name: 'low',
    passes: {
      shadows: false,
      ao: false,
      bloom: false,
      toneMapping: true,
      environment: true,
      antialiasing: false,
      fog: true,
      sky: true,
    },
    shadowMapSize: 512,
    // Last-resort quality still targets 60 fps.
    maxFrameMs: 16.7,
  },
}

/** Best to worst; the order a scene drops through when it loses frame budget. */
export const TIER_ORDER: TierName[] = ['high', 'medium', 'low']

/**
 * Choose the tier for a measured p95 frame time (R012.1). An operator
 * override wins over the measured selection. Otherwise the scene keeps the
 * current tier while its budget holds and drops to the next declared tier
 * when the p95 exceeds it — it never promotes back up on its own, so the
 * tier does not flap frame to frame. `p95FrameMs` of null means there is not
 * enough evidence yet and the current tier is kept.
 */
export function selectTier(p95FrameMs: number | null, current: TierName, override: TierName | null = null): TierName {
  if (override) return override
  if (p95FrameMs === null) return current
  let tier: TierName = current
  for (;;) {
    const budget = TIERS[tier].maxFrameMs
    if (p95FrameMs <= budget) return tier
    const idx = TIER_ORDER.indexOf(tier)
    if (idx >= TIER_ORDER.length - 1) return tier // already at the lowest declared tier
    tier = TIER_ORDER[idx + 1]
  }
}

/** The pass ids a tier keeps, as a stable array (for tests and the HUD). */
export function keptPasses(tier: TierName): PassId[] {
  const out: PassId[] = []
  for (const id of [
    'shadows',
    'ao',
    'bloom',
    'toneMapping',
    'environment',
    'antialiasing',
    'fog',
    'sky',
  ] as PassId[]) {
    if (TIERS[tier].passes[id]) out.push(id)
  }
  return out
}

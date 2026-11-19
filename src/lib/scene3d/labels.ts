/**
 * @file labels.ts
 * @description Screen-space labels for 3D scenes (OVERSTORY-DESIGN-R012.7 /
 * OVERSTORY-CITY-R015 amendment): labels sit in screen space with collision
 * avoidance — no two visible labels overlap and the lower-priority label
 * hides first; text is at least 12 CSS px with a contrast plate; and the
 * label set changes with zoom level (the semantic-zoom ladder: city →
 * district → building). The pure resolution and banding live here so the
 * bar is testable without a renderer; the city's label layer projects its
 * entities into screen space and drives this module per frame.
 */

/** The minimum label font size in CSS px (R012.7). */
export const MIN_LABEL_FONT_PX = 12

/** One label candidate projected into screen space by the consumer. */
export interface LabelCandidate {
  /** Stable entity id. */
  id: string
  /** The label kind (drives the semantic-zoom sets the consumer filters on). */
  kind: string
  /** Screen-space top-left, CSS px. */
  x: number
  y: number
  /** The plate size, CSS px (width × height at MIN_LABEL_FONT_PX or above). */
  width: number
  height: number
  /** Higher priority wins a collision: lower-priority labels hide first. */
  priority: number
}

export interface LabelResolution {
  /** The labels that stay visible, in draw order (top priority first). */
  visible: LabelCandidate[]
  /** The ids hidden by collision or viewport bounds, with the reason. */
  hidden: { id: string; reason: 'collision' | 'off-screen' }[]
}

export interface Viewport {
  width: number
  height: number
}

function intersects(a: LabelCandidate, b: LabelCandidate): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * Resolve the visible label set (R012.7): candidates are considered in
 * priority order (ties by id, so the result is deterministic); a candidate
 * is hidden if it overlaps an already-visible label or leaves the viewport.
 * The result is a set of rectangles that never intersect.
 */
export function resolveLabelSet(candidates: LabelCandidate[], viewport: Viewport): LabelResolution {
  const visible: LabelCandidate[] = []
  const hidden: LabelResolution['hidden'] = []
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const candidate of ordered) {
    if (candidate.width < MIN_LABEL_FONT_PX / 2 || candidate.height < MIN_LABEL_FONT_PX / 2) {
      // A plate smaller than half the minimum font is unreadable at any
      // distance; treat it as a collision loss, never render it.
      hidden.push({ id: candidate.id, reason: 'off-screen' })
      continue
    }
    if (
      candidate.x >= viewport.width ||
      candidate.y >= viewport.height ||
      candidate.x + candidate.width <= 0 ||
      candidate.y + candidate.height <= 0
    ) {
      hidden.push({ id: candidate.id, reason: 'off-screen' })
      continue
    }
    const collides = visible.some((v) => intersects(v, candidate))
    if (collides) {
      hidden.push({ id: candidate.id, reason: 'collision' })
      continue
    }
    visible.push(candidate)
  }
  return { visible, hidden }
}

/**
 * The semantic-zoom ladder (OVERSTORY-CITY-R015 amendment): the camera
 * distance bands a 3D scene moves between. The 2D schematic is the city
 * level's accessible twin — it is what the ladder reaches when the scene
 * cannot run at all (context loss, R015).
 */
export type ZoomBand = 'city' | 'district' | 'building'

/** The camera-distance bands (metres) for the city's semantic zoom (T044). */
export const ZOOM_BANDS: Record<ZoomBand, { min: number; max: number }> = {
  city: { min: 90, max: Infinity },
  district: { min: 34, max: 90 },
  building: { min: 0, max: 34 },
}

/** The zoom band for a camera distance (metres) from the focus target. */
export function zoomBandFor(distance: number): ZoomBand {
  if (distance >= ZOOM_BANDS.city.min) return 'city'
  if (distance >= ZOOM_BANDS.district.min) return 'district'
  return 'building'
}

/** The label kinds shown at each zoom band (R012.7: sets change with zoom). */
export const LABEL_SETS: Record<ZoomBand, readonly string[]> = {
  // City level: only the big story — district signage and core landmarks.
  city: ['district-sign', 'core-landmark'],
  // District level: every building name and the construction state.
  district: ['building-name', 'construction-state', 'core-landmark'],
  // Building level: everything legible at close range.
  building: ['building-name', 'construction-state', 'character-name', 'tool-chip'],
}

/** The maximum camera-move duration for the damped transitions (R012.7). */
export const CAMERA_MOVE_MAX_S = 0.8

/**
 * The eased camera move for the damped, never-cut transitions (R012.7 /
 * T044): position is an ease-in-out interpolation that finishes in at most
 * `CAMERA_MOVE_MAX_S`, so a band change or a follow-mode recenter is a
 * smooth move, never a cut.
 */
export function cameraMoveProgress(elapsedS: number, durationS: number): number {
  if (durationS <= 0) return 1
  const t = Math.min(1, Math.max(0, elapsedS / durationS))
  // Smoothstep: zero first and second derivative at the ends — no snap.
  return t * t * (3 - 2 * t)
}

/**
 * @file labels.test.ts
 * @description The screen-space label layer (OVERSTORY-DESIGN-R012.7):
 * collision avoidance — no two visible labels overlap and the
 * lower-priority label hides first; the 12 CSS px font floor holds; and
 * the label set changes with the zoom band (the semantic-zoom ladder,
 * OVERSTORY-CITY-T044). Camera moves are damped, bounded at 0.8 s and
 * never cut.
 */
// spec: OVERSTORY-DESIGN-R012.7
import { describe, expect, it } from 'vitest'
import {
  CAMERA_MOVE_MAX_S,
  LABEL_SETS,
  MIN_LABEL_FONT_PX,
  ZOOM_BANDS,
  cameraMoveProgress,
  resolveLabelSet,
  zoomBandFor,
  type LabelCandidate,
  type ZoomBand,
} from '../labels'

const VIEWPORT = { width: 1280, height: 720 }

/** Overlap test for the visible-set assertions. */
function rectsOverlap(a: LabelCandidate, b: LabelCandidate): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * The bundled fixture: the label entities the city projects, with the
 * deterministic screen positions the test pins. Some pairs overlap on
 * purpose so the priority resolution is exercised.
 */
const FIXTURE: LabelCandidate[] = [
  // City band: only the big story.
  { id: 'district-core', kind: 'district-sign', x: 120, y: 80, width: 130, height: 20, priority: 100 },
  { id: 'district-harbor', kind: 'district-sign', x: 700, y: 120, width: 140, height: 20, priority: 95 },
  { id: 'landmark-exchange', kind: 'core-landmark', x: 300, y: 300, width: 150, height: 20, priority: 90 },
  // District band: building names join and some overlap the story.
  { id: 'building-alpha', kind: 'building-name', x: 310, y: 305, width: 120, height: 18, priority: 40 },
  { id: 'building-beta', kind: 'building-name', x: 130, y: 95, width: 110, height: 18, priority: 40 },
  { id: 'construction-gamma', kind: 'construction-state', x: 710, y: 135, width: 130, height: 18, priority: 50 },
  // Building band: close range, everything legible.
  { id: 'character-1', kind: 'character-name', x: 400, y: 400, width: 100, height: 16, priority: 30 },
  { id: 'tool-approve', kind: 'tool-chip', x: 410, y: 402, width: 90, height: 16, priority: 20 },
  { id: 'building-delta', kind: 'building-name', x: 800, y: 500, width: 120, height: 18, priority: 40 },
  // Off the viewport: must be hidden.
  { id: 'building-off', kind: 'building-name', x: 1300, y: 100, width: 100, height: 18, priority: 40 },
]

/** The candidates one zoom band shows: only that band's label kinds. */
function bandCandidates(band: ZoomBand): LabelCandidate[] {
  return FIXTURE.filter((c) => LABEL_SETS[band].includes(c.kind))
}

describe('screen-space labels (R012.7)', () => {
  it('no_overlap: at every zoom level over the bundled fixture, visible label rectangles never intersect and every label is at least 12 CSS px', () => {
    for (const band of ['city', 'district', 'building'] as const) {
      const { visible, hidden } = resolveLabelSet(bandCandidates(band), VIEWPORT)
      // 1. The band's label set is what is shown: only that band's kinds.
      for (const label of visible) {
        expect(LABEL_SETS[band], `${band}: ${label.id} kind`).toContain(label.kind)
      }
      // 2. No two visible labels overlap.
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i]
          const b = visible[j]
          if (!a || !b) continue
          expect(rectsOverlap(a, b), `${band}: ${a.id} vs ${b.id}`).toBe(false)
        }
      }
      // 3. The minimum font floor: plates are at least the minimum size.
      for (const label of visible) {
        expect(label.width, `${band}: ${label.id} width`).toBeGreaterThanOrEqual(MIN_LABEL_FONT_PX)
        expect(label.height, `${band}: ${label.id} height`).toBeGreaterThanOrEqual(MIN_LABEL_FONT_PX)
      }
      // 4. Every hidden candidate has a reason (collision or off-screen).
      for (const h of hidden) {
        expect(['collision', 'off-screen'], `${band}: ${h.id} reason`).toContain(h.reason)
      }
    }
    expect(MIN_LABEL_FONT_PX).toBe(12)
  })

  it('the lower-priority label hides first when two labels collide', () => {
    const candidates: LabelCandidate[] = [
      { id: 'low', kind: 'building-name', x: 100, y: 100, width: 100, height: 18, priority: 10 },
      { id: 'high', kind: 'core-landmark', x: 120, y: 105, width: 100, height: 18, priority: 90 },
    ]
    const { visible, hidden } = resolveLabelSet(candidates, VIEWPORT)
    expect(visible.map((c) => c.id)).toEqual(['high'])
    expect(hidden).toEqual([{ id: 'low', reason: 'collision' }])
  })

  it('off-viewport labels are hidden, not hidden by collision', () => {
    const candidates: LabelCandidate[] = [
      { id: 'off', kind: 'building-name', x: 1400, y: 100, width: 100, height: 18, priority: 99 },
    ]
    const { visible, hidden } = resolveLabelSet(candidates, VIEWPORT)
    expect(visible).toEqual([])
    expect(hidden).toEqual([{ id: 'off', reason: 'off-screen' }])
  })

  it('the zoom bands are contiguous and the label sets change with zoom', () => {
    // The band for a camera distance, at each end of the ladder.
    expect(zoomBandFor(200)).toBe('city')
    expect(zoomBandFor(ZOOM_BANDS.city.min)).toBe('city')
    expect(zoomBandFor(ZOOM_BANDS.city.min - 1)).toBe('district')
    expect(zoomBandFor(ZOOM_BANDS.district.min)).toBe('district')
    expect(zoomBandFor(ZOOM_BANDS.district.min - 1)).toBe('building')
    // Contiguous: no distance falls through the bands.
    expect(ZOOM_BANDS.district.max).toBe(ZOOM_BANDS.city.min)
    expect(ZOOM_BANDS.building.max).toBe(ZOOM_BANDS.district.min)
    // The label set changes with zoom: no two bands show the same set.
    expect(new Set(LABEL_SETS.city)).not.toEqual(new Set(LABEL_SETS.district))
    expect(new Set(LABEL_SETS.district)).not.toEqual(new Set(LABEL_SETS.building))
  })

  it('camera moves are damped, bounded at 0.8 s and never cut', () => {
    expect(CAMERA_MOVE_MAX_S).toBe(0.8)
    // Endpoints: the move starts at 0 and finishes at 1.
    expect(cameraMoveProgress(0, 0.8)).toBe(0)
    expect(cameraMoveProgress(10, 0.8)).toBe(1)
    // Monotone, bounded, over the whole move.
    let last = -1
    for (let i = 0; i <= 20; i++) {
      const p = cameraMoveProgress((i * 0.8) / 20, 0.8)
      expect(p).toBeGreaterThanOrEqual(last)
      expect(p).toBeLessThanOrEqual(1)
      last = p
    }
    // Damped: near-zero velocity at both ends — no snap, no cut.
    expect(cameraMoveProgress(0.01, 0.8)).toBeLessThan(0.002)
    expect(cameraMoveProgress(0.79, 0.8)).toBeGreaterThan(0.998)
  })
})

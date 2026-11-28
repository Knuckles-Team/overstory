/**
 * @file windowEmissive.test.ts
 * @description The window-emissive resolver (OVERSTORY-CITY-R066): the kit
 * window geometry remaps onto a per-building occupancy grid (one row per
 * storey, one column per facade bay), the grid resolves from the activity
 * schedule deterministically, redraws are gated on change so the stable
 * object and texture count contract holds, and two buildings of the same
 * function differ at the same instant.
 */
// spec: OVERSTORY-CITY-R066
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildingFunctionFor,
  createWindowEmissive,
  remapWindowUvForOccupancy,
  type NightWindowReport,
} from '../core/render3d/windowEmissive'

const H = 3_600

/** One kit window panel: four corners, the sheet's window-row UVs. */
function windowPanel(
  positions: number[],
  uvs: number[],
  indices: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y0: number,
  y1: number,
  u0: number,
  u1: number,
): void {
  const base = positions.length / 3
  const push = (x: number, y: number, zz: number, u: number, v: number): void => {
    positions.push(x, y, zz)
    uvs.push(u, v)
  }
  // v 0.50–0.70 on the sheet is the window row (unit v 0.5–0.9).
  push(ax, y0, az, u0, 0.5)
  push(bx, y0, bz, u1, 0.5)
  push(bx, y1, bz, u1, 0.7)
  push(ax, y1, az, u0, 0.7)
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function windowGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const floorH = 3
  const bandH = 2.1 // the storey's wall portion
  // Front facade (z = +2): two bays, two storeys, sheet column 0 — the kit
  // maps unit u across the 0.25-wide column, so each bay spans 0.125.
  for (let f = 0; f < 2; f++) {
    for (let b = 0; b < 2; b++) {
      const x0 = -2 + b * 2
      const x1 = x0 + 2
      const u0 = (b / 2) * 0.25
      windowPanel(positions, uvs, indices, x0, 2, x1, 2, f * floorH + bandH, (f + 1) * floorH, u0, u0 + 0.125)
    }
  }
  // Right facade (x = +2): one bay, two storeys, running along z — the whole
  // facade width maps the column's full u span.
  for (let f = 0; f < 2; f++) {
    windowPanel(positions, uvs, indices, 2, -2, 2, 2, f * floorH + bandH, (f + 1) * floorH, 0, 0.25)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

describe('window_emissive (R066)', () => {
  it('maps the kit window bands onto per-floor, per-bay occupancy cells', () => {
    const g = windowGeometry()
    remapWindowUvForOccupancy(g, { floors: 2, floorH: 3, baysX: 2, baysZ: 1, col: 0 })
    const uv = g.getAttribute('uv')
    // Ground floor, front bay 0: v in [0, 0.5), u in [0, 0.5).
    const v0 = uv.getY(0)
    expect(v0).toBeGreaterThanOrEqual(0)
    expect(v0).toBeLessThan(0.5)
    expect(uv.getX(0)).toBeGreaterThanOrEqual(0)
    expect(uv.getX(0)).toBeLessThan(0.5)
    // The same panel's top edge stays in its storey row (the storey index
    // resolves down at the next storey's boundary).
    expect(uv.getY(3)).toBeGreaterThanOrEqual(0)
    expect(uv.getY(3)).toBeLessThanOrEqual(0.5)
    // First floor, front bay 1: v in [0.5, 1), u in [0.5, 1).
    const firstFloorBay1 = 12 // storey 1, bay 1 (16 front-facade verts first)
    expect(uv.getY(firstFloorBay1)).toBeGreaterThanOrEqual(0.5)
    expect(uv.getY(firstFloorBay1)).toBeLessThan(1)
    expect(uv.getX(firstFloorBay1)).toBeGreaterThanOrEqual(0.5)
    expect(uv.getX(firstFloorBay1)).toBeLessThan(1)
    // Right facade (bay axis z): the single bay occupies u [0, 0.5).
    const rightFacade = 16
    expect(uv.getX(rightFacade)).toBeGreaterThanOrEqual(0)
    expect(uv.getX(rightFacade)).toBeLessThan(0.5)
    expect(uv.getY(rightFacade)).toBeGreaterThanOrEqual(0)
    expect(uv.getY(rightFacade)).toBeLessThan(0.5)
    // Every vertex lands inside the unit square.
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getX(i)).toBeLessThanOrEqual(1)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(i)).toBeLessThanOrEqual(1)
    }
  })

  it('the building function table maps the district archetypes', () => {
    expect(buildingFunctionFor('gateway')).toBe('commercial')
    expect(buildingFunctionFor('studio')).toBe('commercial')
    expect(buildingFunctionFor('datahall')).toBe('computing')
    expect(buildingFunctionFor('workshop')).toBe('industrial')
    expect(buildingFunctionFor('storehouse')).toBe('industrial')
    expect(buildingFunctionFor('docks')).toBe('industrial')
    expect(buildingFunctionFor('something-bespoke')).toBe('public')
  })

  it('resolves deterministically, redraws only on change, and differs per building', () => {
    const a = createWindowEmissive({ seed: 101, fn: 'commercial', floors: 4, cols: 4, color: 0xffd98a })
    const b = createWindowEmissive({ seed: 202, fn: 'commercial', floors: 4, cols: 4, color: 0xffd98a })
    // At noon the commercial grids are largely lit.
    expect(a.update(12 * H, 0)).toBe(true)
    expect(a.anyLit).toBe(true)
    expect(a.perFloor).toHaveLength(4)
    for (const frac of a.perFloor) expect(frac).toBeGreaterThanOrEqual(0)
    // Two buildings of the same function differ at the same instant.
    expect(b.update(12 * H, 0)).toBe(true)
    expect(a.fingerprint).not.toBe(b.fingerprint)
    // Re-resolving at the same instant costs no redraw.
    expect(a.update(12 * H, 0)).toBe(false)
    expect(a.update(12 * H + 5, 0)).toBe(false) // same slot, same occupancy step
    // Night empties the commercial grid.
    expect(a.update(23 * H, 0)).toBe(true)
    const nightLit = a.perFloor.reduce((sum, f) => sum + f, 0) / a.perFloor.length
    expect(nightLit).toBeLessThan(0.2)
    // Live work lights deterministic cells on top of the schedule.
    expect(a.update(23 * H, 2)).toBe(true)
    expect(a.anyLit).toBe(true)
    expect(a.update(23 * H, 2)).toBe(false)
    // The report seam carries per-floor occupancy and a stable fingerprint.
    const report: NightWindowReport = {
      clockS: 23 * H,
      night: true,
      samples: [],
      setOccupancyState() {
        // no-op in test
      },
    }
    report.samples.push({
      id: 'a',
      family: 'gateway',
      fn: 'commercial',
      floors: a.floors,
      cols: a.cols,
      perFloor: [...a.perFloor],
      fingerprint: a.fingerprint,
    })
    expect(report.samples[0].perFloor).toHaveLength(4)
    a.dispose()
    b.dispose()
  })
})

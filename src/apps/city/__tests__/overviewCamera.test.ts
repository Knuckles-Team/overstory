// spec: OVERSTORY-CITY-R041.1, OVERSTORY-CITY-R048
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { GOLDEN_VIEWS } from '../core/fidelity'
import { OVERVIEW_CAM, OVERVIEW_TARGET } from '../core/render3d/scene'

describe('regional overview framing', () => {
  it('keeps the browser-capture overview aligned with the interactive default', () => {
    expect(GOLDEN_VIEWS.overview.cam).toEqual(OVERVIEW_CAM.toArray())
    expect(GOLDEN_VIEWS.overview.target).toEqual(OVERVIEW_TARGET.toArray())
  })

  it('shows the live basin, canal, waterfront and skyline in the initial 16:9 frame', () => {
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000)
    camera.position.copy(OVERVIEW_CAM)
    camera.lookAt(OVERVIEW_TARGET)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()

    const keyFeatures = [
      new THREE.Vector3(0, 8, 0), // civic basin
      new THREE.Vector3(42, 1, -10), // canal
      new THREE.Vector3(-5, 1, 74), // waterfront / pier
      new THREE.Vector3(64, 34, -31), // regional high-rise skyline
    ]
    for (const point of keyFeatures) {
      const label = point.toArray().join(',')
      const ndc = point.project(camera)
      expect(ndc.x, `${label} horizontal frame`).toBeGreaterThan(-1)
      expect(ndc.x, `${label} horizontal frame`).toBeLessThan(1)
      expect(ndc.y, `${label} vertical frame`).toBeGreaterThan(-1)
      expect(ndc.y, `${label} vertical frame`).toBeLessThan(1)
      expect(ndc.z, `${label} depth frame`).toBeGreaterThan(-1)
      expect(ndc.z, `${label} depth frame`).toBeLessThan(1)
    }
  })
})

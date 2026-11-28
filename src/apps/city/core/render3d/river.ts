// spec: OVERSTORY-CITY-R048.5.1
import * as THREE from 'three'
import { isIslandLand, isRegionalWater, RIVER_HALF_WIDTH, riverCentreAt } from '../worldgen'

/** Build the inland surface from the same water corridor used by placement. */
export function createRiverGeometry(seed: number, extent: number, step = 2): THREE.BufferGeometry {
  if (!Number.isFinite(extent) || !Number.isFinite(step) || extent <= 0 || step <= 0 || extent / step > 100_000)
    throw new RangeError('Invalid river geometry extent or sampling step')
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let previous = -1
  const count = Math.ceil(extent / step)
  for (let i = 0; i <= count; i++) {
    const z = -extent / 2 + (i / count) * extent
    const centre = riverCentreAt(z)
    // Stop at the coast or bay; the ocean surface owns those areas.
    const dryBanks =
      isIslandLand(centre, z, seed) &&
      !isRegionalWater(centre - RIVER_HALF_WIDTH - 0.1, z, seed) &&
      !isRegionalWater(centre + RIVER_HALF_WIDTH + 0.1, z, seed)
    if (!dryBanks) {
      previous = -1
      continue
    }
    const index = positions.length / 3
    positions.push(centre - RIVER_HALF_WIDTH, 0.08, z, centre + RIVER_HALF_WIDTH, 0.08, z)
    uvs.push(0, i / 8, 1, i / 8)
    if (previous >= 0) indices.push(previous, index, previous + 1, previous + 1, index, index + 1)
    previous = index
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

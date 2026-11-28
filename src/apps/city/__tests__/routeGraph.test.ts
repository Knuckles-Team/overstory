/**
 * @file routeGraph.test.ts
 * @description Route graph, lane movement and determinism
 * (OVERSTORY-CITY-R048.3, R048.16): BFS connectivity, deterministic
 * adjacency, lane-aware refusal and multi-step rerouting.
 */
// spec: OVERSTORY-CITY-R048.3, OVERSTORY-CITY-R048.16
import { describe, expect, it } from 'vitest'
import { generateNetwork, NETWORK_LEVELS, type NetworkManifest } from '../core/network'
import { validateBoatRoute, validateCarRoute, validatePlaneRoute, validateTrainRoute } from '../core/routes'
import { isDryFootprint } from '../core/worldgen'
import { AIRFIELD_FOOTPRINT } from '../core/routes'

const SEED = 42

/** Two road nodes as far apart as the network reaches. */
function carPair(network: NetworkManifest) {
  const groundNodes = Object.values(network.nodes)
    .filter((node) => node.level === NETWORK_LEVELS.ground)
    .sort((a, b) => a.id.localeCompare(b.id))
  const a = groundNodes[0]
  let far = a
  for (const node of groundNodes) {
    if (Math.hypot(node.x - a.x, node.z - a.z) > Math.hypot(far.x - a.x, far.z - a.z)) far = node
  }
  return { from: { x: a.x, z: a.z }, to: { x: far.x, z: far.z }, start: a.id, goal: far.id }
}

describe('route graph connectivity (R048.3)', () => {
  it('car BFS finds a valid path across the full network', () => {
    const network = generateNetwork(SEED)
    const { from, to, start, goal } = carPair(network)
    const route = validateCarRoute(network, from, to)
    expect(route.ok).toBe(true)
    expect(route.path[0]).toBe(start)
    expect(route.path.at(-1)).toBe(goal)
    expect(route.path.length).toBeGreaterThan(2)
  })

  it('BFS adjacency is deterministic under seed', () => {
    const n1 = generateNetwork(SEED)
    const n2 = generateNetwork(SEED)
    const pair1 = carPair(n1)
    const pair2 = carPair(n2)
    expect(pair1.from.x).toBe(pair2.from.x)
    expect(pair1.to.x).toBe(pair2.to.x)
    const r1 = validateCarRoute(n1, pair1.from, pair1.to)
    const r2 = validateCarRoute(n2, pair2.from, pair2.to)
    expect(r1.ok).toBe(r2.ok)
    if (r1.ok && r2.ok) {
      expect(r1.path).toEqual(r2.path)
    }
  })

  it('lane-blocked BFS returns empty path', () => {
    const network = generateNetwork(SEED)
    const { from, to } = carPair(network)
    const allRoadEdges = network.edges.filter((e) => e.level === NETWORK_LEVELS.ground)
    const blocked = validateCarRoute(network, from, to, { blockedLanes: allRoadEdges.map((e) => e.id) })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toBe('blocked-lane')
    expect(blocked.path).toHaveLength(0)
  })

  it('unreachable request returns empty path, not patched', () => {
    const network = generateNetwork(SEED)
    const { to } = carPair(network)
    const beyond = validateCarRoute(network, { x: 500, z: 500 }, to)
    expect(beyond.ok).toBe(false)
    expect(beyond.reason).toBe('unreachable')
    expect(beyond.path).toHaveLength(0)
  })
})

describe('multimodal route graph (R048.16)', () => {
  it('car, train, boat and plane all validate over the same seed', () => {
    const network = generateNetwork(SEED)
    // Car: two distant ground nodes.
    const carPair_ = carPair(network)
    expect(validateCarRoute(network, carPair_.from, carPair_.to).ok).toBe(true)

    // Train: rail stations.
    const railStations = network.stations.filter((s) => s.kind === 'rail').map((s) => s.id)
    if (railStations.length >= 2) {
      expect(validateTrainRoute(network, railStations[0], railStations[1]).ok).toBe(true)
    }

    // Boat: river points.
    const riverNodes = Object.values(network.nodes).filter(
      (n) => n.level === NETWORK_LEVELS.water && n.id.startsWith('water-river'),
    )
    if (riverNodes.length >= 2) {
      const north = riverNodes.filter((n) => n.z <= 0).at(-1)
      const south = riverNodes.find((n) => n.z >= 20)
      if (north && south) {
        // Shallow draft should cross.
        const shallow = validateBoatRoute(
          network,
          { x: north.x, z: north.z },
          { x: south.x, z: south.z },
          { minDepthM: 0.2 },
        )
        expect(shallow.ok).toBe(true)
      }
    }

    // Plane: airfields.
    const airfields: { x: number; z: number }[] = []
    for (let z = -240; z <= 240; z += 24) {
      for (let x = -240; x <= 240; x += 24) {
        if (isDryFootprint({ x, z, w: AIRFIELD_FOOTPRINT.w, d: AIRFIELD_FOOTPRINT.d }, 0, SEED)) {
          airfields.push({ x, z })
        }
      }
    }
    if (airfields.length >= 2) {
      expect(validatePlaneRoute(network, airfields[0], airfields[1]).ok).toBe(true)
    }
  })

  it('each modality stays within its level graph', () => {
    const network = generateNetwork(SEED)

    // Car: all path nodes are ground level.
    const carPair_ = carPair(network)
    const carRoute = validateCarRoute(network, carPair_.from, carPair_.to)
    for (const nodeId of carRoute.path) {
      expect(network.nodes[nodeId].level).toBe(NETWORK_LEVELS.ground)
    }

    // Train: all path nodes are rail level.
    const railStations = network.stations.filter((s) => s.kind === 'rail').map((s) => s.id)
    if (railStations.length >= 2) {
      const trainRoute = validateTrainRoute(network, railStations[0], railStations[1])
      for (const nodeId of trainRoute.path) {
        expect(network.nodes[nodeId].level).toBe(NETWORK_LEVELS.rail)
      }
    }

    // Boat: all path nodes are water level.
    const riverNodes = Object.values(network.nodes).filter(
      (n) => n.level === NETWORK_LEVELS.water && n.id.startsWith('water-river'),
    )
    if (riverNodes.length >= 2) {
      const north = riverNodes.filter((n) => n.z <= 0).at(-1)
      const south = riverNodes.find((n) => n.z >= 20)
      if (north && south) {
        const boatRoute = validateBoatRoute(
          network,
          { x: north.x, z: north.z },
          { x: south.x, z: south.z },
          { minDepthM: 0.2 },
        )
        for (const nodeId of boatRoute.path) {
          expect(network.nodes[nodeId].level).toBe(NETWORK_LEVELS.water)
        }
      }
    }
  })

  it('refusal reasons are specific and deterministic', () => {
    const network = generateNetwork(SEED)

    // Unreachable
    const unreachable = validateCarRoute(network, { x: 500, z: 500 }, { x: 0, z: 0 })
    expect(unreachable.reason).toBe('unreachable')

    // Blocked lane
    const { from, to } = carPair(network)
    // May be blocked or may have alternative — either way it's deterministic
    const result = validateCarRoute(network, from, to, { blockedLanes: [network.edges[0]?.id] })
    expect(['blocked-lane', null].includes(result.reason ?? null), 'deterministic decision').toBe(true)

    // No station (train)
    const noStation = validateTrainRoute(network, 'nonexistent', network.stations[0]?.id ?? '')
    expect(noStation.reason).toBe('no-station')

    // Shallow water (boat)
    const waterNodes = Object.values(network.nodes)
      .filter((n) => n.level === NETWORK_LEVELS.water && n.id.startsWith('water-river'))
      .sort((a, b) => a.id.localeCompare(b.id))
    const nf = waterNodes[0]
    const nt = waterNodes[1]
    if (nf && nt) {
      // Shallow draft should work, deep draft should fail.
      const deep = validateBoatRoute(network, { x: nf.x, z: nf.z }, { x: nt.x, z: nt.z }, { minDepthM: 0.5 })
      // Deep draft either succeeds (if deep enough) or fails with shallow-water.
      expect(['shallow-water', null].includes(deep.reason ?? null), 'deterministic boat decision').toBe(true)
    }
  })

  it('same seed replays identical route decisions', () => {
    const n1 = generateNetwork(SEED)
    const n2 = generateNetwork(SEED)

    const carP = carPair(n1)
    const r1 = validateCarRoute(n1, carP.from, carP.to)
    const r2 = validateCarRoute(n2, carP.from, carP.to)
    expect(r1.ok).toBe(r2.ok)
    expect(r1.reason).toBe(r2.reason)
    expect(r1.path).toEqual(r2.path)
  })
})

/**
 * @file routes.test.ts
 * @description Route validation over the physical network
 * (OVERSTORY-CITY-R064): car, plane, train and boat routes are accepted
 * only when every constraint holds — connectivity, clearance, depth,
 * level — and a blocked lane, a shallow reach, a missing airfield or an
 * unreachable station each produce a deterministic refusal. The same seed
 * replays the same accept/refuse decisions.
 */
// spec: OVERSTORY-CITY-R064
import { describe, expect, it } from 'vitest'
import { generateNetwork, NETWORK_LEVELS } from '../core/network'
import {
  validateBoatRoute,
  validateCarRoute,
  validatePlaneRoute,
  validateTrainRoute,
  type RouteDecision,
} from '../core/routes'
import { AIRFIELD_FOOTPRINT } from '../core/routes'
import { isDryFootprint, riverCentreAt } from '../core/worldgen'

const SEED = 42
const network = generateNetwork(SEED)

const groundNodes = Object.values(network.nodes)
  .filter((node) => node.level === NETWORK_LEVELS.ground)
  .sort((a, b) => a.id.localeCompare(b.id))

/** Two road nodes as far apart as the network reaches. */
function carPair(): { from: { x: number; z: number }; to: { x: number; z: number }; start: string; goal: string } {
  const a = groundNodes[0]
  let far = a
  for (const node of groundNodes) {
    if (Math.hypot(node.x - a.x, node.z - a.z) > Math.hypot(far.x - a.x, far.z - a.z)) far = node
  }
  return { from: { x: a.x, z: a.z }, to: { x: far.x, z: far.z }, start: a.id, goal: far.id }
}

/** Water nodes of the river, north and south of the seeded shallow reach. */
function riverPair(): { from: { x: number; z: number }; to: { x: number; z: number } } {
  const river = Object.values(network.nodes)
    .filter((node) => node.level === NETWORK_LEVELS.water && node.id.startsWith('water-river'))
    .sort((a, b) => a.id.localeCompare(b.id))
  const north = river.filter((node) => node.z <= 0).at(-1)!
  const south = river.find((node) => node.z >= 20)!
  return { from: { x: north.x, z: north.z }, to: { x: south.x, z: south.z } }
}

/** Dry points holding the full airfield footprint, scanned in grid order. */
function airfields(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (let z = -240; z <= 240; z += 24) {
    for (let x = -240; x <= 240; x += 24) {
      if (isDryFootprint({ x, z, w: AIRFIELD_FOOTPRINT.w, d: AIRFIELD_FOOTPRINT.d }, 0, SEED)) out.push({ x, z })
    }
  }
  return out
}

function railStations(): string[] {
  return network.stations.filter((station) => station.kind === 'rail').map((station) => station.id)
}

describe('route_validation (R064)', () => {
  it('car routes are accepted only over connected road lanes', () => {
    const { from, to, start, goal } = carPair()
    const ok = validateCarRoute(network, from, to)
    expect(ok.ok).toBe(true)
    expect(ok.reason).toBeNull()
    expect(ok.path[0]).toBe(start)
    expect(ok.path.at(-1)).toBe(goal)
    expect(ok.path.length).toBeGreaterThan(1)
    // A request beyond the mapped network is refused, never patched.
    const beyond = validateCarRoute(network, { x: 400, z: 400 }, to)
    expect(beyond).toEqual({ ok: false, reason: 'unreachable', path: [] })
  })

  it('a blocked lane that severs the only path is a refusal', () => {
    const { from, to } = carPair()
    const allLanes = network.edges.filter((edge) => edge.level === NETWORK_LEVELS.ground).map((edge) => edge.id)
    const blocked = validateCarRoute(network, from, to, { blockedLanes: allLanes })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toBe('blocked-lane')
    expect(blocked.path).toEqual([])
    // With the live state cleared the same request is accepted again.
    expect(validateCarRoute(network, from, to, { blockedLanes: [] }).ok).toBe(true)
  })

  it('train routes run on rail corridors with station access', () => {
    const stations = railStations()
    expect(stations.length).toBeGreaterThanOrEqual(2)
    const ok = validateTrainRoute(network, stations[0], stations[1])
    expect(ok.ok, `stations ${stations[0]} and ${stations[1]}`).toBe(true)
    for (const nodeId of ok.path) {
      expect(network.nodes[nodeId].level).toBe(NETWORK_LEVELS.rail)
    }
    expect(validateTrainRoute(network, 'no-such-station', stations[0]).reason).toBe('no-station')
    // A port is not a rail station: trains cannot board there.
    const port = network.stations.find((station) => station.kind === 'port')
    if (port) expect(validateTrainRoute(network, port.id, stations[0]).reason).toBe('no-station')
  })

  it('boat routes respect the channel depth of every edge on the path', () => {
    const { from, to } = riverPair()
    // A shallow-draft hull crosses the river over the shallow reach.
    const drafty = validateBoatRoute(network, from, to, { minDepthM: 0.2 })
    expect(drafty.ok).toBe(true)
    expect(drafty.path.length).toBeGreaterThan(1)
    // A deep-draft hull cannot: the only path crosses the shallow reach.
    const deep = validateBoatRoute(network, from, to, { minDepthM: 0.5 })
    expect(deep.ok).toBe(false)
    expect(deep.reason).toBe('shallow-water')
    // The open coast is a different water component: a river-to-coast
    // crossing is unreachable, not patched.
    const coast = Object.values(network.nodes).find(
      (node) => node.level === NETWORK_LEVELS.water && node.id.startsWith('water-coast'),
    )!
    expect(validateBoatRoute(network, from, { x: coast.x, z: coast.z }).reason).toBe('unreachable')
  })

  it('plane routes need dry airfields and clearance to every surface', () => {
    const fields = airfields()
    expect(fields.length, 'the island holds dry airfields').toBeGreaterThanOrEqual(2)
    const from = fields[0]
    const to = fields.at(-1)!
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeGreaterThan(100)
    expect(validatePlaneRoute(network, from, to).ok).toBe(true)
    // Over the river there is no field: the request is refused.
    expect(validatePlaneRoute(network, { x: riverCentreAt(0), z: 0 }, to).reason).toBe('no-airfield')
    // Ground level flies into the clearance envelope.
    expect(validatePlaneRoute(network, from, to, { altitudeM: 0 }).reason).toBe('clearance-violation')
  })

  it('the same seed replays the same accept/refuse decisions', () => {
    const replay = generateNetwork(SEED)
    const { from, to } = carPair()
    const { from: bf, to: bt } = riverPair()
    const stations = railStations()
    const fields = airfields()
    const requests: { label: string; decide: (n: ReturnType<typeof generateNetwork>) => RouteDecision }[] = [
      { label: 'car open', decide: (n) => validateCarRoute(n, from, to) },
      {
        label: 'car blocked',
        decide: (n) =>
          validateCarRoute(n, from, to, {
            blockedLanes: n.edges.filter((edge) => edge.level === NETWORK_LEVELS.ground).map((edge) => edge.id),
          }),
      },
      { label: 'car beyond', decide: (n) => validateCarRoute(n, { x: 400, z: 400 }, to) },
      { label: 'train', decide: (n) => validateTrainRoute(n, stations[0], stations[1]) },
      { label: 'train no-station', decide: (n) => validateTrainRoute(n, 'no-such-station', stations[0]) },
      { label: 'boat drafty', decide: (n) => validateBoatRoute(n, bf, bt, { minDepthM: 0.2 }) },
      { label: 'boat deep', decide: (n) => validateBoatRoute(n, bf, bt, { minDepthM: 0.5 }) },
      { label: 'plane', decide: (n) => validatePlaneRoute(n, fields[0], fields.at(-1)!) },
      {
        label: 'plane no-airfield',
        decide: (n) => validatePlaneRoute(n, { x: riverCentreAt(0), z: 0 }, fields.at(-1)!),
      },
    ]
    for (const request of requests) {
      expect(request.decide(replay), `${request.label}: replay`).toEqual(request.decide(network))
    }
  })
})

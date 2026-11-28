// spec: OVERSTORY-CITY-R032, OVERSTORY-CITY-R104, OVERSTORY-CITY-R106
import { route, sampleRoadCurve, type RoadGraph, type RoadPathSample } from '@/lib/scene3d/roads'

export interface JunctionApproach {
  nodeId: string
  segmentId: string
  kind: 'stop' | 'signal'
  x: number
  z: number
  rotation: number
  axis: 'x' | 'z'
}

/** Place a control beside every approach using the same curve tangents as traffic. */
export function junctionApproaches(graph: RoadGraph): JunctionApproach[] {
  const incident = new Map<string, (typeof graph.segments)[string][]>()
  for (const segment of Object.values(graph.segments)) {
    for (const nodeId of [segment.from, segment.to]) {
      const arms = incident.get(nodeId) ?? []
      arms.push(segment)
      incident.set(nodeId, arms)
    }
  }
  const result: JunctionApproach[] = []
  for (const [nodeId, arms] of incident) {
    if (!(nodeId in graph.nodes) || arms.length < 3) continue
    const node = graph.nodes[nodeId]
    for (const arm of arms) {
      if (!(arm.from in graph.nodes) || !(arm.to in graph.nodes)) continue
      const a = graph.nodes[arm.from]
      const b = graph.nodes[arm.to]
      const samples = sampleRoadCurve(a.x, a.z, b.x, b.z, arm.curve, arm.id, 1.8)
      const atStart = arm.from === nodeId
      const tangent = atStart ? samples.at(0) : samples.at(-1)
      if (!tangent) continue
      const direction = atStart ? 1 : -1
      const length = Math.hypot(tangent.tangentX, tangent.tangentZ)
      if (!length) continue
      const ux = (direction * tangent.tangentX) / length
      const uz = (direction * tangent.tangentZ) / length
      const along = Math.min(arm.width / 2 + 1.5, Math.hypot(b.x - a.x, b.z - a.z) * 0.35)
      const side = arm.width / 2 + 0.65
      result.push({
        nodeId,
        segmentId: arm.id,
        kind: arms.length >= 4 ? 'signal' : 'stop',
        x: node.x + ux * along - uz * side,
        z: node.z + uz * along + ux * side,
        rotation: Math.atan2(ux, uz),
        axis: Math.abs(ux) >= Math.abs(uz) ? 'x' : 'z',
      })
    }
  }
  return result
}

/** A control on a directed, closed road route, measured from its first point. */
export interface TrafficControl {
  distance: number
  kind: 'stop' | 'signal'
  axis: 'x' | 'z'
}

export interface TrafficMotion {
  distance: number
  waitingAt: number | null
  waited: number
  passed: number | null
}

export interface TrafficRoute {
  points: RoadPathSample[]
  distances: number[]
  length: number
  laneOffset: number
  phase: number
  speed: number
  /** The speed before any economy vehicle was assigned to this route. */
  baseSpeed?: number
  controls: TrafficControl[]
  motion: TrafficMotion
}

export interface TrafficFleet {
  graph: RoadGraph
  routes: TrafficRoute[]
  elapsed: number
  positions: number[]
  /** The economy vehicle assignment last applied (see mergeEconomyVehiclesIntoFleet). */
  economyKey?: string
  /** Set when the lane graph could not give the fleet a route; the city then has no traffic. */
  routeError?: string
}

/** Advance the fleet once in the simulation, independently of the active renderer. */
export function tickTraffic(fleet: TrafficFleet, dt: number): void {
  const delta = Math.min(Math.max(dt, 0), 0.1)
  fleet.elapsed += delta
  for (let i = 0; i < fleet.routes.length; i++) fleet.positions[i] = fleet.routes[i].motion.distance
  for (let i = 0; i < fleet.routes.length; i++) {
    const route = fleet.routes[i]
    const speed = followingSpeed(fleet.routes, fleet.positions, i, delta)
    advanceTraffic(route.motion, route.controls, route.length, speed, delta, fleet.elapsed)
  }
}

/** Sample a vehicle position on its lane path, the same in either renderer. The path is already offset into the lane. */
export function sampleTrafficPose(route: TrafficRoute, out: { x: number; z: number; heading: number }): boolean {
  const distance = route.motion.distance
  let segmentIndex = 0
  while (segmentIndex < route.distances.length - 2 && distance > (route.distances[segmentIndex + 1] ?? Infinity))
    segmentIndex++
  const start = route.points.at(segmentIndex)
  const end = route.points.at(segmentIndex + 1) ?? start
  if (!start || !end) return false
  const startDistance = route.distances[segmentIndex] ?? 0
  const endDistance = route.distances[segmentIndex + 1] ?? route.length
  const t = Math.min(1, Math.max(0, (distance - startDistance) / Math.max(0.001, endDistance - startDistance)))
  out.x = start.x + (end.x - start.x) * t
  out.z = start.z + (end.z - start.z) * t
  const dx = end.x - start.x
  const dz = end.z - start.z
  out.heading = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(-dz, dx) : Math.atan2(-start.tangentZ, start.tangentX)
  return true
}

export interface FollowingRoute {
  points: readonly unknown[]
  length: number
  speed: number
  motion: TrafficMotion
}

/** Limit movement using a snapshot, so vehicle update order cannot cause overtaking. */
export function followingSpeed(
  routes: readonly FollowingRoute[],
  positions: readonly number[],
  index: number,
  dt: number,
  minimumGap = 2.4,
): number {
  const route = routes[index]
  if (!(dt > 0) || !(route.length > 0)) return 0
  let available = route.speed * dt
  for (let other = 0; other < routes.length; other++) {
    if (other === index || routes[other].points !== route.points) continue
    const gap = (((positions[other] - positions[index]) % route.length) + route.length) % route.length
    available = Math.min(available, Math.max(0, gap - minimumGap))
  }
  return available / dt
}

/** Alternating approaches have a one-second all-red interval at each change. */
export function signalIsGreen(axis: 'x' | 'z', elapsed: number): boolean {
  const phase = ((elapsed % 18) + 18) % 18
  return axis === 'x' ? phase < 8 : phase >= 9 && phase < 17
}

/** Advance one vehicle without stepping over a stop line on a long frame. */
export function advanceTraffic(
  state: TrafficMotion,
  controls: readonly TrafficControl[],
  length: number,
  speed: number,
  dt: number,
  elapsed: number,
): void {
  if (!(length > 0) || !(dt > 0)) return
  if (state.waitingAt !== null) {
    const control = controls.at(state.waitingAt)
    if (!control) {
      state.waitingAt = null
    } else {
      state.waited += dt
      if (control.kind === 'stop' ? state.waited < 1 : !signalIsGreen(control.axis, elapsed)) return
      state.passed = state.waitingAt
      state.waitingAt = null
      state.waited = 0
    }
  }
  const travel = Math.min(speed * dt, length)
  let nearest = travel + 1
  let next = -1
  for (let i = 0; i < controls.length; i++) {
    if (i === state.passed) continue
    const control = controls[i]
    if (control.kind === 'signal' && signalIsGreen(control.axis, elapsed)) continue
    const distance = (((controls[i].distance - state.distance) % length) + length) % length
    if (distance <= travel && distance < nearest) {
      nearest = distance
      next = i
    }
  }
  if (next >= 0) {
    state.distance = (state.distance + nearest) % length
    state.waitingAt = next
    state.waited = 0
    state.passed = null
    return
  }
  state.distance = (state.distance + travel) % length
  if (travel > 0) state.passed = null
}

/** A leg of the lane graph is missing: the city has no honest route to drive. */
export class TrafficRouteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrafficRouteError'
  }
}

/** The lane path of a centreline: each point moved by the lane offset along its own normal. */
function lanePath(points: readonly RoadPathSample[], laneOffset: number): RoadPathSample[] {
  return points.map((p) => {
    const length = Math.hypot(p.tangentX, p.tangentZ) || 1
    return {
      x: p.x - (p.tangentZ / length) * laneOffset,
      z: p.z + (p.tangentX / length) * laneOffset,
      tangentX: p.tangentX,
      tangentZ: p.tangentZ,
    }
  })
}

/** Cumulative distance along a path. A vehicle travels these metres, so a frame never moves it further. */
function pathDistances(points: readonly RoadPathSample[]): number[] {
  const distances = [0]
  for (let p = 1; p < points.length; p++) {
    distances.push((distances[p - 1] ?? 0) + Math.hypot(points[p].x - points[p - 1].x, points[p].z - points[p - 1].z))
  }
  return distances
}

const LANE_OFFSET = -0.72
const LATTICE = [0.15, 0.5, 0.85]
/** Lattice cells (column, row) that make one loop; together they cover many blocks of the city. */
const LOOP_CELLS: readonly (readonly [number, number][])[] = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  [
    [1, 0],
    [2, 0],
    [2, 1],
    [1, 1],
  ],
  [
    [0, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ],
  [
    [1, 1],
    [2, 1],
    [2, 2],
    [1, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
  ],
]

/** The node sequences of the closed loops, each leg a shortest path on the lane graph. */
function loopNodeSequences(liveGraph: RoadGraph): string[][] {
  const driven = new Set<string>()
  for (const segment of Object.values(liveGraph.segments)) {
    driven.add(segment.from)
    driven.add(segment.to)
  }
  const nodes = Object.values(liveGraph.nodes).filter((node) => driven.has(node.id))
  if (nodes.length < 2) return []
  const minX = Math.min(...nodes.map((node) => node.x))
  const maxX = Math.max(...nodes.map((node) => node.x))
  const minZ = Math.min(...nodes.map((node) => node.z))
  const maxZ = Math.max(...nodes.map((node) => node.z))
  const closestNode = (x: number, z: number): string =>
    nodes.reduce(
      (best, node) =>
        (node.x - x) ** 2 + (node.z - z) ** 2 < best.d
          ? { id: node.id, d: (node.x - x) ** 2 + (node.z - z) ** 2 }
          : best,
      {
        id: nodes[0].id,
        d: Infinity,
      },
    ).id
  const seen = new Set<string>()
  const sequences: string[][] = []
  for (const cells of LOOP_CELLS) {
    const anchors: string[] = []
    for (const [column, row] of cells) {
      const id = closestNode(minX + (maxX - minX) * LATTICE[column], minZ + (maxZ - minZ) * LATTICE[row])
      if (!anchors.includes(id)) anchors.push(id)
    }
    const key = anchors.join('>')
    if (anchors.length < 2 || seen.has(key)) continue
    seen.add(key)
    const loop: string[] = []
    for (let i = 0; i < anchors.length; i++) {
      const from = anchors[i]
      const to = anchors[(i + 1) % anchors.length]
      const leg = route(liveGraph, from, to)
      if (!leg) throw new TrafficRouteError(`no lane-graph route from ${from} to ${to}`)
      loop.push(...(i ? leg.slice(1) : leg))
    }
    sequences.push(loop)
  }
  return sequences
}

interface LoopGeometry {
  forward: RoadPathSample[]
  reverse: RoadPathSample[]
  forwardDistances: number[]
  reverseDistances: number[]
  controlsForward: TrafficControl[]
  controlsReverse: TrafficControl[]
}

/** The centreline of one loop, leg by leg; a node without a segment between two path nodes is an error. */
function loopCentreline(liveGraph: RoadGraph, loopNodes: readonly string[]) {
  const centre: RoadPathSample[] = []
  const legs: { start: number; end: number; from: string; to: string; width: number }[] = []
  for (let i = 0; i + 1 < loopNodes.length; i++) {
    const fromId = loopNodes[i]
    const toId = loopNodes[i + 1]
    const segment = Object.values(liveGraph.segments).find(
      (candidate) =>
        (candidate.from === fromId && candidate.to === toId) || (candidate.from === toId && candidate.to === fromId),
    )
    if (!segment) throw new TrafficRouteError(`no road segment between ${fromId} and ${toId}`)
    if (!(segment.from in liveGraph.nodes) || !(segment.to in liveGraph.nodes))
      throw new TrafficRouteError(`road segment ${segment.id} has an endpoint outside the graph`)
    const a = liveGraph.nodes[segment.from]
    const b = liveGraph.nodes[segment.to]
    const points = sampleRoadCurve(a.x, a.z, b.x, b.z, segment.curve, segment.id, 1.8)
    const directed =
      segment.from === fromId
        ? points
        : [...points].reverse().map((p) => ({ ...p, tangentX: -p.tangentX, tangentZ: -p.tangentZ }))
    const start = centre.length
    centre.push(...directed)
    legs.push({ start, end: centre.length - 1, from: fromId, to: toId, width: segment.width })
  }
  return { centre, legs }
}

function loopGeometry(liveGraph: RoadGraph, loopNodes: readonly string[]): LoopGeometry {
  if (loopNodes.length < 2 || loopNodes[0] !== loopNodes[loopNodes.length - 1])
    throw new TrafficRouteError('a traffic loop must return to the node it started from')
  const { centre, legs } = loopCentreline(liveGraph, loopNodes)
  // The loop closes on the first lane point itself: the last chord runs into the start, never a jump.
  const forward = lanePath(centre, LANE_OFFSET)
  forward.push({ ...forward[0] })
  const reverseCentre = [...centre, centre[0]]
    .reverse()
    .map((p) => ({ ...p, tangentX: -p.tangentX, tangentZ: -p.tangentZ }))
  const reverse = lanePath(reverseCentre, LANE_OFFSET)
  reverse[reverse.length - 1] = { ...reverse[0] }
  const forwardDistances = pathDistances(forward)
  const reverseDistances = pathDistances(reverse)
  const controlsForward: TrafficControl[] = []
  const controlsReverse: TrafficControl[] = []
  if ('seed:0' in liveGraph.nodes) {
    const degrees = new Map<string, number>()
    for (const segment of Object.values(liveGraph.segments)) {
      degrees.set(segment.from, (degrees.get(segment.from) ?? 0) + 1)
      degrees.set(segment.to, (degrees.get(segment.to) ?? 0) + 1)
    }
    const lastIndex = forward.length - 1
    const forwardLength = forwardDistances[lastIndex] ?? 1
    const reverseLength = reverseDistances[lastIndex] ?? 1
    for (const leg of legs) {
      const startDistance = forwardDistances[leg.start] ?? 0
      const endDistance = forwardDistances[leg.end] ?? 0
      const setback = Math.min(leg.width / 2 + 1, (endDistance - startDistance) / 2)
      const addControl = (
        nodeId: string,
        tangentIndex: number,
        distance: number,
        length: number,
        out: TrafficControl[],
      ) => {
        const degree = degrees.get(nodeId) ?? 0
        const tangent = forward.at(tangentIndex)
        if (degree < 3 || !tangent) return
        out.push({
          distance: ((distance % length) + length) % length,
          kind: degree >= 4 ? 'signal' : 'stop',
          axis: Math.abs(tangent.tangentX) >= Math.abs(tangent.tangentZ) ? 'x' : 'z',
        })
      }
      addControl(leg.to, leg.end, endDistance - setback, forwardLength, controlsForward)
      addControl(
        leg.from,
        leg.start,
        (reverseDistances[lastIndex - leg.start] ?? 0) - setback,
        reverseLength,
        controlsReverse,
      )
    }
  }
  return { forward, reverse, forwardDistances, reverseDistances, controlsForward, controlsReverse }
}

const FLEET_SIZE = 28

/**
 * The fleet's routes: closed loops over many blocks of the lane graph. A leg
 * the lane graph cannot drive is a {@link TrafficRouteError}, never a chord
 * across the blocks. An empty graph has nothing to drive and yields no routes.
 */
export function makeTrafficRoutes(liveGraph: RoadGraph): TrafficRoute[] {
  const sequences = loopNodeSequences(liveGraph)
  if (!sequences.length) return []
  const loops = sequences.map((nodes) => loopGeometry(liveGraph, nodes))
  const pairs = FLEET_SIZE / 2
  const slotsPerLoop = Math.ceil(pairs / loops.length)
  return Array.from({ length: FLEET_SIZE }, (_, i) => {
    const pair = Math.floor(i / 2)
    const loopIndex = pair % loops.length
    const loop = loops[loopIndex]
    const phase = (Math.floor(pair / loops.length) + loopIndex / loops.length) / slotsPerLoop
    const reverse = i % 2 === 1
    const distances = reverse ? loop.reverseDistances : loop.forwardDistances
    const length = distances[distances.length - 1] ?? 0
    // metres per real second: readable city movement, not simulation-time warp.
    const speed = 2.1 + (i % 3) * 0.28
    return {
      points: reverse ? loop.reverse : loop.forward,
      distances,
      length,
      laneOffset: LANE_OFFSET,
      phase,
      speed,
      baseSpeed: speed,
      controls: reverse ? loop.controlsReverse : loop.controlsForward,
      motion: { distance: phase * length, waitingAt: null, waited: 0, passed: null },
    }
  })
}

// ---------------------------------------------------------------------------
// R104 / R106: economy-driven vehicle generation and goods vehicles
// ---------------------------------------------------------------------------

/** Vehicle types that get spawned from the economic engine (R104). */
export type EconomyVehicleType = 'commuter' | 'freight' | 'construction'

/** A vehicle generated by the economic engine (R104). */
export interface EconomyVehicle {
  id: string
  type: EconomyVehicleType
  /** Start point in world coords. */
  fromX: number
  fromZ: number
  /** Destination point in world coords. */
  toX: number
  toZ: number
  /** Goods type carried (R106). */
  goodsType?: string
  /** Route assigned (if any). */
  routeIndex?: number
}

/** The economic zone of a building kind: exact kinds only, so a "storehouse" is never a store. */
export type EconomyZone = 'commercial' | 'industrial' | 'residential'

const COMMERCIAL_KINDS: ReadonlySet<string> = new Set(['store', 'restaurant', 'mall', 'shop', 'market'])
const INDUSTRIAL_KINDS: ReadonlySet<string> = new Set(['factory', 'warehouse', 'depot', 'foundry', 'mill'])

/** Classify a building kind into its economic zone by whole-word match, never by substring. */
export function economyZone(kind: string): EconomyZone {
  const words = kind.toLowerCase().split(/[^a-z0-9]+/)
  if (words.some((word) => COMMERCIAL_KINDS.has(word))) return 'commercial'
  if (words.some((word) => INDUSTRIAL_KINDS.has(word))) return 'industrial'
  return 'residential'
}

/**
 * Generate economy-driven vehicles based on economic state (R104).
 * Commuter vehicles for residential↔commercial, freight trucks for
 * industrial→commercial (R106), construction vehicles for active sites.
 * Every draw comes from the traffic stream the caller passes in.
 */
export function vehiclesFromEconomy(
  prng: () => number,
  buildings: Record<string, { x: number; z: number; kind: string }>,
  plots: { x: number; z: number; construction: { progress: number } | null }[],
): EconomyVehicle[] {
  const vehicles: EconomyVehicle[] = []
  let id = 0
  const commercialBuildings: { x: number; z: number }[] = []
  const industrialBuildings: { x: number; z: number }[] = []
  const constructionPlots: { x: number; z: number }[] = []
  const residentialBuildings: { x: number; z: number }[] = []
  for (const b of Object.values(buildings)) {
    const zone = economyZone(b.kind)
    const pool =
      zone === 'commercial' ? commercialBuildings : zone === 'industrial' ? industrialBuildings : residentialBuildings
    pool.push({ x: b.x, z: b.z })
  }
  for (const p of plots) {
    if (p.construction) constructionPlots.push({ x: p.x, z: p.z })
  }
  const pick = <T>(pool: readonly T[]): T => pool[Math.floor(prng() * pool.length)]

  // R104: commuter vehicles (residential → commercial).
  const commuterCount = Math.max(0, Math.floor(commercialBuildings.length * 0.6))
  for (let i = 0; i < commuterCount && residentialBuildings.length > 0; i++) {
    const from = pick(residentialBuildings)
    const to = pick(commercialBuildings)
    vehicles.push({ id: `eco-commuter-${id++}`, type: 'commuter', fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z })
  }

  // R106: freight vehicles (industrial → commercial) carrying goods.
  const freightCount = Math.max(0, Math.floor(industrialBuildings.length * 0.4))
  const goodsTypes = ['food', 'electronics', 'machinery', 'textiles']
  for (let i = 0; i < freightCount; i++) {
    const from = pick(industrialBuildings)
    const to = commercialBuildings.length > 0 ? pick(commercialBuildings) : from
    vehicles.push({
      id: `eco-freight-${id++}`,
      type: 'freight',
      fromX: from.x,
      fromZ: from.z,
      toX: to.x,
      toZ: to.z,
      goodsType: pick(goodsTypes),
    })
  }

  // Construction vehicles at active sites.
  for (const p of constructionPlots.slice(0, 5)) {
    vehicles.push({
      id: `eco-construction-${id++}`,
      type: 'construction',
      fromX: p.x,
      fromZ: p.z,
      toX: p.x,
      toZ: p.z,
    })
  }
  return vehicles
}

const ECONOMY_SPEED: Readonly<Record<EconomyVehicleType, number>> = { freight: 1.6, construction: 1.2, commuter: 2.1 }

/** The identity of one assignment set: change it and the fleet is reassigned, keep it and nothing moves. */
function assignmentKey(vehicles: readonly EconomyVehicle[]): string {
  return vehicles.map((v) => `${v.id}:${v.type}`).join('|')
}

/**
 * Merge economy vehicles into the traffic fleet (R104/R106). Vehicle i takes
 * route i's speed for its type. The assignment runs only when the set of
 * vehicles changes, and it never moves a car: position belongs to the
 * simulation alone. Routes without an economy vehicle return to their base speed.
 * Returns whether the assignment changed.
 */
export function mergeEconomyVehiclesIntoFleet(
  fleet: { routes: TrafficRoute[]; economyKey?: string },
  vehicles: readonly EconomyVehicle[],
): boolean {
  const key = assignmentKey(vehicles)
  if (fleet.economyKey === key) return false
  fleet.economyKey = key
  fleet.routes.forEach((route, i) => {
    const vehicle = vehicles.at(i)
    route.baseSpeed ??= route.speed
    route.speed = vehicle ? ECONOMY_SPEED[vehicle.type] : route.baseSpeed
  })
  return true
}

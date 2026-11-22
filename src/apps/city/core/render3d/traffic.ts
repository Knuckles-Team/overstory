// spec: OVERSTORY-CITY-R032
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
  controls: TrafficControl[]
  motion: TrafficMotion
}

export interface TrafficFleet {
  graph: RoadGraph
  routes: TrafficRoute[]
  elapsed: number
  positions: number[]
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

/** Sample a vehicle position with the same lane offset in either renderer. */
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
  const startLength = Math.hypot(start.tangentX, start.tangentZ) || 1
  const endLength = Math.hypot(end.tangentX, end.tangentZ) || 1
  const startX = start.x - (start.tangentZ / startLength) * route.laneOffset
  const startZ = start.z + (start.tangentX / startLength) * route.laneOffset
  const endX = end.x - (end.tangentZ / endLength) * route.laneOffset
  const endZ = end.z + (end.tangentX / endLength) * route.laneOffset
  out.x = startX + (endX - startX) * t
  out.z = startZ + (endZ - startZ) * t
  out.heading = Math.atan2(-(end.z - start.z), end.x - start.x)
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

export function makeTrafficRoutes(liveGraph: RoadGraph): TrafficRoute[] {
  const nodes = Object.values(liveGraph.nodes)
  if (!nodes.length) return []
  const minX = Math.min(...nodes.map((node) => node.x))
  const maxX = Math.max(...nodes.map((node) => node.x))
  const minZ = Math.min(...nodes.map((node) => node.z))
  const maxZ = Math.max(...nodes.map((node) => node.z))
  const closestNode = (x: number, z: number): string =>
    nodes.reduce((best, node) => {
      const currentDistance = (node.x - x) ** 2 + (node.z - z) ** 2
      const bestDistance =
        best in liveGraph.nodes ? (liveGraph.nodes[best].x - x) ** 2 + (liveGraph.nodes[best].z - z) ** 2 : Infinity
      return currentDistance < bestDistance ? node.id : best
    }, nodes[0]?.id ?? '')
  const anchors = [
    closestNode(minX + (maxX - minX) * 0.18, minZ + (maxZ - minZ) * 0.18),
    closestNode(minX + (maxX - minX) * 0.82, minZ + (maxZ - minZ) * 0.18),
    closestNode(minX + (maxX - minX) * 0.82, minZ + (maxZ - minZ) * 0.82),
    closestNode(minX + (maxX - minX) * 0.18, minZ + (maxZ - minZ) * 0.82),
  ]
  const loopNodes: string[] = []
  for (let i = 0; i < anchors.length; i++) {
    const from = anchors[i]
    const to = anchors[(i + 1) % anchors.length]
    if (!from || !to) continue
    const leg = route(liveGraph, from, to)
    if (!leg) continue
    loopNodes.push(...(i ? leg.slice(1) : leg))
  }
  if (loopNodes.length < 2) return []
  const loopPoints: RoadPathSample[] = []
  const legs: { start: number; end: number; from: string; to: string; width: number }[] = []
  for (let i = 0; i < loopNodes.length; i++) {
    const fromId = loopNodes[i]
    const toId = loopNodes[(i + 1) % loopNodes.length]
    if (!fromId || !toId) continue
    const segment = Object.values(liveGraph.segments).find(
      (candidate) =>
        (candidate.from === fromId && candidate.to === toId) || (candidate.from === toId && candidate.to === fromId),
    )
    if (!segment) continue
    if (!(segment.from in liveGraph.nodes) || !(segment.to in liveGraph.nodes)) continue
    const a = liveGraph.nodes[segment.from]
    const b = liveGraph.nodes[segment.to]
    const points = sampleRoadCurve(a.x, a.z, b.x, b.z, segment.curve, segment.id, 1.8)
    const directed =
      segment.from === fromId
        ? points
        : points.reverse().map((p) => ({ ...p, tangentX: -p.tangentX, tangentZ: -p.tangentZ }))
    const start = loopPoints.length
    loopPoints.push(...directed)
    legs.push({ start, end: loopPoints.length - 1, from: fromId, to: toId, width: segment.width })
  }
  if (loopPoints.length > 0) loopPoints.push({ ...loopPoints[0] })
  const distances = [0]
  for (let p = 1; p < loopPoints.length; p++) {
    const prev = loopPoints[p - 1]
    const current = loopPoints[p]
    distances.push((distances[p - 1] ?? 0) + Math.hypot(current.x - prev.x, current.z - prev.z))
  }
  const loopLength = distances[distances.length - 1] ?? 1
  if (loopLength <= 0) return []
  const reversePoints = [...loopPoints]
    .reverse()
    .map((point) => ({ ...point, tangentX: -point.tangentX, tangentZ: -point.tangentZ }))
  const reverseDistances = [...distances].reverse().map((distance) => loopLength - distance)
  const forwardControls: TrafficControl[] = []
  const reverseControls: TrafficControl[] = []
  if ('seed:0' in liveGraph.nodes) {
    const degrees = new Map<string, number>()
    for (const segment of Object.values(liveGraph.segments)) {
      degrees.set(segment.from, (degrees.get(segment.from) ?? 0) + 1)
      degrees.set(segment.to, (degrees.get(segment.to) ?? 0) + 1)
    }
    for (const leg of legs) {
      const startDistance = distances[leg.start] ?? 0
      const endDistance = distances[leg.end] ?? 0
      const setback = Math.min(leg.width / 2 + 1, (endDistance - startDistance) / 2)
      const addControl = (nodeId: string, pointIndex: number, distance: number, out: TrafficControl[]) => {
        const degree = degrees.get(nodeId) ?? 0
        const tangent = loopPoints.at(pointIndex)
        if (degree < 3 || !tangent) return
        out.push({
          distance: ((distance % loopLength) + loopLength) % loopLength,
          kind: degree >= 4 ? 'signal' : 'stop',
          axis: Math.abs(tangent.tangentX) >= Math.abs(tangent.tangentZ) ? 'x' : 'z',
        })
      }
      addControl(leg.to, leg.end, endDistance - setback, forwardControls)
      addControl(leg.from, leg.start, loopLength - startDistance - setback, reverseControls)
    }
  }
  return Array.from({ length: 28 }, (_, i) => {
    const phase = Math.floor(i / 2) / 14
    return {
      points: i % 2 ? reversePoints : loopPoints,
      distances: i % 2 ? reverseDistances : distances,
      length: loopLength,
      laneOffset: -0.72,
      phase,
      // metres per real second: readable city movement, not simulation-time warp.
      speed: 2.1 + (i % 3) * 0.28,
      controls: i % 2 ? reverseControls : forwardControls,
      motion: { distance: phase * loopLength, waitingAt: null, waited: 0, passed: null },
    }
  })
}

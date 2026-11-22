// spec: OVERSTORY-CITY-R032
import { sampleRoadCurve, type RoadGraph } from '@/lib/scene3d/roads'

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
      const samples = sampleRoadCurve(a.x, a.z, b.x, b.z, arm.curve, arm.id, 1.8, 1.65)
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

/**
 * @file roads.ts
 * @description The road network the operator can shape
 * (OVERSTORY-DESIGN-R012.6 / OVERSTORY-CITY-R032): roads are a generated
 * graph with curved segments and typed intersections (each with crosswalks),
 * derived from the layout; an edit (draw or remove a segment, move or rotate
 * a building) is validated — the graph stays connected and nothing overlaps —
 * before it is stored as a layout override. The pure graph, crosswalk
 * derivation and edit validation live here so the bar is testable without a
 * renderer; the city's scene module builds the geometry from this graph.
 */

/** One centreline sample shared by the road mesh and the traffic layer. */
export interface RoadPathSample {
  x: number
  z: number
  tangentX: number
  tangentZ: number
}

/**
 * Deterministically sample the exact quadratic road centreline.  Traffic
 * calls this same seam, so it can never drive a straight invisible lane
 * while its visible asphalt bends beneath it.
 */
export function sampleRoadCurve(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  curve: number,
  id: string,
  maxSpacing = 3.5,
  inset = 0,
): RoadPathSample[] {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len
  const uz = dz / len
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  const signedCurve = ((hash >>> 0) & 1 ? 1 : -1) * Math.min(len * 0.14, 2.1) * curve
  const cx = (x1 + x2) / 2 - uz * signedCurve
  const cz = (z1 + z2) / 2 + ux * signedCurve
  const at = (t: number): { x: number; z: number } => {
    const mt = 1 - t
    return { x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2, z: mt * mt * z1 + 2 * mt * t * cz + t * t * z2 }
  }
  const tangent = (t: number): { x: number; z: number } => ({
    x: 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx),
    z: 2 * (1 - t) * (cz - z1) + 2 * t * (z2 - cz),
  })
  const edge = Math.min(Math.max(0, inset), len * 0.2) / len
  const steps = Math.max(2, Math.ceil((len * (1 - edge * 2)) / maxSpacing))
  const samples: RoadPathSample[] = []
  for (let i = 0; i <= steps; i++) {
    const t = edge + (1 - edge * 2) * (i / steps)
    const p = at(t)
    const d = tangent(t)
    samples.push({ x: p.x, z: p.z, tangentX: d.x, tangentZ: d.z })
  }
  return samples
}

/** One node of the road graph. */
export interface RoadNode {
  id: string
  x: number
  z: number
  kind: 'intersection' | 'endpoint'
}

/** One road segment between two nodes; `curve` bows the segment out of the straight line. */
export interface RoadSegment {
  id: string
  from: string
  to: string
  /** Lateral bow in metres (0 = straight); the segment renders curved. */
  curve: number
  width: number
}

export interface RoadGraph {
  nodes: Record<string, RoadNode>
  segments: Record<string, RoadSegment>
}

/**
 * Derive the road graph from the layout's road grid (R012.6): every
 * x/z road crossing is a typed intersection, the runs between them are
 * segments with a gentle curve so the network reads authored, not gridded.
 * The derived layout is the default the operator edits override.
 */
export function deriveRoadGraph(
  xRoads: number[],
  zRoads: number[],
  opts: { segmentWidth?: number; curve?: number } = {},
): RoadGraph {
  const { segmentWidth = 2.6, curve = 0.4 } = opts
  const nodes: Record<string, RoadNode> = {}
  const segments: Record<string, RoadSegment> = {}
  for (let xi = 0; xi < xRoads.length; xi++) {
    for (let zi = 0; zi < zRoads.length; zi++) {
      const id = `n${xi}:${zi}`
      const corner = xi === 0 || xi === xRoads.length - 1 || zi === 0 || zi === zRoads.length - 1
      nodes[id] = {
        id,
        x: xRoads[xi] ?? 0,
        z: zRoads[zi] ?? 0,
        kind: corner && xi === 0 && zi === 0 ? 'endpoint' : 'intersection',
      }
      if (xi < xRoads.length - 1) {
        const to = `n${xi + 1}:${zi}`
        segments[`s-x${xi}:${zi}`] = { id: `s-x${xi}:${zi}`, from: id, to, curve, width: segmentWidth }
      }
      if (zi < zRoads.length - 1) {
        const to = `n${xi}:${zi + 1}`
        segments[`s-z${xi}:${zi}`] = { id: `s-z${xi}:${zi}`, from: id, to, curve, width: segmentWidth }
      }
    }
  }
  return { nodes, segments }
}

/**
 * The crosswalks for one intersection (R012.6: every intersection has
 * crosswalks): one band per arm, placed just off the node along each
 * connected segment, oriented across the road.
 */
export function crosswalksFor(graph: RoadGraph, nodeId: string): { x: number; z: number; rotation: number }[] {
  if (!(nodeId in graph.nodes)) return []
  const node = graph.nodes[nodeId]
  const out: { x: number; z: number; rotation: number }[] = []
  // Just past the node, toward the other end, rotated across the road.
  const band = (dx: number, dz: number): { x: number; z: number; rotation: number } => {
    const len = Math.hypot(dx, dz) || 1
    return {
      x: node.x + (dx / len) * 2.2,
      z: node.z + (dz / len) * 2.2,
      rotation: Math.atan2(dz, dx) + Math.PI / 2,
    }
  }
  for (const segment of Object.values(graph.segments)) {
    if (segment.from === nodeId) {
      const other = graph.nodes[segment.to]
      out.push(band(other.x - node.x, other.z - node.z))
    } else if (segment.to === nodeId) {
      const other = graph.nodes[segment.from]
      out.push(band(node.x - other.x, node.z - other.z))
    }
  }
  return out
}

/** True when every node can reach every other node over the segments. */
export function graphConnected(graph: RoadGraph): boolean {
  const ids = Object.keys(graph.nodes)
  if (ids.length === 0) return true
  const adj = new Map<string, string[]>()
  for (const id of ids) adj.set(id, [])
  for (const segment of Object.values(graph.segments)) {
    adj.get(segment.from)?.push(segment.to)
    adj.get(segment.to)?.push(segment.from)
  }
  const start = ids[0]
  if (!start) return true
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length) {
    const node = queue.shift()
    if (!node) break
    for (const next of adj.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen.size === ids.length
}

/** A proposed network edit (R012.6 / R032). */
export interface RoadEdit {
  kind: 'add-segment' | 'remove-segment'
  segment?: RoadSegment
}

export interface EditVerdict {
  ok: boolean
  /** Why the edit was refused, when it was. */
  reason?: 'disconnects-graph' | 'overlaps-existing-segment' | 'unknown-node'
}

function segmentsOverlap(graph: RoadGraph, a: RoadSegment, b: RoadSegment): boolean {
  if (a.from === b.from && a.to === b.to) return true
  if (a.from === b.to && a.to === b.from) return true
  if (!(a.from in graph.nodes) || !(a.to in graph.nodes) || !(b.from in graph.nodes) || !(b.to in graph.nodes))
    return false
  const a0 = graph.nodes[a.from]
  const a1 = graph.nodes[a.to]
  const b0 = graph.nodes[b.from]
  const b1 = graph.nodes[b.to]
  const shared = [a.from, a.to].find((id) => id === b.from || id === b.to)
  if (shared) {
    const junction = graph.nodes[shared]
    const first = graph.nodes[a.from === shared ? a.to : a.from]
    const second = graph.nodes[b.from === shared ? b.to : b.from]
    const ax = first.x - junction.x
    const az = first.z - junction.z
    const bx = second.x - junction.x
    const bz = second.z - junction.z
    const product = Math.hypot(ax, az) * Math.hypot(bx, bz)
    if (product === 0 || (ax * bx + az * bz) / product > Math.cos(Math.PI / 4)) return true
  }
  const clearance = (a.width + b.width) / 2
  const junction = shared ? graph.nodes[shared] : null
  const outsideJunction = (point: RoadPathSample): boolean =>
    !junction || Math.hypot(point.x - junction.x, point.z - junction.z) >= clearance * 2
  const firstPoints = sampleRoadCurve(a0.x, a0.z, a1.x, a1.z, a.curve, a.id, 1).filter(outsideJunction)
  const secondPoints = sampleRoadCurve(b0.x, b0.z, b1.x, b1.z, b.curve, b.id, 1).filter(outsideJunction)
  interface Point {
    x: number
    z: number
  }
  const cross = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const distance = (p: Point, start: Point, end: Point): number => {
    const dx = end.x - start.x
    const dz = end.z - start.z
    const lengthSq = dx * dx + dz * dz
    const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.z - start.z) * dz) / lengthSq)) : 0
    return Math.hypot(p.x - start.x - t * dx, p.z - start.z - t * dz)
  }
  for (let i = 1; i < firstPoints.length; i++) {
    const p = firstPoints[i - 1]
    const q = firstPoints[i]
    for (let j = 1; j < secondPoints.length; j++) {
      const r = secondPoints[j - 1]
      const s = secondPoints[j]
      if (cross(p, q, r) * cross(p, q, s) <= 0 && cross(r, s, p) * cross(r, s, q) <= 0) {
        const overlapX =
          Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)) <= Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x))
        const overlapZ =
          Math.max(Math.min(p.z, q.z), Math.min(r.z, s.z)) <= Math.min(Math.max(p.z, q.z), Math.max(r.z, s.z))
        if (overlapX && overlapZ) return true
      }
      if (Math.min(distance(p, r, s), distance(q, r, s), distance(r, p, q), distance(s, p, q)) < clearance) return true
    }
  }
  return false
}

/**
 * Validate a network edit before it is stored (R012.6): the graph must stay
 * connected, the edit must not overlap an existing segment, and both ends
 * must be known nodes. A refused edit is never applied; the caller surfaces
 * the refusal to the operator.
 */
export function validateRoadEdit(graph: RoadGraph, edit: RoadEdit): EditVerdict {
  if (edit.kind === 'remove-segment') {
    const segment = edit.segment
    if (!segment) return { ok: false, reason: 'unknown-node' }
    const next: RoadGraph = {
      nodes: { ...graph.nodes },
      segments: Object.fromEntries(Object.entries(graph.segments).filter(([id]) => id !== segment.id)),
    }
    return graphConnected(next) ? { ok: true } : { ok: false, reason: 'disconnects-graph' }
  }
  const segment = edit.segment
  if (!segment) return { ok: false, reason: 'unknown-node' }
  if (!(segment.from in graph.nodes) || !(segment.to in graph.nodes)) return { ok: false, reason: 'unknown-node' }
  for (const existing of Object.values(graph.segments)) {
    if (segmentsOverlap(graph, existing, segment)) return { ok: false, reason: 'overlaps-existing-segment' }
  }
  return { ok: true }
}

/**
 * The re-route after an accepted edit (R012.6): BFS shortest path between
 * two points snapped to the graph. Returns the node ids along the route, or
 * null when the points are disconnected (the caller keeps the last route).
 */
/** The nearest node of the live graph to a ground point (R032 re-route). */
export function snapToNode(graph: RoadGraph, x: number, z: number): RoadNode | null {
  let best: RoadNode | null = null
  let bd = Infinity
  for (const node of Object.values(graph.nodes)) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2
    if (d < bd) {
      bd = d
      best = node
    }
  }
  return best
}

/**
 * Waypoints along the live graph between two ground points (R032): both ends
 * snap to the nearest node and the graph's BFS route is walked; collinear
 * waypoints collapse so a path stays as short as the derived grid's, and the
 * destination point is appended so the walk ends exactly where it was aimed.
 * Returns null when the ends are disconnected — the caller keeps the last
 * route (a refused edit never strands a character).
 */
export function pathOn(graph: RoadGraph, fromX: number, fromZ: number, toX: number, toZ: number): number[][] | null {
  const start = snapToNode(graph, fromX, fromZ)
  const end = snapToNode(graph, toX, toZ)
  if (!start || !end) return null
  if (start.id === end.id) return [[toX, toZ]]
  const chain = route(graph, start.id, end.id)
  if (!chain) return null
  const out: number[][] = []
  for (const id of chain) {
    if (!(id in graph.nodes)) continue
    const node = graph.nodes[id]
    const last = out.length ? out[out.length - 1] : null
    if (!last || Math.hypot(last[0] - node.x, last[1] - node.z) > 0.5) out.push([node.x, node.z])
  }
  const tail = out.length ? out[out.length - 1] : null
  if (!tail || Math.hypot(tail[0] - toX, tail[1] - toZ) > 0.5) out.push([toX, toZ])
  return out
}

export function route(graph: RoadGraph, fromNodeId: string, toNodeId: string): string[] | null {
  if (!(fromNodeId in graph.nodes) || !(toNodeId in graph.nodes)) return null
  const adj = new Map<string, string[]>()
  for (const id of Object.keys(graph.nodes)) adj.set(id, [])
  for (const segment of Object.values(graph.segments)) {
    adj.get(segment.from)?.push(segment.to)
    adj.get(segment.to)?.push(segment.from)
  }
  const prev = new Map<string, string | null>([[fromNodeId, null]])
  const queue = [fromNodeId]
  while (queue.length) {
    const node = queue.shift()
    if (!node) break
    if (node === toNodeId) break
    for (const next of adj.get(node) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, node)
        queue.push(next)
      }
    }
  }
  if (!prev.has(toNodeId)) return null
  const chain: string[] = []
  for (let k: string | null = toNodeId; k; k = prev.get(k) ?? null) chain.unshift(k)
  return chain
}

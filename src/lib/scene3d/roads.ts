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

function segmentMidpoint(graph: RoadGraph, segment: RoadSegment): { x: number; z: number } | null {
  if (!(segment.from in graph.nodes) || !(segment.to in graph.nodes)) return null
  const a = graph.nodes[segment.from]
  const b = graph.nodes[segment.to]
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
}

function segmentsOverlap(graph: RoadGraph, a: RoadSegment, b: RoadSegment, tolerance = 1.0): boolean {
  // A segment between the same two nodes, in either direction, duplicates
  // an existing segment: an overlap the edit validation must refuse.
  if (a.from === b.from && a.to === b.to) return true
  if (a.from === b.to && a.to === b.from) return true
  const midA = segmentMidpoint(graph, a)
  const midB = segmentMidpoint(graph, b)
  if (!midA || !midB) return false
  return Math.hypot(midA.x - midB.x, midA.z - midB.z) <= tolerance
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

/**
 * The force layout step loop (OVERSTORY-APPS-R030.10.2, R030.13.2).
 *
 * Only `layout.worker.ts` calls this at run time, so no layout step runs on the main thread.
 * It is a plain module so a unit test can drive it with a fake clock and a recording `post`.
 */
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'

export interface LayoutNode {
  id: string
  x: number
  y: number
  mass?: number
}

export interface LayoutRequest {
  type: 'run'
  runId: number
  nodes: LayoutNode[]
  edges: { source: string; target: string }[]
  /** Pinned nodes keep their position. */
  pinned: string[]
  /** Stop when the average displacement of a batch falls below this many graph units. */
  settleBelow?: number
  /** Stop after this many milliseconds. */
  maxMs?: number
  /** Force-layout iterations per posted batch. */
  batchIterations?: number
}

export interface LayoutBatch {
  type: 'batch' | 'done'
  runId: number
  /** Node ids in the order of `positions`, sent once with the first batch and the last. */
  ids: string[]
  /** x, y pairs in the order of `ids`. */
  positions: Float32Array
  avgDisplacement: number
  elapsedMs: number
  iterations: number
}

export const SETTLE_BELOW = 0.5
export const MAX_LAYOUT_MS = 1500
export const BATCH_ITERATIONS = 20

export function runLayout(
  request: LayoutRequest,
  post: (batch: LayoutBatch) => void,
  now: () => number = () => performance.now(),
  isCancelled: () => boolean = () => false,
): LayoutBatch {
  const graph = new Graph()
  for (const n of request.nodes) graph.addNode(n.id, { x: n.x, y: n.y, mass: n.mass ?? 1 })
  for (const e of request.edges) {
    if (graph.hasNode(e.source) && graph.hasNode(e.target) && !graph.hasEdge(e.source, e.target)) {
      graph.addEdge(e.source, e.target)
    }
  }
  const ids = request.nodes.map((n) => n.id)
  const pinned = new Set(request.pinned)
  const settleBelow = request.settleBelow ?? SETTLE_BELOW
  const maxMs = request.maxMs ?? MAX_LAYOUT_MS
  const step = request.batchIterations ?? BATCH_ITERATIONS
  const settings = {
    ...forceAtlas2.inferSettings(graph),
    barnesHutOptimize: graph.order > 2000,
    slowDown: 2,
  }
  const start = now()
  let iterations = 0
  const snapshot = (): Float32Array => {
    const out = new Float32Array(ids.length * 2)
    ids.forEach((id, i) => {
      out[i * 2] = graph.getNodeAttribute(id, 'x') as number
      out[i * 2 + 1] = graph.getNodeAttribute(id, 'y') as number
    })
    return out
  }
  let previous = snapshot()
  let last: LayoutBatch | null = null
  for (;;) {
    forceAtlas2.assign(graph, { iterations: step, settings })
    iterations += step
    for (const n of request.nodes) {
      if (pinned.has(n.id)) graph.mergeNodeAttributes(n.id, { x: n.x, y: n.y })
    }
    const positions = snapshot()
    let total = 0
    for (let i = 0; i < ids.length; i++) {
      total += Math.hypot(positions[i * 2] - previous[i * 2], positions[i * 2 + 1] - previous[i * 2 + 1])
    }
    const avgDisplacement = ids.length === 0 ? 0 : total / ids.length
    previous = positions
    const elapsedMs = now() - start
    const finished = avgDisplacement < settleBelow || elapsedMs >= maxMs || isCancelled()
    last = {
      type: finished ? 'done' : 'batch',
      runId: request.runId,
      ids,
      positions,
      avgDisplacement,
      elapsedMs,
      iterations,
    }
    post(last)
    if (finished) return last
  }
}

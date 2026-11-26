/**
 * Expand and collapse of the graph view (OVERSTORY-APPS-R030.10.3, .4, .7).
 *
 * The neighborhood is one bounded engine read per click (`eg.graph.GetNeighborhood`,
 * MEDULLA-DURABLE-KERNEL-R876). Clusters expand through `eg.compute.ClusterHierarchyExpand`.
 * Every node and edge comes from a served Arbora operation; this module decides nothing about
 * what the engine returns. It reaches the browser only through the typed `invoke` transport.
 */
import { z } from 'zod'
import { ArboraApiError, invoke } from '@/lib/arbora-api/invoke'
import type { GraphNode, GraphRelationship } from '@/components/knowledge-graph/GraphAdapter'
import { GRAPH_LIMITS_UNAVAILABLE, wouldExceedNodes, type GraphBudgetState } from '@/lib/graph-budget'

export const NEIGHBORHOOD_OP = 'eg.graph.GetNeighborhood'
export const CLUSTERS_OP = 'eg.compute.ClusterHierarchyClusters'
export const CLUSTER_EXPAND_OP = 'eg.compute.ClusterHierarchyExpand'

export const NEIGHBORHOOD_PER_NODE_LIMIT = 25
export const NEIGHBORHOOD_DEPTH = 1

export const EXPAND_REFUSAL_CODES = [
  'NEIGHBORHOOD_DEPTH_EXCEEDED',
  'NEIGHBORHOOD_LIMIT_EXCEEDED',
  'NEIGHBORHOOD_CURSOR_STALE',
  'NODE_NOT_FOUND',
] as const
export type ExpandRefusalCode = (typeof EXPAND_REFUSAL_CODES)[number]

export const REFUSAL_REASONS: Record<ExpandRefusalCode, string> = {
  NEIGHBORHOOD_DEPTH_EXCEEDED: 'Depth limit exceeded',
  NEIGHBORHOOD_LIMIT_EXCEEDED: 'Neighbor limit exceeded',
  NEIGHBORHOOD_CURSOR_STALE: 'The neighbor page expired',
  NODE_NOT_FOUND: 'Node not found',
}

export const VISIBLE_LIMIT_REASON = 'Visible limit reached'
export const NOT_AVAILABLE = 'not available'

/** What one expansion added, kept so Collapse can take exactly that back. */
export interface ExpansionRecord {
  origin: string
  addedNodeIds: string[]
  addedEdgeIds: string[]
}

export type ExpandVerdict =
  | {
      verdict: 'expanded'
      record: ExpansionRecord
      nodes: GraphNode[]
      relationships: GraphRelationship[]
      /** Hidden-neighbor count per node id, as the engine reported it. */
      hidden: Record<string, number>
    }
  | { verdict: 'limit'; reason: typeof VISIBLE_LIMIT_REASON }
  | { verdict: 'refused'; code: string; reason: string }
  | { verdict: 'unavailable'; reason: string }

export const edgeId = (source: string, target: string, type: string): string => `${source}|${type}|${target}`

const nodeSchema = z
  .object({
    id: z.string().min(1),
    labels: z.array(z.string()).optional(),
    node_type: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
  })
  .loose()
const edgeSchema = z
  .object({
    source: z.string().optional(),
    target: z.string().optional(),
    src_id: z.string().optional(),
    dst_id: z.string().optional(),
    type: z.string().optional(),
    relationship: z.string().optional(),
  })
  .loose()
const hiddenSchema = z.union([
  z.record(z.string(), z.number().int().nonnegative()),
  z.array(z.object({ id: z.string(), count: z.number().int().nonnegative() })),
])
const neighborhoodSchema = z
  .object({
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    hidden: hiddenSchema.optional(),
    hidden_counts: hiddenSchema.optional(),
    cursor: z.string().nullable().optional(),
  })
  .loose()

function toGraphNode(n: z.infer<typeof nodeSchema>): GraphNode {
  const type = n.node_type ?? n.labels?.[0]
  return {
    id: n.id,
    labels: n.labels && n.labels.length > 0 ? n.labels : type ? [type] : [],
    properties: n.properties ?? {},
  }
}

function toRelationship(e: z.infer<typeof edgeSchema>): GraphRelationship | null {
  const source = e.source ?? e.src_id
  const target = e.target ?? e.dst_id
  if (!source || !target) return null
  return { source, target, type: e.type ?? e.relationship ?? '_' }
}

function hiddenRecord(value: z.infer<typeof hiddenSchema> | undefined): Record<string, number> {
  if (!value) return {}
  if (Array.isArray(value)) return Object.fromEntries(value.map((v) => [v.id, v.count]))
  return value
}

export function isOperationAbsent(error: unknown): boolean {
  return (
    error instanceof ArboraApiError &&
    (error.code === 'HTTP_UNAVAILABLE' || error.code === 'OPERATION_NOT_FOUND' || error.code === 'UNKNOWN_OPERATION')
  )
}

function verdictFromError(error: unknown): ExpandVerdict {
  if (isOperationAbsent(error)) return { verdict: 'unavailable', reason: NOT_AVAILABLE }
  if (error instanceof ArboraApiError) {
    const reason = (REFUSAL_REASONS as Record<string, string>)[error.code] ?? error.code
    return { verdict: 'refused', code: error.code, reason }
  }
  throw error
}

export interface ExpandContext {
  visibleIds: ReadonlySet<string>
  budget: GraphBudgetState
  signal?: AbortSignal
}

/**
 * Read the neighborhood of one node and build the verdict. The graph is unchanged unless the verdict is `expanded`.
 * `read` is injectable so a test can observe the exact request; the default is the served transport.
 */
export async function expandNode(
  nodeId: string,
  ctx: ExpandContext,
  read: typeof invoke = invoke,
): Promise<ExpandVerdict> {
  if (ctx.budget.status === 'unavailable') return { verdict: 'unavailable', reason: GRAPH_LIMITS_UNAVAILABLE }
  const params = (cursor?: string): Record<string, unknown> => ({
    node_id: nodeId,
    depth: NEIGHBORHOOD_DEPTH,
    per_node_limit: NEIGHBORHOOD_PER_NODE_LIMIT,
    exclude: [...ctx.visibleIds],
    ...(cursor ? { cursor } : {}),
  })
  let result: z.infer<typeof neighborhoodSchema>
  try {
    try {
      result = await read(NEIGHBORHOOD_OP, params(), neighborhoodSchema, { signal: ctx.signal })
    } catch (error) {
      // A stale cursor triggers exactly one fresh read.
      if (error instanceof ArboraApiError && error.code === 'NEIGHBORHOOD_CURSOR_STALE') {
        result = await read(NEIGHBORHOOD_OP, params(), neighborhoodSchema, { signal: ctx.signal })
      } else throw error
    }
  } catch (error) {
    if (ctx.signal?.aborted) throw error
    return verdictFromError(error)
  }
  const fresh = result.nodes.map(toGraphNode).filter((n) => !ctx.visibleIds.has(n.id))
  if (wouldExceedNodes(ctx.budget.budget, ctx.visibleIds.size, fresh.length)) {
    return { verdict: 'limit', reason: VISIBLE_LIMIT_REASON }
  }
  const freshIds = new Set(fresh.map((n) => n.id))
  const relationships = result.edges
    .map(toRelationship)
    .filter((e): e is GraphRelationship => e !== null)
    .filter(
      (e) =>
        (freshIds.has(e.source) || freshIds.has(e.target)) &&
        (freshIds.has(e.source) || ctx.visibleIds.has(e.source)) &&
        (freshIds.has(e.target) || ctx.visibleIds.has(e.target)),
    )
  return {
    verdict: 'expanded',
    record: {
      origin: nodeId,
      addedNodeIds: fresh.map((n) => n.id),
      addedEdgeIds: relationships.map((e) => edgeId(e.source, e.target, e.type)),
    },
    nodes: fresh,
    relationships,
    hidden: hiddenRecord(result.hidden ?? result.hidden_counts),
  }
}

/** The nodes and edges a Collapse removes: record nodes with no visible edge to anything outside the record. */
export function collapseNode(
  record: ExpansionRecord,
  visibleRelationships: readonly GraphRelationship[],
): { removeNodeIds: string[]; removeEdgeIds: string[] } {
  const inRecord = new Set([...record.addedNodeIds, record.origin])
  const keep = new Set<string>()
  for (const e of visibleRelationships) {
    const sIn = inRecord.has(e.source)
    const tIn = inRecord.has(e.target)
    if (sIn && !tIn) keep.add(e.source)
    if (tIn && !sIn) keep.add(e.target)
  }
  keep.delete(record.origin)
  const removeNodeIds = record.addedNodeIds.filter((id) => !keep.has(id))
  const removed = new Set(removeNodeIds)
  const removeEdgeIds = visibleRelationships
    .filter((e) => removed.has(e.source) || removed.has(e.target))
    .map((e) => edgeId(e.source, e.target, e.type))
  return { removeNodeIds, removeEdgeIds }
}

// ── Engine clusters (R030.10.4, R030.13.3) ───────────────────────────────────────

const clusterSummarySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    node_count: z.number(),
    edge_count: z.number().optional(),
    top_node_types: z.array(z.tuple([z.string(), z.number()])).optional(),
  })
  .loose()
const clusterLevelSchema = z
  .object({
    level: z.number(),
    clusters: z.array(clusterSummarySchema),
    inter_cluster_edges: z.array(z.object({ src_idx: z.number(), dst_idx: z.number(), weight: z.number() }).loose()),
  })
  .loose()
const clusterExpansionSchema = z
  .object({
    nodes: z.array(z.object({ id: z.string(), properties: z.unknown().optional() }).loose()),
    edges: z.array(edgeSchema),
    child_clusters: z.array(clusterSummarySchema),
  })
  .loose()

export const CLUSTER_NODE_LABEL = 'Cluster'
export const clusterNodeId = (clusterId: string): string => `cluster:${clusterId}`
export const isClusterNodeId = (id: string): boolean => id.startsWith('cluster:')

export function clusterToNode(c: z.infer<typeof clusterSummarySchema>): GraphNode {
  return {
    id: clusterNodeId(c.id),
    labels: [CLUSTER_NODE_LABEL],
    properties: { name: `${c.label} (${String(c.node_count)})`, node_count: c.node_count, cluster_id: c.id },
  }
}

export type ClusterReadState =
  | { status: 'ready'; nodes: GraphNode[]; relationships: GraphRelationship[] }
  | { status: 'unavailable'; reason: string }
  | { status: 'refused'; reason: string }

/** The clustered start: one level of engine clusters and the edges between them. */
export async function readClusterLevel(
  level: number,
  signal?: AbortSignal,
  read: typeof invoke = invoke,
): Promise<ClusterReadState> {
  try {
    const view = await read(CLUSTERS_OP, { level }, clusterLevelSchema, { signal })
    const nodes = view.clusters.map(clusterToNode)
    const relationships: GraphRelationship[] = []
    for (const e of view.inter_cluster_edges) {
      const s = nodes.at(e.src_idx)
      const t = nodes.at(e.dst_idx)
      if (s && t) relationships.push({ source: s.id, target: t.id, type: 'cluster-link' })
    }
    return { status: 'ready', nodes, relationships }
  } catch (error) {
    if (signal?.aborted) throw error
    if (isOperationAbsent(error)) return { status: 'unavailable', reason: NOT_AVAILABLE }
    if (error instanceof ArboraApiError) return { status: 'refused', reason: error.code }
    throw error
  }
}

/** Expand one cluster node into its members (or finer clusters). Collapse regroups through `collapseNode`. */
export async function expandCluster(
  node: GraphNode,
  ctx: ExpandContext,
  read: typeof invoke = invoke,
): Promise<ExpandVerdict> {
  const clusterId = typeof node.properties.cluster_id === 'string' ? node.properties.cluster_id : null
  if (!clusterId) return { verdict: 'refused', code: 'NODE_NOT_FOUND', reason: REFUSAL_REASONS.NODE_NOT_FOUND }
  if (ctx.budget.status === 'unavailable') return { verdict: 'unavailable', reason: GRAPH_LIMITS_UNAVAILABLE }
  let view: z.infer<typeof clusterExpansionSchema>
  try {
    view = await read(CLUSTER_EXPAND_OP, { cluster_id: clusterId }, clusterExpansionSchema, { signal: ctx.signal })
  } catch (error) {
    if (ctx.signal?.aborted) throw error
    return verdictFromError(error)
  }
  const members: GraphNode[] = view.nodes
    .filter((n) => !ctx.visibleIds.has(n.id))
    .map((n) => {
      const props =
        typeof n.properties === 'object' && n.properties !== null ? (n.properties as Record<string, unknown>) : {}
      const type = typeof props.node_type === 'string' ? props.node_type : undefined
      return { id: n.id, labels: type ? [type] : [], properties: props }
    })
  const children = view.child_clusters.map(clusterToNode).filter((n) => !ctx.visibleIds.has(n.id))
  const added = [...members, ...children]
  if (wouldExceedNodes(ctx.budget.budget, ctx.visibleIds.size, added.length)) {
    return { verdict: 'limit', reason: VISIBLE_LIMIT_REASON }
  }
  const relationships = view.edges.map(toRelationship).filter((e): e is GraphRelationship => e !== null)
  return {
    verdict: 'expanded',
    record: {
      origin: node.id,
      addedNodeIds: added.map((n) => n.id),
      addedEdgeIds: relationships.map((e) => edgeId(e.source, e.target, e.type)),
    },
    nodes: added,
    relationships,
    hidden: {},
  }
}

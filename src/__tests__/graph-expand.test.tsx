// spec: OVERSTORY-APPS-R030.10.3
// spec: OVERSTORY-APPS-R030.10.4
// spec: OVERSTORY-APPS-R030.10.7
import { describe, expect, it, vi } from 'vitest'
import { ArboraApiError } from '@/lib/arbora-api/invoke'
import { readGraphBudget } from '@/lib/graph-budget'
import { collapseNode, expandCluster, expandNode, readClusterLevel, type ExpandContext } from '@/lib/graph-expand'

const budget = readGraphBudget({ maxVisibleNodes: 10, maxVisibleEdges: 100, labelBudget: 5, clusterThreshold: 8 })
const ctx = (visible: string[], over: Partial<ExpandContext> = {}): ExpandContext => ({
  visibleIds: new Set(visible),
  budget,
  ...over,
})
type Read = Parameters<typeof expandNode>[2]
const wire = (ids: string[]) => ({
  nodes: ids.map((id) => ({ id, properties: {} })),
  edges: [],
  hidden: [],
  next_cursor: null,
  truncated: false,
  graph_revision: 1,
})
const reader = (result: unknown): Read =>
  vi.fn(async (_op: string, _params: Record<string, unknown>, schema: { parse: (v: unknown) => unknown }) =>
    schema.parse(result),
  ) as unknown as Read

describe('graph expand', () => {
  it('test_click_reads_neighborhood_and_grows_staggered_with_badge', async () => {
    const read = reader({
      nodes: [
        { id: 'n1', properties: { name: 'One', node_type: 'Person' } },
        { id: 'n2', properties: { node_type: 'Org' } },
        { id: 'hub', properties: {} },
      ],
      edges: [
        { source: 'hub', target: 'n1', properties: { relationship: 'knows' } },
        { source: 'n2', target: 'hub', properties: { relationship: 'part_of' } },
      ],
      hidden: [
        { node_id: 'hub', count: 7 },
        { node_id: 'n1', count: 2 },
      ],
      next_cursor: null,
      truncated: false,
      graph_revision: 3,
    })
    const verdict = await expandNode('hub', ctx(['hub', 'x']), read)
    expect(read).toHaveBeenCalledWith(
      'eg.graph.GetNeighborhood',
      { node_id: 'hub', depth: 1, edge_types: [], per_node_limit: 25, total_limit: 8, exclude: ['hub', 'x'] },
      expect.anything(),
      expect.anything(),
    )
    if (verdict.verdict !== 'expanded') throw new Error(verdict.verdict)
    // Order is the engine order, already-visible nodes are excluded, and the badge counts come from the engine.
    expect(verdict.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(verdict.nodes[1].labels).toEqual(['Org'])
    expect(verdict.hidden).toEqual({ hub: 7, n1: 2 })
    expect(verdict.relationships).toEqual([
      { source: 'hub', target: 'n1', type: 'knows' },
      { source: 'n2', target: 'hub', type: 'part_of' },
    ])
    expect(verdict.record).toMatchObject({ origin: 'hub', addedNodeIds: ['n1', 'n2'] })
    expect(verdict.record.addedEdgeIds).toHaveLength(2)
  })

  it('test_collapse_keeps_nodes_with_other_edges_and_cluster_members_burst_out', async () => {
    const record = { origin: 'hub', addedNodeIds: ['a', 'b', 'c'], addedEdgeIds: [] }
    const edges = [
      { source: 'hub', target: 'a', type: 'r' },
      { source: 'hub', target: 'b', type: 'r' },
      { source: 'hub', target: 'c', type: 'r' },
      { source: 'other', target: 'b', type: 'r' },
      { source: 'a', target: 'b', type: 'r' },
    ]
    const result = collapseNode(record, edges)
    expect(result.removeNodeIds).toEqual(['a', 'c'])
    expect(result.removeEdgeIds).toContain('hub|r|a')
    expect(result.removeEdgeIds).not.toContain('other|r|b')

    const clusters = await readClusterLevel(
      1,
      undefined,
      reader({
        level: 1,
        clusters: [
          { id: 'L1-0', label: 'Alpha', node_count: 40 },
          { id: 'L1-1', label: 'Beta', node_count: 30 },
        ],
        inter_cluster_edges: [{ src_idx: 0, dst_idx: 1, weight: 2 }],
      }) as never,
    )
    if (clusters.status !== 'ready') throw new Error(clusters.status)
    expect(clusters.nodes.map((n) => n.id)).toEqual(['cluster:L1-0', 'cluster:L1-1'])
    expect(clusters.relationships).toEqual([{ source: 'cluster:L1-0', target: 'cluster:L1-1', type: 'cluster-link' }])

    const burst = await expandCluster(
      clusters.nodes[0],
      ctx(['cluster:L1-0']),
      reader({
        nodes: [
          { id: 'm1', properties: { node_type: 'Person' } },
          { id: 'm2', properties: null },
        ],
        edges: [{ src_id: 'm1', dst_id: 'm2', type: 'x' }],
        child_clusters: [],
      }),
    )
    if (burst.verdict !== 'expanded') throw new Error(burst.verdict)
    expect(burst.record.origin).toBe('cluster:L1-0')
    expect(burst.nodes.map((n) => n.id)).toEqual(['m1', 'm2'])
    // Collapse regroups the members into the cluster node.
    expect(collapseNode(burst.record, burst.relationships).removeNodeIds).toEqual(['m1', 'm2'])
  })

  it('test_refusals_leave_the_graph_unchanged_and_show_the_reason', async () => {
    const throwing = (error: unknown): Read => vi.fn(() => Promise.reject(error as Error)) as unknown as Read
    const limit = await expandNode(
      'hub',
      ctx(Array.from({ length: 9 }, (_, i) => `v${String(i)}`)),
      reader(wire(['p', 'q'])),
    )
    expect(limit).toEqual({ verdict: 'limit', reason: 'Visible limit reached' })
    const refused = await expandNode(
      'hub',
      ctx(['hub']),
      throwing(new ArboraApiError('NODE_NOT_FOUND', 404, false, {})),
    )
    expect(refused).toEqual({ verdict: 'refused', code: 'NODE_NOT_FOUND', reason: 'Node not found' })
    const deep = await expandNode(
      'hub',
      ctx(['hub']),
      throwing(new ArboraApiError('NEIGHBORHOOD_DEPTH_EXCEEDED', 400, false, {})),
    )
    expect(deep).toMatchObject({ verdict: 'refused', reason: 'Depth limit exceeded' })
    const absent = await expandNode(
      'hub',
      ctx(['hub']),
      throwing(new ArboraApiError('HTTP_UNAVAILABLE', 404, false, {})),
    )
    expect(absent).toEqual({ verdict: 'unavailable', reason: 'not available' })
    const noLimits = await expandNode(
      'hub',
      { visibleIds: new Set(['hub']), budget: readGraphBudget({}) },
      reader(wire([])),
    )
    expect(noLimits).toEqual({ verdict: 'unavailable', reason: 'Graph limits unavailable' })

    // A stale cursor triggers exactly one fresh read.
    const stale = vi
      .fn()
      .mockRejectedValueOnce(new ArboraApiError('NEIGHBORHOOD_CURSOR_STALE', 409, false, {}))
      .mockResolvedValueOnce(wire(['z']))
    const retried = await expandNode('hub', ctx(['hub']), stale as unknown as Read)
    expect(stale).toHaveBeenCalledTimes(2)
    expect(retried.verdict).toBe('expanded')
    const twice = vi.fn().mockRejectedValue(new ArboraApiError('NEIGHBORHOOD_CURSOR_STALE', 409, false, {}))
    expect(await expandNode('hub', ctx(['hub']), twice as unknown as Read)).toMatchObject({
      verdict: 'refused',
      code: 'NEIGHBORHOOD_CURSOR_STALE',
    })
    expect(twice).toHaveBeenCalledTimes(2)
  })
})

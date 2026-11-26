// spec: OVERSTORY-APPS-R030.13.2
// spec: OVERSTORY-APPS-R030.13.3
// spec: OVERSTORY-APPS-R030.13.4
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GraphCanvas } from '../GraphCanvas'
import type { GraphNode, GraphRelationship } from '../GraphAdapter'
import { fakeArbora, fakeWorker } from './graph-scene-fixture'
import type { LayoutRequest } from '../layout-core'

interface Probe {
  ids: () => string[]
  labelled: () => string[]
  setting: (name: string) => unknown
  running: () => boolean
}
const probe = () => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
const noop = () => undefined

const ring = (n: number): GraphNode[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `n${String(i)}`,
    labels: ['Thing'],
    properties: { name: `Node ${String(i)}` },
  }))

beforeEach(() => {
  ;(window as unknown as { __OVERSTORY_GRAPH_PROBE__: boolean }).__OVERSTORY_GRAPH_PROBE__ = true
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GraphCanvas at scale', () => {
  it('test_layout_runs_in_the_worker_and_labels_and_edges_thin_out', async () => {
    const requests: LayoutRequest[] = []
    const nodes = ring(40)
    // 5,100 edges among the nodes: parallel edges of 130 types between each ordered pair at most once.
    const rels: GraphRelationship[] = []
    for (let t = 0; rels.length < 5100; t++) {
      for (let i = 0; i < 40 && rels.length < 5100; i++)
        rels.push({ source: `n${String(i)}`, target: `n${String((i + 1 + (t % 39)) % 40)}`, type: `t${String(t)}` })
    }
    render(
      <GraphCanvas
        readOnly
        nodes={nodes}
        relationships={rels}
        onSelectNode={noop}
        layoutFactory={() => fakeWorker((r) => requests.push(r))}
        limits={{ maxVisibleNodes: 5000, maxVisibleEdges: 20000, labelBudget: 7, clusterThreshold: 2000 }}
      />,
    )
    await waitFor(() => {
      expect(requests.length).toBeGreaterThan(0)
      expect(probe().ids()).toHaveLength(40)
    })
    // The layout request went to the worker, with every node and edge, and the main thread imports no layout.
    expect(requests[0].nodes).toHaveLength(40)
    for (const file of ['GraphCanvas.tsx', 'useGraphScene.ts', 'graph-sync.ts', 'useGraphMotion.ts']) {
      expect(readFileSync(`src/components/knowledge-graph/${file}`, 'utf8')).not.toMatch(/forceatlas2/i)
    }
    await waitFor(() => {
      expect(probe().labelled().length).toBeLessThanOrEqual(7)
      expect(probe().labelled().length).toBeGreaterThan(0)
    })
    expect(probe().setting('hideEdgesOnMove')).toBe(true)
    expect(probe().setting('renderEdgeLabels')).toBe(false)
  })

  it('test_large_graph_opens_clustered_and_preview_stays_selectable', async () => {
    const arbora = fakeArbora({
      'eg.compute.ClusterHierarchyClusters': () => ({
        result: {
          level: 1,
          clusters: [
            { id: 'L1-0', label: 'Alpha', node_count: 30000 },
            { id: 'L1-1', label: 'Beta', node_count: 20000 },
          ],
          inter_cluster_edges: [{ src_idx: 0, dst_idx: 1, weight: 4 }],
        },
      }),
    })
    vi.stubGlobal('fetch', arbora.fn)
    render(
      <GraphCanvas
        readOnly
        nodes={ring(3)}
        relationships={[]}
        totalNodes={50000}
        onSelectNode={noop}
        layoutFactory={() => fakeWorker()}
      />,
    )
    await waitFor(() => {
      expect(probe().ids().sort()).toEqual(['cluster:L1-0', 'cluster:L1-1'])
    })
    expect(screen.getByTestId('graph-render-mode-badge')).toHaveTextContent('Clustered start')
    expect(arbora.calls[0]).toMatchObject({ op: 'eg.compute.ClusterHierarchyClusters', params: { level: 1 } })
    // The node-only preview is a toolbar switch away.
    fireEvent.click(screen.getByTestId('graph-render-mode-toggle'))
    expect(screen.getByTestId('graph-render-mode-badge')).toHaveTextContent('At-scale (engine)')
    expect(screen.getByTestId('graph-engine-preview-run')).toBeInTheDocument()
  })

  it('test_cluster_refusal_falls_back_with_reason', async () => {
    vi.stubGlobal(
      'fetch',
      fakeArbora({ 'eg.compute.ClusterHierarchyClusters': () => ({ status: 403, error: { code: 'FORBIDDEN' } }) }).fn,
    )
    const view = render(
      <GraphCanvas
        readOnly
        nodes={ring(3)}
        relationships={[]}
        totalNodes={50000}
        onSelectNode={noop}
        layoutFactory={() => fakeWorker()}
      />,
    )
    expect(await screen.findByTestId('graph-cluster-fallback')).toHaveTextContent('FORBIDDEN')
    expect(screen.getByTestId('graph-engine-preview-run')).toBeInTheDocument()
    view.unmount()

    vi.stubGlobal('fetch', fakeArbora({}).fn)
    render(
      <GraphCanvas
        readOnly
        nodes={ring(3)}
        relationships={[]}
        totalNodes={50000}
        onSelectNode={noop}
        layoutFactory={() => fakeWorker()}
      />,
    )
    expect(await screen.findByTestId('graph-cluster-fallback')).toHaveTextContent('not available')
  })
})

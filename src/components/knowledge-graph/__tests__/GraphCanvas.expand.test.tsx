// spec: OVERSTORY-APPS-R030.10.3
// spec: OVERSTORY-APPS-R030.10.4
// spec: OVERSTORY-APPS-R030.10.7
// spec: OVERSTORY-APPS-R030.11.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GraphCanvas } from '../GraphCanvas'
import type { GraphNode } from '../GraphAdapter'
import { fakeArbora, fakeWorker } from './graph-scene-fixture'

interface Probe {
  ids: () => string[]
  positions: () => Record<string, { x: number; y: number; size: number; alpha: number }>
  running: () => boolean
}
const probe = () => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe

const base: GraphNode[] = [
  { id: 'hub', labels: ['Person'], properties: { name: 'Hub' } },
  { id: 'a', labels: ['Person'], properties: { name: 'Alpha' } },
]
const noop = () => undefined

function mount() {
  return render(
    <GraphCanvas
      readOnly
      nodes={base}
      relationships={[{ source: 'hub', target: 'a', type: 'knows' }]}
      onSelectNode={noop}
      layoutFactory={() => fakeWorker()}
      limits={{ maxVisibleNodes: 5, maxVisibleEdges: 50, labelBudget: 5, clusterThreshold: 100 }}
    />,
  )
}

async function selectHub() {
  fireEvent.click(screen.getByText(/as a table/))
  fireEvent.click(await screen.findByRole('button', { name: 'Select Hub' }))
}

describe('GraphCanvas expand and collapse', () => {
  beforeEach(() => {
    ;(window as unknown as { __OVERSTORY_GRAPH_PROBE__: boolean }).__OVERSTORY_GRAPH_PROBE__ = true
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('test_click_reads_neighborhood_and_grows_staggered_with_badge', async () => {
    const arbora = fakeArbora({
      'eg.graph.GetNeighborhood': () => ({
        result: {
          nodes: [
            { id: 'n1', labels: ['Org'], properties: { name: 'One' } },
            { id: 'n2', labels: ['Org'], properties: { name: 'Two' } },
          ],
          edges: [
            { source: 'hub', target: 'n1', type: 'owns' },
            { source: 'hub', target: 'n2', type: 'owns' },
          ],
          hidden: { hub: 4 },
        },
      }),
    })
    vi.stubGlobal('fetch', arbora.fn)
    mount()
    await waitFor(() => {
      expect(probe().ids().sort()).toEqual(['a', 'hub'])
    })
    // Selecting a node whose neighbors are not all shown grows it; the Expand button does the same.
    await selectHub()
    await waitFor(() => {
      expect(probe().ids().sort()).toEqual(['a', 'hub', 'n1', 'n2'])
    })
    expect(arbora.calls.find((c) => c.op === 'eg.graph.GetNeighborhood')?.params).toMatchObject({
      node_id: 'hub',
      depth: 1,
      per_node_limit: 25,
      exclude: expect.arrayContaining(['hub', 'a']) as string[],
    })
    expect(screen.getByTestId('graph-live-region')).toHaveTextContent('Expanded Hub: 2 added, 4 hidden')
    fireEvent.click(screen.getByTestId('graph-expand'))
    await waitFor(() => {
      expect(arbora.calls.filter((c) => c.op === 'eg.graph.GetNeighborhood')).toHaveLength(2)
    })
    // Growth ends at full size and alpha.
    await waitFor(() => {
      expect(probe().running()).toBe(false)
    })
    expect(probe().positions().n1.alpha).toBe(1)
    expect(probe().positions().n1.size).toBeGreaterThan(5)

    // Collapse takes the added nodes back and the visible set returns to the prior set.
    fireEvent.click(screen.getByTestId('graph-collapse'))
    await waitFor(() => {
      expect(probe().ids().sort()).toEqual(['a', 'hub'])
    })
    expect(screen.getByTestId('graph-live-region')).toHaveTextContent('Collapsed Hub: 2 removed')
  })

  it('test_refusals_leave_the_graph_unchanged_and_show_the_reason', async () => {
    vi.stubGlobal(
      'fetch',
      fakeArbora({ 'eg.graph.GetNeighborhood': () => ({ status: 404, error: { code: 'NODE_NOT_FOUND' } }) }).fn,
    )
    mount()
    await waitFor(() => {
      expect(probe().ids()).toHaveLength(2)
    })
    await selectHub()
    fireEvent.click(await screen.findByTestId('graph-expand'))
    expect(await screen.findByTestId('graph-expand-notice')).toHaveTextContent('Node not found')
    expect(probe().ids().sort()).toEqual(['a', 'hub'])
  })

  it('refuses past the visible limit with its reason and shows not available when the operation is absent', async () => {
    const nodes = Array.from({ length: 4 }, (_, i) => ({ id: `m${String(i)}`, labels: ['Org'], properties: {} }))
    vi.stubGlobal('fetch', fakeArbora({ 'eg.graph.GetNeighborhood': () => ({ result: { nodes, edges: [] } }) }).fn)
    const view = mount()
    await selectHub()
    fireEvent.click(await screen.findByTestId('graph-expand'))
    expect(await screen.findByTestId('graph-expand-notice')).toHaveTextContent('Visible limit reached')
    expect(probe().ids()).toHaveLength(2)
    view.unmount()

    vi.stubGlobal('fetch', fakeArbora({}).fn)
    mount()
    await selectHub()
    fireEvent.click(await screen.findByTestId('graph-expand'))
    expect(await screen.findByTestId('graph-expand-notice')).toHaveTextContent('Expand not available')
    await act(() => Promise.resolve())
  })

  it('test_toggle_a_class_fades_its_nodes_out', async () => {
    vi.stubGlobal('fetch', fakeArbora({}).fn)
    render(
      <GraphCanvas
        readOnly
        nodes={[...base, { id: 'org1', labels: ['Org'], properties: { name: 'Org' } }]}
        relationships={[{ source: 'hub', target: 'org1', type: 'in' }]}
        onSelectNode={noop}
        layoutFactory={() => fakeWorker()}
      />,
    )
    await waitFor(() => {
      expect(probe().ids()).toHaveLength(3)
    })
    await waitFor(() => {
      expect(probe().running()).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: /^Org, 1 node, shown/ }))
    await waitFor(() => {
      expect(probe().positions().org1.alpha).toBeLessThan(0.05)
    })
    expect(probe().positions().hub.alpha).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /^Org, 1 node, hidden/ }))
    await waitFor(() => {
      expect(probe().positions().org1.alpha).toBe(1)
    })
  })
})

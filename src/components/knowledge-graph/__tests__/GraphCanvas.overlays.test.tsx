// spec: OVERSTORY-APPS-R030.12.2
// spec: OVERSTORY-APPS-R030.12.3
// spec: OVERSTORY-APPS-R030.12.4
// spec: OVERSTORY-APPS-R030.12.5
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GraphCanvas } from '../GraphCanvas'
import type { GraphNode } from '../GraphAdapter'
import { fakeArbora, fakeWorker, neighborhood } from './graph-scene-fixture'

interface Probe {
  ids: () => string[]
  overlay: () => {
    colors: Record<string, string> | null
    rings: Record<string, string> | null
    pathProgress: number[] | null
  }
  select: (id: string) => void
}
const probe = () => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
const noop = () => undefined
const nodes: GraphNode[] = ['a', 'b', 'c'].map((id) => ({
  id,
  labels: ['Thing'],
  properties: { name: id.toUpperCase() },
}))
const rels = [
  { source: 'a', target: 'b', type: 'r' },
  { source: 'b', target: 'c', type: 'r' },
]

const mount = () =>
  render(
    <GraphCanvas readOnly nodes={nodes} relationships={rels} onSelectNode={noop} layoutFactory={() => fakeWorker()} />,
  )

beforeEach(() => {
  ;(window as unknown as { __OVERSTORY_GRAPH_PROBE__: boolean }).__OVERSTORY_GRAPH_PROBE__ = true
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GraphCanvas overlays', () => {
  it('draws the engine community answer and marks it stale when the visible set changes', async () => {
    const arbora = fakeArbora({
      'eg.compute.CommunityDetection': () => ({ result: { communities: { a: 0, b: 0, c: 1 } } }),
      'eg.graph.GetNeighborhood': () => ({
        result: neighborhood([{ id: 'd', node_type: 'Thing' }], [{ source: 'c', target: 'd', relationship: 'r' }]),
      }),
    })
    vi.stubGlobal('fetch', arbora.fn)
    mount()
    await waitFor(() => {
      expect(probe().ids()).toHaveLength(3)
    })
    fireEvent.click(screen.getByTestId('graph-overlay-community'))
    await waitFor(() => {
      expect(screen.getByTestId('graph-overlay-community')).toHaveAttribute('aria-pressed', 'true')
    })
    const colors = probe().overlay().colors
    expect(colors?.a).toBe(colors?.b)
    expect(colors?.a).not.toBe(colors?.c)
    expect(screen.queryByTestId('graph-overlay-community-stale')).not.toBeInTheDocument()
    // The visible set changes: the answer was computed for an older revision.
    probe().select('c')
    await waitFor(() => {
      expect(probe().ids()).toContain('d')
    })
    expect(await screen.findByTestId('graph-overlay-community-stale')).toHaveTextContent('Stale')
  })

  it('reveals a path edge by edge and shows No path', async () => {
    let path: string[] = ['a', 'b', 'c']
    vi.stubGlobal('fetch', fakeArbora({ 'eg.compute.GetShortestPath': () => ({ result: { path } }) }).fn)
    mount()
    await waitFor(() => {
      expect(probe().ids()).toHaveLength(3)
    })
    expect(screen.getByTestId('graph-overlay-path')).toBeDisabled()
    probe().select('a')
    await screen.findByTestId('graph-node-actions')
    // Shift+click on a second node is a sigma event; the table offers no second selection, so use the probe seam.
    ;(probe() as unknown as { pathEnd: (id: string) => void }).pathEnd('c')
    await waitFor(() => {
      expect(screen.getByTestId('graph-overlay-path')).toBeEnabled()
    })
    fireEvent.click(screen.getByTestId('graph-overlay-path'))
    await waitFor(() => {
      expect(probe().overlay().pathProgress).toHaveLength(2)
    })
    await waitFor(() => {
      expect(probe().overlay().pathProgress).toEqual([1, 1])
    })
    // Clear, then ask for a pair with no path.
    fireEvent.click(screen.getByTestId('graph-overlay-path'))
    path = []
    fireEvent.click(screen.getByTestId('graph-overlay-path'))
    expect(await screen.findByTestId('graph-path-message')).toHaveTextContent('No path')
  })

  it('shows the refusal reason and keeps the prior look', async () => {
    vi.stubGlobal(
      'fetch',
      fakeArbora({ 'eg.compute.PageRank': () => ({ status: 403, error: { code: 'FORBIDDEN' } }) }).fn,
    )
    mount()
    await waitFor(() => {
      expect(probe().ids()).toHaveLength(3)
    })
    fireEvent.click(screen.getByTestId('graph-overlay-centrality'))
    expect(await screen.findByTestId('graph-overlay-centrality-reason')).toHaveTextContent('Refused: FORBIDDEN')
    expect(probe().overlay().colors).toBeNull()
    vi.stubGlobal('fetch', fakeArbora({}).fn)
    fireEvent.click(screen.getByTestId('graph-overlay-shape'))
    expect(await screen.findByTestId('graph-overlay-shape-reason')).toHaveTextContent('Not available')
  })
})

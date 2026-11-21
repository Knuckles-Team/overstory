import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Panel } from '@/lib/dashboards/model'
import type { QueryOutcome } from '@/lib/dashboards/query'

vi.mock('@/components/knowledge-graph/GraphCanvas', () => ({
  GraphCanvas: ({ nodes, relationships }: { nodes: unknown[]; relationships: unknown[] }) => (
    <div data-testid="graph-canvas">{`${String(nodes.length)} nodes ${String(relationships.length)} edges`}</div>
  ),
}))

import { PanelBody } from '../PanelBody'

function panel(viz: Panel['viz']): Panel {
  return {
    id: 'p',
    title: 'Panel',
    viz,
    query: { kind: 'uql', text: 'MATCH (:A) |> LIMIT 5' },
    layout: { x: 0, y: 0, w: 6, h: 4 },
    options: {},
  }
}

function ok(columns: string[], rows: Record<string, string | number | null>[]): QueryOutcome {
  return { state: 'ok', data: { columns, rows } }
}

// spec: OVERSTORY-DASH-R003
describe('PanelKinds', () => {
  it('draws a pie with a legend that states each share in text', () => {
    render(
      <PanelBody
        panel={panel('pie')}
        loading={false}
        outcome={ok(
          ['name', 'total'],
          [
            { name: 'a', total: 3 },
            { name: 'b', total: 1 },
          ],
        )}
      />,
    )
    expect(screen.getByRole('img', { name: /Pie chart of total by name/ })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Pie legend' })
    expect(within(legend).getByText(/a: 3 \(75%\)/)).toBeInTheDocument()
    expect(within(legend).getByText(/b: 1 \(25%\)/)).toBeInTheDocument()
  })

  it('plots latitude and longitude, skipping rows with a bad coordinate', () => {
    render(
      <PanelBody
        panel={panel('map')}
        loading={false}
        outcome={ok(
          ['name', 'lat', 'lon'],
          [
            { name: 'x', lat: 10, lon: 20 },
            { name: 'y', lat: 120, lon: 20 },
          ],
        )}
      />,
    )
    expect(screen.getByRole('img', { name: /1 point by lat and lon/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 row skipped')
  })

  it('refuses a map without coordinate columns', () => {
    render(<PanelBody panel={panel('map')} loading={false} outcome={ok(['name'], [{ name: 'x' }])} />)
    expect(screen.getByRole('alert')).toHaveTextContent('needs a latitude column and a longitude column')
  })

  it('hands source and target rows to the graph canvas', async () => {
    render(
      <PanelBody
        panel={panel('graph')}
        loading={false}
        outcome={ok(
          ['source', 'target'],
          [
            { source: 'a', target: 'b' },
            { source: 'b', target: 'c' },
          ],
        )}
      />,
    )
    expect(await screen.findByTestId('graph-canvas')).toHaveTextContent('3 nodes 2 edges')
  })

  it('refuses a graph without source and target columns', () => {
    render(<PanelBody panel={panel('graph')} loading={false} outcome={ok(['a'], [{ a: 'x' }])} />)
    expect(screen.getByRole('alert')).toHaveTextContent('needs a source column and a target column')
  })
})

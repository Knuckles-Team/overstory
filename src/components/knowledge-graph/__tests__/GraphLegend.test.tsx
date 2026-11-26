// spec: OVERSTORY-APPS-R030.11.3
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GraphLegend } from '@/components/knowledge-graph/GraphLegend'
import { colorOf, styleForTypeString } from '@/lib/graph-semantics'
import type { GraphNode } from '@/components/knowledge-graph/GraphAdapter'

function node(id: string, nodeType: string): GraphNode {
  return { id, labels: [nodeType], properties: { node_type: nodeType } }
}

describe('GraphLegend', () => {
  it('renders nothing for an empty node set', () => {
    const { container } = render(<GraphLegend nodes={[]} isDark />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one entry per distinct type present, most frequent first', () => {
    const nodes: GraphNode[] = [
      node('a', 'WorkItem'),
      node('b', 'WorkItem'),
      node('c', 'WorkItem'),
      node('d', 'Concept'),
      node('e', 'Concept'),
      node('f', 'MCPServer'),
    ]
    render(<GraphLegend nodes={nodes} isDark />)

    const legend = screen.getByTestId('graph-legend')
    const items = Array.from(legend.querySelectorAll('li')).map((li) => li.textContent ?? '')
    // WorkItem (3) should be listed before Concept (2) before MCPServer (1).
    expect(items[0]).toContain('WorkItem')
    expect(items[0]).toContain('3')
    expect(items[1]).toContain('Concept')
    expect(items[2]).toContain('MCPServer')
  })

  // TEST REQUIREMENT: "the legend renders for the types present and collapses
  // the long tail" — with the production reality of ~46 distinct node_type
  // values, a legend must never grow to 46 rows.
  it('collapses the long tail into a single "Other" bucket beyond maxEntries', () => {
    const nodes: GraphNode[] = []
    // 10 distinct types, one node each — with maxEntries=4, 4 are named and
    // 6 collapse into "Other".
    for (let i = 0; i < 10; i++) {
      nodes.push(node(`n${String(i)}`, `Type${String(i)}`))
    }
    render(<GraphLegend nodes={nodes} isDark maxEntries={4} />)

    const legend = screen.getByTestId('graph-legend')
    const namedRows = legend.querySelectorAll('li:not([data-testid="graph-legend-other"])')
    expect(namedRows.length).toBe(4)

    const other = screen.getByTestId('graph-legend-other')
    expect(other.textContent).toContain('Other (6)')
    // The 6 collapsed nodes are still accounted for in the count column.
    expect(other.textContent).toMatch(/6$/)
  })

  it('does not render an "Other" row when every type fits under maxEntries', () => {
    const nodes: GraphNode[] = [node('a', 'WorkItem'), node('b', 'Concept')]
    render(<GraphLegend nodes={nodes} isDark maxEntries={8} />)
    expect(screen.queryByTestId('graph-legend-other')).not.toBeInTheDocument()
  })

  it('swatch colors match the SAME style function the canvas uses (never drifts)', () => {
    const nodes: GraphNode[] = [node('a', 'WorkItem')]
    render(<GraphLegend nodes={nodes} isDark />)
    const swatch = screen.getByTestId('graph-legend-swatch')
    const expected = colorOf(styleForTypeString('WorkItem'), { isDark: true })
    // jsdom normalizes inline hex colors to rgb() in style serialization.
    const probe = document.createElement('span')
    probe.style.color = expected
    expect(swatch.getAttribute('style')).toContain(probe.style.color)
    expect(swatch.querySelector('svg path')).not.toBeNull()
  })

  it('test_toggle_isolate_and_accessible_names', () => {
    const nodes: GraphNode[] = [node('a', 'WorkItem'), node('b', 'WorkItem'), node('c', 'Concept')]
    const onToggle = vi.fn()
    const onIsolate = vi.fn()
    render(
      <GraphLegend
        nodes={nodes}
        isDark
        onToggle={onToggle}
        onIsolate={onIsolate}
        hiddenClasses={new Set(['Concept'])}
      />,
    )
    const work = screen.getByRole('button', { name: 'WorkItem, 2 nodes, shown' })
    const concept = screen.getByRole('button', { name: 'Concept, 1 node, hidden' })
    expect(concept).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(work)
    expect(onToggle).toHaveBeenCalledWith('WorkItem')
    fireEvent.click(work, { altKey: true })
    expect(onIsolate).toHaveBeenCalledWith('WorkItem')
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('resolves node_type from properties.node_type, not just labels (falls back sanely)', () => {
    const nodes: GraphNode[] = [
      { id: 'x', labels: [], properties: { node_type: 'RuntimeSignal' } },
      { id: 'y', labels: ['LegacyLabelOnly'], properties: {} },
      { id: 'z', labels: [], properties: {} },
    ]
    render(<GraphLegend nodes={nodes} isDark maxEntries={10} />)
    const legend = screen.getByTestId('graph-legend')
    expect(legend.textContent).toContain('RuntimeSignal')
    expect(legend.textContent).toContain('LegacyLabelOnly')
    expect(legend.textContent).toContain('Unknown')
  })
})

import { useMemo, useState } from 'react'
import type { GraphNode } from './GraphAdapter'
import { resolveNodeType } from './GraphAdapter'
import type { ViewGraph } from './graph-sync'
import type { ShapeVerdict } from '@/lib/graph-overlays'
import { RING_STYLES } from '@/lib/graph-overlays'

interface GraphNodeTableProps {
  nodes: readonly GraphNode[]
  graph: ViewGraph
  /** Bumped when the graph model changes, so the table re-reads degree and neighbors. */
  revision: number
  selectedId: string | null
  rings: ReadonlyMap<string, ShapeVerdict> | null
  limit?: number
  onSelect: (id: string) => void
  onExpand: (id: string) => void
  onCollapse: (id: string) => void
  canCollapse: (id: string) => boolean
}

const label = (n: GraphNode): string => (typeof n.properties.name === 'string' ? n.properties.name : n.id)

/**
 * Accessible table of the nodes in view (OVERSTORY-APPS-R030.11.5): class, degree and neighbors for each,
 * with the keyboard path for select, expand and collapse. Color is never the only channel.
 */
export function GraphNodeTable({
  nodes,
  graph,
  revision,
  selectedId,
  rings,
  limit = 100,
  onSelect,
  onExpand,
  onCollapse,
  canCollapse,
}: GraphNodeTableProps) {
  const [open, setOpen] = useState(false)
  // Rows exist only while the table is open, so a large graph does not put thousands of cells in the page.
  const rows = useMemo(() => {
    if (!open) return []
    const withDegree = nodes
      .filter((n) => graph.hasNode(n.id))
      .map((n) => ({ node: n, degree: graph.degree(n.id), revision }))
      .sort((a, b) => b.degree - a.degree)
    const top = withDegree.slice(0, limit)
    const selected = selectedId ? withDegree.find((r) => r.node.id === selectedId) : undefined
    if (selected && !top.includes(selected)) top.push(selected)
    return top.map(({ node, degree }) => ({ node, degree, neighbors: graph.neighbors(node.id).slice(0, 5) }))
  }, [nodes, graph, revision, selectedId, limit, open])

  if (nodes.length === 0) return null
  return (
    <details
      data-testid="graph-node-table"
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
      }}
      className="absolute bottom-4 right-4 z-10 max-w-[22rem] rounded-lg border border-border bg-card/90 text-xs shadow-lg backdrop-blur-sm"
    >
      <summary className="cursor-pointer px-2 py-1 font-semibold text-foreground">
        Nodes in view ({nodes.length}) as a table
      </summary>
      {open ? (
        <div className="max-h-56 overflow-auto px-2 pb-2">
          <table className="w-full text-left">
            <caption className="sr-only">Nodes in view with class, degree and neighbors</caption>
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col">Class</th>
                <th scope="col">Degree</th>
                <th scope="col">Neighbors</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, degree, neighbors }) => (
                <tr key={node.id} aria-selected={node.id === selectedId}>
                  <th scope="row" className="font-normal">
                    {label(node)}
                    {rings?.has(node.id) ? ` (${RING_STYLES[rings.get(node.id)!].text})` : ''}
                  </th>
                  <td>{resolveNodeType(node)}</td>
                  <td className="tabular-nums">{degree}</td>
                  <td className="truncate">{neighbors.join(', ')}</td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(node.id)
                      }}
                      className="rounded px-1 hover:bg-accent"
                      aria-label={`Select ${label(node)}`}
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onExpand(node.id)
                      }}
                      className="rounded px-1 hover:bg-accent"
                      aria-label={`Expand ${label(node)}`}
                    >
                      Expand
                    </button>
                    {canCollapse(node.id) ? (
                      <button
                        type="button"
                        onClick={() => {
                          onCollapse(node.id)
                        }}
                        className="rounded px-1 hover:bg-accent"
                        aria-label={`Collapse ${label(node)}`}
                      >
                        Collapse
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  )
}

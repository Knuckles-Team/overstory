/**
 * @file GraphPanel.tsx
 * @description The graph panel (OVERSTORY-DASH-R003): rows with source and target columns
 * become nodes and edges drawn by the shared knowledge-graph canvas (read only). The
 * canvas is loaded on demand, and an edge table is always present as the text
 * alternative.
 */
import { lazy, Suspense, useMemo } from 'react'
import type { GraphNode, GraphRelationship } from '@/components/knowledge-graph/GraphAdapter'
import type { RowSet } from '@/lib/dashboards/query'
import { DataTable } from './DataTable'

const GraphCanvas = lazy(() =>
  import('@/components/knowledge-graph/GraphCanvas').then((module) => ({ default: module.GraphCanvas })),
)

const MAX_EDGES = 500

export function graphFromRows(data: RowSet): { nodes: GraphNode[]; relationships: GraphRelationship[] } | null {
  const column = (name: string) => data.columns.find((c) => c.toLowerCase() === name) ?? null
  const source = column('source')
  const target = column('target')
  if (!source || !target) return null
  const type = column('type') ?? column('label')
  const ids = new Set<string>()
  const relationships: GraphRelationship[] = []
  for (const row of data.rows.slice(0, MAX_EDGES)) {
    const from = row[source]
    const to = row[target]
    if (from === null || to === null) continue
    const a = String(from)
    const b = String(to)
    ids.add(a)
    ids.add(b)
    relationships.push({ source: a, target: b, type: type ? String(row[type] ?? 'related') : 'related' })
  }
  const nodes = [...ids].map((id) => ({ id, labels: ['Node'], properties: { name: id } }))
  return { nodes, relationships }
}

export function GraphPanel({ title, data }: { title: string; data: RowSet }) {
  const graph = useMemo(() => graphFromRows(data), [data])
  if (!graph) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        A graph needs a source column and a target column; this result has {data.columns.join(', ') || 'none'}.
      </p>
    )
  }
  return (
    <figure className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {title}: {String(graph.nodes.length)} nodes, {String(graph.relationships.length)} edges.
      </p>
      <div className="h-64 w-full">
        <Suspense fallback={<p role="status">Loading graph…</p>}>
          <GraphCanvas
            nodes={graph.nodes}
            relationships={graph.relationships}
            readOnly
            onSelectNode={() => undefined}
          />
        </Suspense>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Edge table</summary>
        <DataTable data={data} caption={`${title} edges`} />
      </details>
    </figure>
  )
}

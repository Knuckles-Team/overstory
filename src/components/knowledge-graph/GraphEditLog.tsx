import type { GraphEditLogEntry, GraphEditRequest } from '@/lib/graph-edit'

function describeRequest(request: GraphEditRequest): string {
  if (request.kind === 'add') return `add ${request.labels.join(', ') || 'node'}`
  return `${request.kind} ${request.id}`
}

/** The visible edit log: each request with the engine verdict and reason. */
export function GraphEditLog({ entries, limit }: { entries: readonly GraphEditLogEntry[]; limit: number }) {
  if (entries.length === 0)
    return (
      <p className="text-xs text-muted-foreground" data-testid="graph-edit-log-empty">
        No edits yet. Edits are sent to Arbora and the verdict shows here.
      </p>
    )
  return (
    <ol aria-label="Graph edit log" className="space-y-1 text-xs" data-testid="graph-edit-log">
      {entries.slice(0, limit).map((entry) => (
        <li key={entry.sequence} className="flex flex-wrap gap-2" data-verdict={entry.result.verdict}>
          <span className="font-mono">{describeRequest(entry.request)}</span>
          <strong>{entry.result.verdict}</strong>
          {entry.result.reason && <span className="text-muted-foreground">{entry.result.reason}</span>}
        </li>
      ))}
    </ol>
  )
}

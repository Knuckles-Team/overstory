import { useQuery } from '@tanstack/react-query'
import { ServedState } from '@/components/served/ServedState'
import { judgeSessionUsage, readSessionUsage } from '@/lib/usage-served'

/** The engine's own count of one session, beside the existing session detail. Incomplete counts say so. */
export function ServedSessionUsage({ contextId }: { contextId: string }) {
  const read = useQuery({
    queryKey: ['usage-served', contextId],
    queryFn: ({ signal }) => readSessionUsage(contextId, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (read.isPending) return <p role="status">Awaiting engine usage…</p>
  if (read.isError) return <p role="alert">Engine usage could not be read.</p>
  const reply = read.data
  if (reply.kind !== 'ready') return <ServedState reply={reply} what="Engine session usage" />
  const verdict = judgeSessionUsage(reply.result)
  return (
    <section aria-label="Engine session usage" className="min-w-0 rounded border p-2">
      <h4 className="font-medium">Engine session usage</h4>
      {verdict.accounting === 'incomplete' && (
        <p role="status">
          Incomplete accounting: {verdict.missingRuns} run{verdict.missingRuns === 1 ? '' : 's'} not recorded. The
          counts below are partial.
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Counts by owner-defined category. Categories overlap and are not added.</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Count</th>
            <th scope="col">Runs reporting</th>
          </tr>
        </thead>
        <tbody>
          {verdict.rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td>{row.count}</td>
              <td>
                {row.coveredRuns}
                {row.partial ? ' (partial)' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {verdict.timing === 'refused' && <p role="status">Turn timings are invalid and are not shown.</p>}
      {verdict.timing === 'absent' && <p role="status">Turn timings were not measured.</p>}
      <p className="text-xs text-muted-foreground">Project and agent attribution are not part of this read.</p>
    </section>
  )
}

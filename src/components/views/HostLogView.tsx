/**
 * @file HostLogView.tsx
 * @description Host-log view (OVERSTORY-APPS-R054): one host's log stream read through
 * arbora, with each record's original host metadata.
 *
 * The view uses the signed-in browser session and never takes a typed credential. On a retention gap, a `gap: true` batch or a denied
 * grant the view drops every record, cursor and reference it holds, so rotated-out or
 * revoked text can never stay on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { BlockedState } from '@/components/renderers/BlockedState'
import { Button } from '@/components/ui/button'
import {
  HostLogRefusal,
  readHostLogs,
  referenceHostLogs,
  type HostLogBatch,
  type HostLogRecord,
} from '@/lib/host-logs'

const MAX_HELD_RECORDS = 500
const DEFAULT_POLL_MS = 3000

type ViewState = 'idle' | 'live' | 'denied' | 'unavailable'

export interface HostLogViewProps {
  /** Poll interval in milliseconds; 0 turns automatic polling off. */
  pollMs?: number
}

function when(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(timestamp)
}

export default function HostLogView({ pollMs = DEFAULT_POLL_MS }: HostLogViewProps) {
  const logRef = useRef<string | null>(null)
  const cursor = useRef<string | null>(null)
  const busy = useRef(false)
  const [state, setState] = useState<ViewState>('idle')
  const [records, setRecords] = useState<HostLogRecord[]>([])
  const [gap, setGap] = useState(false)

  const dropHeld = useCallback(() => {
    logRef.current = null
    cursor.current = null
    setRecords([])
  }, [])

  const applyBatch = useCallback((batch: HostLogBatch, replace: boolean) => {
    cursor.current = batch.cursor
    if (batch.gap) setGap(true)
    setRecords((held) => (replace || batch.gap ? batch.records : [...held, ...batch.records]).slice(-MAX_HELD_RECORDS))
  }, [])

  const poll = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const fresh = logRef.current === null
          if (fresh) logRef.current = await referenceHostLogs()
          applyBatch(await readHostLogs(logRef.current!, fresh ? null : cursor.current), fresh)
          setState('live')
          return
        } catch (error) {
          const kind = error instanceof HostLogRefusal ? error.kind : 'unavailable'
          if (kind === 'retention_gap' && attempt === 0) {
            // Drop everything held, mark the gap, then take one fresh read.
            dropHeld()
            setGap(true)
            continue
          }
          if (kind === 'workspace_denied') {
            dropHeld()
            setGap(false)
            setState('denied')
          } else {
            dropHeld()
            setState('unavailable')
          }
          return
        }
      }
    } finally {
      busy.current = false
    }
  }, [applyBatch, dropHeld])

  useEffect(() => {
    if (state !== 'live' || pollMs <= 0) return
    const timer = setInterval(() => {
      poll().catch(() => undefined)
    }, pollMs)
    return () => {
      clearInterval(timer)
    }
  }, [state, pollMs, poll])

  // The signed-in session is the credential, so the view reads as soon as it mounts.
  useEffect(() => {
    poll().catch(() => undefined)
  }, [poll])

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4" aria-labelledby="host-log-title">
      <h1 id="host-log-title" className="flex items-center gap-2 text-lg font-semibold">
        <ScrollText className="h-5 w-5" aria-hidden /> Host logs
      </h1>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            poll().catch(() => undefined)
          }}
          disabled={state === 'idle'}
        >
          Refresh
        </Button>
      </div>
      {state === 'denied' && (
        <BlockedState status="blocked" reason="Access denied: the workspace log grant is not valid." />
      )}
      {state === 'unavailable' && (
        <BlockedState status="unavailable" reason="Host logs are unavailable right now. Nothing is shown." />
      )}
      {gap && state === 'live' && (
        <p role="status" data-testid="host-log-gap" className="rounded border border-amber-500/30 p-2 text-sm">
          Log gap: earlier entries were rotated out and are not shown.
        </p>
      )}
      {state === 'live' && (
        <table className="w-full text-left text-sm" data-testid="host-log-table">
          <caption className="sr-only">Host log records</caption>
          <thead>
            <tr>
              <th scope="col">Host</th>
              <th scope="col">Sequence</th>
              <th scope="col">Request</th>
              <th scope="col">Time</th>
              <th scope="col">Severity</th>
              <th scope="col">Message</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.host_instance}:${record.sequence}`}>
                <td>{record.host_instance}</td>
                <td>{record.sequence}</td>
                <td>{record.request}</td>
                <td>{when(record.timestamp)}</td>
                <td>{record.severity}</td>
                <td>{record.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

/**
 * Elevation console (OVERSTORY-IDENTITY-R007).
 *
 * Requests, approves and revokes time-bound elevation through the typed
 * `access.elevation.*` operations. Every answer is a bound receipt: approve
 * submits the digest of the exact request it displays, so a confirmation or
 * step-up can never bind to a different caller or action than the one that
 * requested the elevation. States reuse the shared `StatusMessage` language.
 */
import { useEffect, useState } from 'react'
import { ChevronsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { StatusMessage } from '@/components/ui/status-message'
import {
  invokeIdentity,
  type ElevationReceipt,
  type ElevationScope,
  type IdentityReply,
} from '@/lib/arbora-api/identity'

function scopeLabel(scope: ElevationScope) {
  return `${scope.graph} / ${scope.action}`
}

function expiryLabel(receipt: ElevationReceipt) {
  if (receipt.hard_expires_at_ms == null) return 'No hard expiry reported.'
  const due = new Date(receipt.hard_expires_at_ms).toLocaleString()
  const left =
    typeof receipt.remaining_ms === 'number' ? ` (${Math.max(0, Math.round(receipt.remaining_ms / 1000))} s left)` : ''
  return `Expires ${due}${left}`
}

/** The receipt block every elevation op answers with. */
function Receipt({ receipt, title }: { receipt: ElevationReceipt; title: string }) {
  return (
    <div className="mt-3 space-y-1 rounded-md border p-3 text-sm" data-testid="elevation-receipt">
      <p className="font-medium">{title}</p>
      <p data-testid="receipt-id">{receipt.elevation_id}</p>
      <p>
        Status: {receipt.status} · revision {receipt.revision} · grantee {receipt.grantee}
      </p>
      <p>Scopes: {receipt.scopes.map(scopeLabel).join(', ') || 'none'}</p>
      <p data-testid="receipt-justification">Reason: {receipt.justification}</p>
      <p data-testid="receipt-expiry">{expiryLabel(receipt)}</p>
      <p>
        Span: {Math.round(receipt.span_ms / 1000)} s · requested {new Date(receipt.requested_at_ms).toLocaleString()}
      </p>
      <p data-testid="receipt-digest">Digest: {receipt.request_digest}</p>
      {receipt.approved_at_ms != null && <p>Approved {new Date(receipt.approved_at_ms).toLocaleString()}</p>}
      {receipt.ended_at_ms != null && <p>Ended {new Date(receipt.ended_at_ms).toLocaleString()}</p>}
    </div>
  )
}

/** The non-ready reply states, in the shared status language. */
function ReplyState({ reply, action }: { reply: IdentityReply<unknown>; action: string }) {
  if (reply.kind === 'ready') return null
  if (reply.kind === 'confirmation')
    return (
      <div className="space-y-1">
        <StatusMessage status="pending" label="Confirmation required" detail={reply.message} />
        {reply.url && (
          <a className="text-xs underline" href={reply.url} data-testid="confirm-link">
            Review and confirm this {action} in the console
          </a>
        )}
      </div>
    )
  if (reply.kind === 'step_up')
    return <StatusMessage status="pending" label="Step-up required" detail={reply.message} />
  if (reply.kind === 'forbidden') return <StatusMessage status="denied" detail={reply.message} />
  return <StatusMessage status="error" detail={reply.message} />
}

/** One fetch of the elevation list; every panel re-asks after a mutation. */
function useElevations(revision: number) {
  const [state, setState] = useState<IdentityReply<{ elevations: ElevationReceipt[] }> | null>(null)
  useEffect(() => {
    let active = true
    void invokeIdentity<{ elevations: ElevationReceipt[] }>('access.elevation.list').then((reply) => {
      if (active) setState(reply)
    })
    return () => {
      active = false
    }
  }, [revision])
  return state
}

function ElevationsList({
  state,
  onRefresh,
}: {
  state: IdentityReply<{ elevations: ElevationReceipt[] }>
  onRefresh: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Elevations</CardTitle>
        <CardDescription>
          Every elevation the access service reports, with scope, reason, expiry and revision.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" size="sm" variant="outline" className="mb-3" onClick={onRefresh}>
          Refresh
        </Button>
        {state.kind !== 'ready' && <ReplyState reply={state} action="list" />}
        {state.kind === 'ready' && state.result.elevations.length === 0 && (
          <StatusMessage status="empty" label="No elevations reported." />
        )}
        {state.kind === 'ready' &&
          state.result.elevations.map((receipt) => (
            <div key={receipt.elevation_id} className="mb-3 space-y-1 rounded-md border p-3 text-sm">
              <p className="font-medium">
                {receipt.elevation_id} · {receipt.status}
              </p>
              <p>
                Scopes: {receipt.scopes.map(scopeLabel).join(', ') || 'none'} · revision {receipt.revision}
              </p>
              <p>Reason: {receipt.justification}</p>
              <p>{expiryLabel(receipt)}</p>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

function RequestPanel() {
  const [elevationId, setElevationId] = useState('')
  const [graph, setGraph] = useState('')
  const [action, setAction] = useState<'read' | 'write'>('write')
  const [spanMs, setSpanMs] = useState('')
  const [justification, setJustification] = useState('')
  const [receipt, setReceipt] = useState<ElevationReceipt | null>(null)
  const [reply, setReply] = useState<IdentityReply<unknown> | null>(null)

  const valid = elevationId.trim() !== '' && graph.trim() !== '' && spanMs !== '' && justification.trim() !== ''
  const submit = async () => {
    const next = await invokeIdentity<ElevationReceipt>('access.elevation.request', {
      elevation_id: elevationId.trim(),
      scopes: [{ graph: graph.trim(), action }],
      span_ms: Number(spanMs),
      justification: justification.trim(),
    })
    if (next.kind === 'ready') setReceipt(next.result)
    setReply(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request elevation</CardTitle>
        <CardDescription>
          Ask for a time-bound elevation on one graph; the answer is a bound receipt with the request digest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label htmlFor="elevation-id" className="text-sm font-medium leading-none">
            Elevation id
          </label>
          <Input
            id="elevation-id"
            data-testid="request-elevation-id"
            value={elevationId}
            onChange={(event) => {
              setElevationId(event.target.value)
            }}
            placeholder="stable id for this elevation"
          />
        </div>
        <div className="flex gap-2">
          <div>
            <label htmlFor="elevation-graph" className="text-sm font-medium leading-none">
              Graph
            </label>
            <Input
              id="elevation-graph"
              data-testid="request-graph"
              value={graph}
              onChange={(event) => {
                setGraph(event.target.value)
              }}
              placeholder="graph name"
            />
          </div>
          <div>
            <label htmlFor="elevation-action" className="text-sm font-medium leading-none">
              Action
            </label>
            <select
              id="elevation-action"
              data-testid="request-action"
              value={action}
              onChange={(event) => {
                setAction(event.target.value === 'read' ? 'read' : 'write')
              }}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="write">write</option>
              <option value="read">read</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="elevation-span" className="text-sm font-medium leading-none">
            Span (ms)
          </label>
          <Input
            id="elevation-span"
            data-testid="request-span"
            type="number"
            min="1"
            value={spanMs}
            onChange={(event) => {
              setSpanMs(event.target.value)
            }}
            placeholder="3600000"
          />
        </div>
        <div>
          <label htmlFor="elevation-justification" className="text-sm font-medium leading-none">
            Justification
          </label>
          <Textarea
            id="elevation-justification"
            data-testid="request-justification"
            value={justification}
            onChange={(event) => {
              setJustification(event.target.value)
            }}
            rows={3}
          />
        </div>
        <Button
          type="button"
          disabled={!valid}
          onClick={() => {
            void submit()
          }}
        >
          Request
        </Button>
        {receipt && <Receipt receipt={receipt} title="Request recorded." />}
        {reply && <ReplyState reply={reply} action="request" />}
      </CardContent>
    </Card>
  )
}

function ElevationsPicker({
  state,
  onPick,
  ariaLabel,
}: {
  state: IdentityReply<{ elevations: ElevationReceipt[] }>
  onPick: (id: string) => void
  ariaLabel: string
}) {
  if (state.kind !== 'ready') return <ReplyState reply={state} action="pick" />
  if (state.result.elevations.length === 0) return <StatusMessage status="empty" label="No elevations to act on." />
  return (
    <div>
      <label htmlFor="elevation-pick" className="text-sm font-medium leading-none">
        {ariaLabel}
      </label>
      <select
        id="elevation-pick"
        data-testid="elevation-pick"
        value=""
        onChange={(event) => {
          if (event.target.value) onPick(event.target.value)
        }}
        className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
      >
        <option value="">Select an elevation…</option>
        {state.result.elevations.map((receipt) => (
          <option key={receipt.elevation_id} value={receipt.elevation_id}>
            {receipt.elevation_id} ({receipt.status})
          </option>
        ))}
      </select>
    </div>
  )
}

function SelectedReceipt({ receipt }: { receipt: ElevationReceipt }) {
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm" data-testid="selected-elevation">
      <p>Scopes: {receipt.scopes.map(scopeLabel).join(', ') || 'none'}</p>
      <p>Reason: {receipt.justification}</p>
      <p>{expiryLabel(receipt)}</p>
      <p data-testid="selected-digest">Digest: {receipt.request_digest}</p>
    </div>
  )
}

function ApprovePanel({ revision, onRefresh }: { revision: number; onRefresh: () => void }) {
  const state = useElevations(revision)
  const [selectedId, setSelectedId] = useState('')
  const [receipt, setReceipt] = useState<ElevationReceipt | null>(null)
  const [reply, setReply] = useState<IdentityReply<unknown> | null>(null)
  const selected =
    state?.kind === 'ready' ? (state.result.elevations.find((e) => e.elevation_id === selectedId) ?? null) : null

  const approve = async () => {
    if (!selected) return
    // The approval is bound to the request it displays: the digest of the
    // very elevation shown above goes in the same call as its id.
    const next = await invokeIdentity<ElevationReceipt>('access.elevation.approve', {
      elevation_id: selected.elevation_id,
      request_digest: selected.request_digest,
    })
    if (next.kind === 'ready') setReceipt(next.result)
    setReply(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approve elevation</CardTitle>
        <CardDescription>
          Pick the pending elevation, review its scope, reason and expiry, and approve the exact request it names.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state && (
          <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        )}
        {state && <ElevationsPicker state={state} onPick={setSelectedId} ariaLabel="Elevation to approve" />}
        {selected && <SelectedReceipt receipt={selected} />}
        <Button
          type="button"
          data-testid="approve-button"
          disabled={!selected}
          onClick={() => {
            void approve()
          }}
        >
          Approve
        </Button>
        {receipt && <Receipt receipt={receipt} title="Approval recorded." />}
        {reply && <ReplyState reply={reply} action="approval" />}
      </CardContent>
    </Card>
  )
}

function RevokePanel({ revision, onRefresh }: { revision: number; onRefresh: () => void }) {
  const state = useElevations(revision)
  const [selectedId, setSelectedId] = useState('')
  const [receipt, setReceipt] = useState<ElevationReceipt | null>(null)
  const [reply, setReply] = useState<IdentityReply<unknown> | null>(null)
  const selected =
    state?.kind === 'ready' ? (state.result.elevations.find((e) => e.elevation_id === selectedId) ?? null) : null

  const revoke = async () => {
    if (!selected) return
    const next = await invokeIdentity<ElevationReceipt>('access.elevation.revoke', {
      elevation_id: selected.elevation_id,
    })
    if (next.kind === 'ready') setReceipt(next.result)
    setReply(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revoke elevation</CardTitle>
        <CardDescription>
          End a live elevation early; the receipt records the end time and final revision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state && (
          <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        )}
        {state && <ElevationsPicker state={state} onPick={setSelectedId} ariaLabel="Elevation to revoke" />}
        {selected && <SelectedReceipt receipt={selected} />}
        <Button
          type="button"
          data-testid="revoke-button"
          disabled={!selected}
          onClick={() => {
            void revoke()
          }}
        >
          Revoke
        </Button>
        {receipt && <Receipt receipt={receipt} title="Revocation recorded." />}
        {reply && <ReplyState reply={reply} action="revocation" />}
      </CardContent>
    </Card>
  )
}

export default function ElevationView() {
  const [revision, setRevision] = useState(0)
  const refresh = () => {
    setRevision((value) => value + 1)
  }
  const [listState, setListState] = useState<IdentityReply<{ elevations: ElevationReceipt[] }> | null>(null)
  useEffect(() => {
    let active = true
    void invokeIdentity<{ elevations: ElevationReceipt[] }>('access.elevation.list').then((reply) => {
      if (active) setListState(reply)
    })
    return () => {
      active = false
    }
  }, [revision])

  return (
    <div className="space-y-6" data-testid="elevation-view">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ChevronsUp className="size-6" />
          Elevation
        </h1>
        <p className="text-sm text-muted-foreground">
          Time-bound elevation requests, approvals and revocations; every action answers with a bound receipt.
        </p>
      </div>
      <Tabs defaultValue="elevations">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="elevations">elevations</TabsTrigger>
          <TabsTrigger value="request">request</TabsTrigger>
          <TabsTrigger value="approve">approve</TabsTrigger>
          <TabsTrigger value="revoke">revoke</TabsTrigger>
        </TabsList>
        <TabsContent value="elevations">
          {listState && <ElevationsList state={listState} onRefresh={refresh} />}
        </TabsContent>
        <TabsContent value="request">
          <RequestPanel />
        </TabsContent>
        <TabsContent value="approve">
          <ApprovePanel revision={revision} onRefresh={refresh} />
        </TabsContent>
        <TabsContent value="revoke">
          <RevokePanel revision={revision} onRefresh={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

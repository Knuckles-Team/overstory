import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ServedState } from '@/components/served/ServedState'
import { StatusMessage } from '@/components/ui/status-message'
import { callServed, type ServedReply } from '@/lib/arbora-api/served'
import { safeExternalUrl } from '@/lib/safe-url'
import { RepositoryField } from '@/components/development/RepositoryField'
import {
  EVIDENCE_CLASSES,
  evidenceByClass,
  proposalListSchema,
  proposalReviewSchema,
  type Proposal,
  type ProposalReviewResult,
} from '@/components/views/proposal-schemas'

/**
 * Proposal review (OVERSTORY-DECIDE-R009): lists the learning loop's proposals
 * for a repository, grouped by kind with their evidence, and records an accept
 * or reject through `development.proposal.review`. An accept lands only as the
 * pull request arbora returns; the view holds no file-write or merge call.
 */

function groupByKind(proposals: Proposal[]): [string, Proposal[]][] {
  const groups = new Map<string, Proposal[]>()
  for (const proposal of proposals) {
    const kind = proposal.kind.trim() || ''
    groups.set(kind, [...(groups.get(kind) ?? []), proposal])
  }
  return [...groups.entries()]
}

function EvidenceBlock({ proposal }: { proposal: Proposal }) {
  const grouped = evidenceByClass(proposal.evidence)
  return (
    <dl className="grid gap-1 text-xs">
      {EVIDENCE_CLASSES.map((klass) => (
        <div key={klass.id}>
          <dt className="font-semibold">{klass.label}</dt>
          <dd>
            {grouped[klass.id].length === 0 ? (
              <span className="text-muted-foreground">unavailable</span>
            ) : (
              <ul>
                {grouped[klass.id].map((item) => (
                  <li key={`${item.kind}-${item.record_id}`} className="font-mono">
                    {item.record_id} <span className="text-muted-foreground">{item.digest}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      ))}
      {grouped.other.length > 0 && (
        <div>
          <dt className="font-semibold">Other evidence</dt>
          <dd>
            <ul>
              {grouped.other.map((item) => (
                <li key={`${item.kind}-${item.record_id}`} className="font-mono">
                  {item.kind} {item.record_id}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  )
}

function ReviewOutcome({ reply }: { reply: ServedReply<ProposalReviewResult> }) {
  if (reply.kind === 'ready') {
    const pullRequest = safeExternalUrl(reply.result.pull_request)
    if (reply.result.state === 'rejected')
      return <StatusMessage status="success" label="Rejected." detail="The refusal is recorded." />
    return (
      <div className="text-xs">
        <StatusMessage status="success" label={`Proposal ${reply.result.state}.`} />
        {pullRequest ? (
          <p>
            Pull request:{' '}
            <a href={pullRequest} target="_blank" rel="noreferrer noopener" className="underline">
              {pullRequest}
            </a>
          </p>
        ) : (
          <p className="text-muted-foreground">No pull request link was returned.</p>
        )}
        <p className="text-muted-foreground">Gate state: unavailable (arbora does not serve it).</p>
      </div>
    )
  }
  if (reply.kind === 'error' && reply.code === 'PROPOSAL_DIRECT_WRITE_REFUSED')
    return (
      <StatusMessage
        status="denied"
        label="Refused."
        detail="A proposal lands only as a pull request, never as a direct write."
      />
    )
  return <ServedState reply={reply} what="The review" />
}

function ProposalCard({ proposal, repository }: { proposal: Proposal; repository: string }) {
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()
  const review = useMutation({
    mutationFn: (decision: 'accept' | 'reject') =>
      callServed(
        'development.proposal.review',
        { proposal_id: proposal.id, decision, reason: reason.trim() },
        proposalReviewSchema,
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: (reply) => {
      if (reply.kind === 'ready') void queryClient.invalidateQueries({ queryKey: ['proposals', repository] })
    },
  })
  const reasonValid = reason.trim().length >= 1 && reason.trim().length <= 500
  return (
    <Card className="border-border/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono">{proposal.target || 'unavailable'}</span>
          <Badge variant="outline">{proposal.state}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <EvidenceBlock proposal={proposal} />
        {proposal.state === 'open' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Reason for ${proposal.id}`}
              placeholder="Reason (required)"
              value={reason}
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value)
              }}
              className="h-8 max-w-xs"
            />
            <Button
              size="sm"
              disabled={!reasonValid || review.isPending}
              onClick={() => {
                review.mutate('accept')
              }}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!reasonValid || review.isPending}
              onClick={() => {
                review.mutate('reject')
              }}
            >
              Reject
            </Button>
          </div>
        ) : null}
        {review.data ? <ReviewOutcome reply={review.data} /> : null}
      </CardContent>
    </Card>
  )
}

function ProposalList({ repository }: { repository: string }) {
  const query = useQuery({
    queryKey: ['proposals', repository],
    queryFn: ({ signal }) => callServed('development.proposal.list', { repository }, proposalListSchema, { signal }),
  })
  if (query.isLoading) return <StatusMessage status="loading" />
  if (query.isError) return <StatusMessage status="error" detail="The proposal list could not be read." />
  const reply = query.data
  if (!reply) return null
  if (reply.kind !== 'ready') return <ServedState reply={reply} what="The proposal list" />
  if (reply.result.items.length === 0)
    return <StatusMessage status="empty" label="No proposals for this repository." />
  return (
    <div className="space-y-4">
      {groupByKind(reply.result.items).map(([kind, proposals]) => (
        <section key={kind} aria-label={`Kind ${kind || 'unavailable'}`}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {kind || 'unavailable'} ({proposals.length})
          </h3>
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} repository={repository} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default function ProposalReview() {
  const [repository, setRepository] = useState<string | null>(null)
  return (
    <div className="space-y-4 p-4">
      <RepositoryField onSelect={setRepository} />
      {repository ? (
        <ProposalList repository={repository} />
      ) : (
        <StatusMessage status="empty" label="Choose a repository." />
      )}
    </div>
  )
}

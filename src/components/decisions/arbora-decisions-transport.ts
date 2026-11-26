import { fetchAuthSession } from '@/lib/auth'
import { ArboraApiError, invoke } from '@/lib/arbora-api/invoke'
import { classifyServedError } from '@/lib/arbora-api/served'
import {
  decisionAggregateSchema,
  decisionEvalReceiptPageSchema,
  decisionEvalTimelinePageSchema,
  decisionLogEntrySchema,
  decisionProvenanceSchema,
  servedDecisionListSchema,
  servedWhyNotSchema,
} from './decision-schemas'
import type { DecisionAggregateOptions, DecisionsTransport, ListDecisionsOptions } from './decisions-transport'

/**
 * @file arbora-decisions-transport.ts
 * @description The real `DecisionsTransport` (requirement OVERSTORY-API-R001),
 * calling the five real Arbora decision operations through the shared
 * `invoke()` adapter — no second HTTP/CSRF path, no browser-held service
 * bearer. These were confirmed against the medulla source of truth
 * (not guessed): `eg.coordination.DecisionLog` and `eg.coordination.DecisionEval`
 * each multiplex several named actions through an `op` discriminator field;
 * `eg.query.Decide` and `eg.storage.DecisionCommit` are single-shot. See
 * `specs/arbora-api-consumer/tasks.md` for the full action inventory.
 *
 * The list, provenance and why-not reads use the served `decision.list`,
 * `decision.provenance.get` and `decision.why_not` operations (ARBORA-OPS-R920,
 * R921). Each answers `UNAVAILABLE` until the engine behind it is pinned; that
 * refusal propagates as an `ArboraApiError` for the view to label, and no row,
 * premise or explanation is ever invented. One committed record still reads
 * through `DecisionLog.get`.
 *
 * `eg.*` operations carry a placeholder `{"type":"object"}` schema in the
 * pinned OpenAPI document until arbora and medulla are built from
 * a digest-matched pair (see `src/lib/arbora-api/generated/README.md`), so
 * `invoke()` here validates responses against this repo's own zod schemas
 * (`decision-schemas.ts`), authored directly from the medulla Rust
 * types, not against the generated client's placeholder shape.
 */

/** The caller's tenant, read from the same `/auth/session` the identity
 * broker already answers (see `src/lib/auth.ts`) — no second auth path. */
async function currentTenantId(): Promise<string> {
  const { session } = await fetchAuthSession()
  if (!session?.tenant) throw new ArboraApiError('TENANT_UNKNOWN', 401, false, {})
  return session.tenant
}

const DEFAULT_PAGE_LIMIT = 50

export const arboraDecisionsTransport: DecisionsTransport = {
  async listDecisions(options?: ListDecisionsOptions, signal?: AbortSignal) {
    const page = await invoke(
      'decision.list',
      { question_kind: options?.questionKind ?? null, limit: options?.limit ?? DEFAULT_PAGE_LIMIT },
      servedDecisionListSchema,
      { signal },
    )
    return page.items.map((item) => {
      const decidedAt = Date.parse(item.decided_at)
      return {
        record_id: item.decision_id,
        question_kind: item.question_kind ?? null,
        resolution_kind: item.resolution_kind,
        outcome: typeof item.outcome === 'string' ? item.outcome : null,
        committed_at_ms: Number.isNaN(decidedAt) ? null : decidedAt,
        policy_digest: item.record_digest,
        evidence_class: item.inputs_state,
      }
    })
  },
  async getDecision(recordId: string, signal?: AbortSignal) {
    const tenantId = await currentTenantId()
    const entry = await invoke(
      'eg.coordination.DecisionLog',
      { op: 'get', tenant_id: tenantId, record_id: recordId },
      decisionLogEntrySchema.nullable(),
      { signal },
    )
    if (!entry) throw new ArboraApiError('DECISION_RECORD_NOT_FOUND', 404, false, { record_id: recordId })
    return entry.record
  },
  getDecisionProvenance(recordId: string, signal?: AbortSignal) {
    return invoke('decision.provenance.get', { decision_id: recordId }, decisionProvenanceSchema, { signal })
  },
  async getDecisionAggregate(options?: DecisionAggregateOptions, signal?: AbortSignal) {
    const tenantId = await currentTenantId()
    return invoke(
      'eg.coordination.DecisionLog',
      {
        op: 'aggregate',
        request: {
          tenant_id: tenantId,
          question_id: options?.questionId,
          window: { from_ms: options?.fromMs, to_ms: options?.toMs },
        },
      },
      decisionAggregateSchema,
      { signal },
    )
  },
  async getDecisionEvalReceipts(after?: string, signal?: AbortSignal) {
    const tenantId = await currentTenantId()
    return invoke(
      'eg.coordination.DecisionEval',
      { op: 'receipts', request: { tenant_id: tenantId, after, limit: DEFAULT_PAGE_LIMIT } },
      decisionEvalReceiptPageSchema,
      { signal },
    )
  },
  async getDecisionEvalTimeline(after?: string, signal?: AbortSignal) {
    const tenantId = await currentTenantId()
    return invoke(
      'eg.coordination.DecisionEval',
      { op: 'timeline', request: { tenant_id: tenantId, after, limit: DEFAULT_PAGE_LIMIT } },
      decisionEvalTimelinePageSchema,
      { signal },
    )
  },
  async getWhyNotOnDemand(recordId, request, signal?: AbortSignal) {
    try {
      const answer = await invoke(
        'decision.why_not',
        { decision_id: recordId, option_id: request.componentId, budget_ms: request.budgetMs },
        servedWhyNotSchema,
        { signal },
      )
      if (answer.budget_exhausted) return { kind: 'timeout' }
      return { kind: 'explained', verdict: answer.verdict, reasons: answer.reasons }
    } catch (error) {
      if (error instanceof ArboraApiError && classifyServedError(error).kind !== 'error')
        return { kind: 'refused', reason: `Arbora did not answer (${error.code}).` }
      throw error
    }
  },
}

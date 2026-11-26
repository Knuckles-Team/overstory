import { afterEach, describe, expect, it, vi } from 'vitest'
import { arboraDecisionsTransport } from '../arbora-decisions-transport'
import { baseRecord } from './decisions-fixtures'
import { servedOk, servedUnavailable } from '@/lib/arbora-api/__tests__/served-fixtures'

/**
 * The real `DecisionsTransport` (requirement OVERSTORY-API-R001) against a
 * stubbed `fetch`, exercising the shared `invoke` adapter end to end —
 * no module-level spy on `invoke` itself, the same convention
 * `identity.test.ts` uses for `identity.ts`. Operation ids are the real
 * `eg.coordination.DecisionLog`/`DecisionEval` actions (see
 * `arbora-decisions-transport.ts`'s file doc), not the earlier invented
 * `decide.*` ids.
 */

const meta = { registry_digest: 'registry-digest', api_version: 'v1' }
const session = { authenticated: true, csrf_token: 'session-csrf', tenant: 'tenant-a' }

/** Every call first resolves `/auth/session` (possibly twice: once for this
 * transport's own tenant lookup, once for `invoke()`'s CSRF fetch) before
 * the operation's own `POST /api/v1/ops/...` reply. */
function stubReplies(...opReplies: { status: number; body: unknown }[]) {
  const queue = [...opReplies]
  const fetcher = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/session')) return Promise.resolve(Response.json(session))
    const next = queue.shift()
    if (!next) throw new Error('no more stubbed operation replies')
    return Promise.resolve(Response.json(next.body, { status: next.status }))
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

afterEach(() => vi.unstubAllGlobals())

describe('arboraDecisionsTransport on the shared Arbora invoke adapter', () => {
  // spec: OVERSTORY-DECIDE-R002
  it('lists decisions through the served decision.list and maps each row', async () => {
    const fetcher = stubReplies(
      servedOk({
        items: [
          {
            decision_id: 'dec-1',
            question_kind: 'assemble',
            resolution_kind: 'solved',
            outcome: 'option-a',
            decided_at: '2026-11-20T10:00:00.000Z',
            record_digest: 'sha256:aa',
            inputs_state: 'current',
          },
        ],
        next_cursor: null,
      }),
    )
    const rows = await arboraDecisionsTransport.listDecisions({ questionKind: 'assemble' })
    expect(rows).toEqual([
      expect.objectContaining({
        record_id: 'dec-1',
        question_kind: 'assemble',
        resolution_kind: 'solved',
        outcome: 'option-a',
        committed_at_ms: Date.parse('2026-11-20T10:00:00.000Z'),
      }),
    ])
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(opCall?.[0]).toBe('/api/v1/ops/decision.list')
    expect(JSON.parse(String((opCall?.[1] as RequestInit).body))).toEqual({ question_kind: 'assemble', limit: 50 })
  })

  // spec: OVERSTORY-DECIDE-R002
  it('propagates the served UNAVAILABLE refusal of decision.list and invents no rows', async () => {
    stubReplies(servedUnavailable())
    await expect(arboraDecisionsTransport.listDecisions()).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })

  // spec: OVERSTORY-API-R001
  it('gets one committed decision record via DecisionLog.get, unwrapping the log entry', async () => {
    const fetcher = stubReplies({
      status: 200,
      body: {
        ok: true,
        result: {
          schema_version: 1,
          record: baseRecord,
          committed_by: 'principal:writer-1',
          committed_at_ms: 1,
          visibility: 'tenant',
        },
        meta,
      },
    })
    const record = await arboraDecisionsTransport.getDecision(baseRecord.record_id)
    expect(record.record_id).toBe(baseRecord.record_id)
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(opCall?.[0]).toBe('/api/v1/ops/eg.coordination.DecisionLog')
    expect(opCall?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining(`"op":"get","tenant_id":"tenant-a","record_id":"${baseRecord.record_id}"`),
      }),
    )
  })

  it('throws a typed not-found error when DecisionLog.get returns no entry', async () => {
    stubReplies({ status: 200, body: { ok: true, result: null, meta } })
    await expect(arboraDecisionsTransport.getDecision(baseRecord.record_id)).rejects.toThrow(
      /DECISION_RECORD_NOT_FOUND/,
    )
  })

  it('rejects a malformed record before any view can render it', async () => {
    stubReplies({
      status: 200,
      body: { ok: true, result: { schema_version: 1, record: { record_id: 'only-an-id' } }, meta },
    })
    await expect(arboraDecisionsTransport.getDecision(baseRecord.record_id)).rejects.toThrow()
  })

  // spec: OVERSTORY-DECIDE-R002
  it('reads provenance through decision.provenance.get at the revision the decision used', async () => {
    const fetcher = stubReplies(
      servedOk({
        decision_id: 'dec-1',
        record_digest: 'sha256:aa',
        premises: [{ kind: 'fact', ref: 'node:1', class: 'observed' }],
        facts: [{ node_id: 'node:1', revision: 3, digest: 'sha256:bb' }],
        rules: [{ rule_id: 'rule:cap', version: 2, digest: 'sha256:cc' }],
        approver: null,
        inputs_state: 'current',
      }),
    )
    const provenance = await arboraDecisionsTransport.getDecisionProvenance('dec-1')
    expect(provenance.facts[0]).toEqual({ node_id: 'node:1', revision: 3, digest: 'sha256:bb' })
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(opCall?.[0]).toBe('/api/v1/ops/decision.provenance.get')
  })

  // spec: OVERSTORY-DECIDE-R002
  it('propagates UNAVAILABLE from decision.provenance.get', async () => {
    stubReplies(servedUnavailable())
    await expect(arboraDecisionsTransport.getDecisionProvenance('dec-1')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    })
  })

  it('aggregates outcomes via DecisionLog.aggregate, nesting the request under the tenant window', async () => {
    const fetcher = stubReplies({
      status: 200,
      body: { ok: true, result: { schema_version: 1, min_support: 10, rows: [] }, meta },
    })
    expect((await arboraDecisionsTransport.getDecisionAggregate()).rows).toEqual([])
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(opCall?.[0]).toBe('/api/v1/ops/eg.coordination.DecisionLog')
    expect(opCall?.[1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"op":"aggregate"') }))
  })

  it('fetches independently labeled receipts via DecisionEval.receipts', async () => {
    const fetcher = stubReplies({ status: 200, body: { ok: true, result: { receipts: [], next_after: null }, meta } })
    expect(await arboraDecisionsTransport.getDecisionEvalReceipts()).toEqual({ receipts: [], next_after: null })
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(opCall?.[0]).toBe('/api/v1/ops/eg.coordination.DecisionEval')
    expect(opCall?.[1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"op":"receipts"') }))
  })

  it('fetches the submission-time timeline via DecisionEval.timeline', async () => {
    const fetcher = stubReplies({ status: 200, body: { ok: true, result: { entries: [], next_after: null }, meta } })
    expect(await arboraDecisionsTransport.getDecisionEvalTimeline()).toEqual({ entries: [], next_after: null })
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(opCall?.[0]).toBe('/api/v1/ops/eg.coordination.DecisionEval')
    expect(opCall?.[1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"op":"timeline"') }))
  })

  // spec: OVERSTORY-DECIDE-R004
  it('explains within budget through decision.why_not', async () => {
    const fetcher = stubReplies(
      servedOk({
        decision_id: 'dec-1',
        option_id: 'c1',
        verdict: 'eliminated',
        reasons: [{ kind: 'capacity', detail: 'no free slot' }],
        budget_used_ms: 12,
        budget_exhausted: false,
      }),
    )
    const outcome = await arboraDecisionsTransport.getWhyNotOnDemand('dec-1', {
      componentId: 'c1',
      slot: 's1',
      budgetMs: 100,
    })
    expect(outcome).toEqual({
      kind: 'explained',
      verdict: 'eliminated',
      reasons: [{ kind: 'capacity', detail: 'no free slot' }],
    })
    const opCall = fetcher.mock.calls.find(([input]) => input.toString().includes('/api/v1/ops/'))
    expect(JSON.parse(String((opCall?.[1] as RequestInit).body))).toEqual({
      decision_id: 'dec-1',
      option_id: 'c1',
      budget_ms: 100,
    })
  })

  // spec: OVERSTORY-DECIDE-R004
  it('reports a timeout when the served budget was exhausted', async () => {
    stubReplies(
      servedOk({
        decision_id: 'dec-1',
        option_id: 'c1',
        verdict: 'unknown',
        reasons: [],
        budget_used_ms: 100,
        budget_exhausted: true,
      }),
    )
    const outcome = await arboraDecisionsTransport.getWhyNotOnDemand('dec-1', {
      componentId: 'c1',
      slot: 's1',
      budgetMs: 100,
    })
    expect(outcome).toEqual({ kind: 'timeout' })
  })

  // spec: OVERSTORY-DECIDE-R004
  it('refuses honestly when decision.why_not is unavailable', async () => {
    stubReplies(servedUnavailable())
    const outcome = await arboraDecisionsTransport.getWhyNotOnDemand('dec-1', {
      componentId: 'c1',
      slot: 's1',
      budgetMs: 100,
    })
    expect(outcome).toEqual({ kind: 'refused', reason: expect.stringContaining('UNAVAILABLE') })
  })
})

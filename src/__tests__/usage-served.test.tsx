// spec: OVERSTORY-APPS-R004.8.4
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { servedOk, servedRefusal, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'
import { ServedSessionUsage } from '@/components/usage/ServedSessionUsage'
import { costPerSolved, judgeSessionUsage, readLatencyBound, sessionUsageSchema } from '@/lib/usage-served'

const session = (over: Record<string, unknown> = {}) => ({
  context_id: 's1',
  counts: { input_tokens: 100, cache_read_tokens: 40, output_tokens: 7 },
  count_coverage: { input_tokens: 3, cache_read_tokens: 2, output_tokens: 3 },
  expected_runs: 3,
  recorded_runs: 3,
  missing_runs: 0,
  inventory_complete: true,
  ...over,
})

afterEach(() => vi.unstubAllGlobals())

describe('indexed usage refusal', () => {
  it('test_overlapping_categories_are_listed_never_summed', () => {
    const verdict = judgeSessionUsage(sessionUsageSchema.parse(session()))
    expect(verdict.rows.map((r) => r.name)).toEqual(['cache_read_tokens', 'input_tokens', 'output_tokens'])
    expect(verdict.rows.find((r) => r.name === 'cache_read_tokens')).toMatchObject({ coveredRuns: 2, partial: true })
    expect(verdict.accounting).toBe('complete')
    expect(verdict.attribution).toBe('not-served')
    expect(verdict).not.toHaveProperty('total')
  })

  it('test_incomplete_accounting_stays_explicit', () => {
    const verdict = judgeSessionUsage(
      sessionUsageSchema.parse(
        session({ inventory_complete: false, missing_runs: 2, timing_refusal: 'TIMING_INVALID' }),
      ),
    )
    expect(verdict).toMatchObject({ accounting: 'incomplete', missingRuns: 2, timing: 'refused' })
  })

  it('test_hostile_numbers_are_rejected_not_zeroed', () => {
    for (const bad of [{ counts: { a: -1 } }, { counts: { a: 1.5 } }, { counts: { a: Number.MAX_VALUE } }])
      expect(() => sessionUsageSchema.parse(session(bad))).toThrow()
  })

  it('test_nonpositive_or_nonfinite_latency_limit_makes_analysis_unavailable', () => {
    for (const bad of [undefined, 0, -5, Number.NaN, Infinity, '10'])
      expect(readLatencyBound(bad).status).toBe('unavailable')
    expect(readLatencyBound(250)).toEqual({ status: 'ready', limitMs: 250 })
  })

  it('test_cost_per_solved_abstains_when_nothing_was_solved', () => {
    expect(costPerSolved(10, 0)).toBeNull()
    expect(costPerSolved(null, 4)).toBeNull()
    expect(costPerSolved(10, 4)).toBe(2.5)
  })

  const mount = (reply: { status: number; body: unknown }) => {
    const served = stubServed([reply])
    vi.stubGlobal('fetch', served.fetcher)
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <ServedSessionUsage contextId="s1" />
      </QueryClientProvider>,
    )
    return served
  }

  it('test_panel_labels_incomplete_accounting_and_missing_attribution', async () => {
    const served = mount(
      servedOk({ session: session({ inventory_complete: false, missing_runs: 1, recorded_runs: 2 }) }),
    )
    await screen.findByText(/Incomplete accounting: 1 run not recorded/)
    expect(screen.getByText(/attribution are not part of this read/)).toBeTruthy()
    expect(served.calls[0]?.body).toEqual({ context_id: 's1' })
  })

  it('test_panel_renders_an_unserved_read_as_unavailable_not_empty', async () => {
    mount(servedRefusal('UNAVAILABLE', 503, { reason: 'usage reader is not composed' }))
    await screen.findByText(/Engine session usage is not served yet/)
  })

  it('test_a_mismatched_session_is_an_error_not_a_render', async () => {
    mount(servedOk({ session: session({ context_id: 'other' }) }))
    await waitFor(() => {
      expect(screen.getByText(/could not be read \(SESSION_MISMATCH\)/)).toBeTruthy()
    })
  })
})
